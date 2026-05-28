"""Etapa 4: vectorizacion (sin OpenCV).

Convierte cada region raster en un path SVG suave:
  region -> mascara -> skimage.measure.find_contours (marching squares)
         -> simplificacion Douglas-Peucker (shapely) -> Bezier (Catmull-Rom).

La mascara se rellena con un borde de ceros para que las regiones que tocan el
filo de la imagen produzcan contornos cerrados. Los agujeros aparecen como
contornos adicionales y se emiten como subpaths; el render usa fill-rule
"evenodd" para vaciarlos. `region_to_path` esta aislada para poder sustituir el
metodo (p.ej. potrace) sin tocar el resto del pipeline.
"""

import numpy as np
from shapely.geometry import LinearRing, Polygon
from skimage.measure import find_contours


def _round(v: float) -> float:
    return float(np.round(v, 1))


def _catmull_rom_to_bezier(points) -> str:
    """Poligono cerrado de puntos -> subpath SVG ("M ... C ... Z")."""
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


def region_to_path(mask: np.ndarray, simplify_tol: float = 1.5, min_area: float = 2.0) -> str:
    """Mascara binaria de una region -> path SVG (outer + holes), o "" si nula."""
    padded = np.pad(mask.astype(np.uint8), 1, mode="constant", constant_values=0)
    # find_contours devuelve loops cerrados de coords (fila, columna) en float.
    contours = find_contours(padded, level=0.5)
    if not contours:
        return ""

    subpaths = []
    for c in contours:
        # (fila, col) -> (x, y), descontando el padding de 1 px.
        pts = [(float(col) - 1.0, float(row) - 1.0) for row, col in c]
        if len(pts) < 4:
            continue
        try:
            ring = LinearRing(pts)
        except Exception:
            continue
        simp = ring.simplify(simplify_tol, preserve_topology=False)
        coords = list(simp.coords)
        if len(coords) < 4:
            continue
        if Polygon(coords).area < min_area:
            continue
        # coords cierra repitiendo el primer punto: lo quitamos para Catmull-Rom.
        sub = _catmull_rom_to_bezier(coords[:-1])
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
