"""Etapa 4: vectorizacion (sin OpenCV).

Convierte cada region raster en un path SVG suave:
  region -> mascara -> skimage.measure.find_contours (marching squares)
         -> simplificacion Douglas-Peucker (shapely) -> Bezier (Catmull-Rom).

Para ser rapido, cada region se recorta a su bounding box (find_objects) y se
procesa solo ese recorte; las coordenadas se trasladan luego a la imagen.

La mascara se rellena con un borde de ceros para que las regiones que tocan el
filo produzcan contornos cerrados. Los agujeros aparecen como contornos
adicionales (subpaths) y el render usa fill-rule "evenodd" para vaciarlos.
"""

import numpy as np
from scipy.ndimage import find_objects
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


def region_to_path(mask, ox=0, oy=0, simplify_tol: float = 1.5, min_area: float = 2.0) -> str:
    """Mascara (recorte) de una region -> path SVG, trasladado por (ox, oy)."""
    padded = np.pad(mask.astype(np.uint8), 1, mode="constant", constant_values=0)
    # find_contours devuelve loops cerrados de coords (fila, columna) en float.
    contours = find_contours(padded, level=0.5)
    if not contours:
        return ""

    subpaths = []
    for c in contours:
        # (fila, col) -> (x, y): -1 por el padding, +offset del bounding box.
        pts = [(float(col) - 1.0 + ox, float(row) - 1.0 + oy) for row, col in c]
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
    """Genera el path SVG de cada region (procesando solo su bounding box).

    Returns:
        dict region_id -> path string ("d"). Regiones sin contorno valido se omiten.
    """
    slices = find_objects(region_map + 1)  # +1: la etiqueta 0 no es "fondo"
    paths = {}
    for rid in range(min(n_regions, len(slices))):
        sl = slices[rid]
        if sl is None:
            continue
        sub = region_map[sl] == rid
        if not sub.any():
            continue
        oy, ox = sl[0].start, sl[1].start
        d = region_to_path(sub, ox=ox, oy=oy, simplify_tol=simplify_tol)
        if d:
            paths[rid] = d
    return paths
