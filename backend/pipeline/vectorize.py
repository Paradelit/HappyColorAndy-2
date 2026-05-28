"""Etapa 4: vectorizacion.

Convierte cada region raster en un path SVG suave:
  region -> mascara binaria -> cv2.findContours (RETR_CCOMP, soporta agujeros)
         -> cv2.approxPolyDP (simplificacion) -> curvas Bezier (Catmull-Rom).

Los agujeros se emiten como subpaths adicionales; el render usa fill-rule
"evenodd" para vaciarlos. La funcion `region_to_path` esta aislada para poder
sustituir el metodo (p.ej. potrace) sin tocar el resto del pipeline.
"""

import cv2
import numpy as np


def _round(v: float) -> float:
    return float(np.round(v, 1))


def _catmull_rom_to_bezier(points) -> str:
    """Convierte un poligono cerrado de puntos en un path de Beziers cubicas.

    `points`: lista de (x, y). Devuelve el subpath SVG ("M ... C ... Z").
    """
    n = len(points)
    if n < 3:
        return ""

    pts = [np.array(p, dtype=np.float64) for p in points]
    d = [f"M {_round(pts[0][0])} {_round(pts[0][1])}"]

    for i in range(n):
        p0 = pts[(i - 1) % n]
        p1 = pts[i]
        p2 = pts[(i + 1) % n]
        p3 = pts[(i + 2) % n]
        # Controles Catmull-Rom -> Bezier (tension estandar 1/6).
        c1 = p1 + (p2 - p0) / 6.0
        c2 = p2 - (p3 - p1) / 6.0
        d.append(
            f"C {_round(c1[0])} {_round(c1[1])} "
            f"{_round(c2[0])} {_round(c2[1])} "
            f"{_round(p2[0])} {_round(p2[1])}"
        )
    d.append("Z")
    return " ".join(d)


def region_to_path(mask: np.ndarray, simplify_tol: float = 1.5) -> str:
    """Mascara binaria de una region -> path SVG (outer + holes), o "" si nula."""
    m = (mask.astype(np.uint8)) * 255
    contours, hierarchy = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return ""

    subpaths = []
    for cnt in contours:
        if cv2.contourArea(cnt) < 2:
            continue
        approx = cv2.approxPolyDP(cnt, epsilon=simplify_tol, closed=True)
        pts = approx.reshape(-1, 2)
        if len(pts) < 3:
            continue
        sub = _catmull_rom_to_bezier([(float(x), float(y)) for x, y in pts])
        if sub:
            subpaths.append(sub)

    return " ".join(subpaths)


def vectorize(region_map, n_regions: int, simplify_tol: float = 1.5):
    """Genera el path SVG de cada region.

    Returns:
        dict region_id -> path string ("d"). Regiones sin contorno valido se omiten.
    """
    paths = {}
    for rid in range(n_regions):
        mask = region_map == rid
        if not mask.any():
            continue
        d = region_to_path(mask, simplify_tol=simplify_tol)
        if d:
            paths[rid] = d
    return paths
