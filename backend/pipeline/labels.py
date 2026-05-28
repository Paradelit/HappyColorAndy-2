"""Etapa 5: colocacion del numero (sin OpenCV).

Para cada region calcula el "polo de inaccesibilidad": el punto interior mas
lejano a cualquier borde (= centro del mayor circulo inscrito), el mejor sitio
para centrar el numero sin tocar el contorno, incluso en regiones concavas o con
agujeros.

Se obtiene con la transformada de distancia euclidea (scipy) sobre la mascara:
el pixel de maxima distancia es el centro y su valor es el radio inscrito. Para
ser rapido, cada region se recorta a su bounding box (find_objects). La mascara
se rodea de un borde de ceros para que el limite cuente como borde y el numero
no quede pegado al filo. El tamano de fuente escala con el radio; si es muy
pequeno se omite el numero (la region sigue siendo pintable).
"""

import numpy as np
from scipy.ndimage import distance_transform_edt, find_objects

MIN_RADIUS = 6.0   # radio inscrito minimo para mostrar numero
FONT_MIN = 9.0
FONT_MAX = 42.0


def label_for_region(mask, ox=0, oy=0):
    """Devuelve {x, y, size} (trasladado por ox, oy) o None si es muy pequena."""
    padded = np.pad(mask.astype(bool), 1, mode="constant", constant_values=False)
    dist = distance_transform_edt(padded)
    flat_idx = int(np.argmax(dist))
    max_val = float(dist.flat[flat_idx])
    if max_val < MIN_RADIUS:
        return None
    row, col = np.unravel_index(flat_idx, dist.shape)
    size = float(np.clip(max_val * 1.2, FONT_MIN, FONT_MAX))
    return {
        "x": float(np.round(col - 1 + ox, 1)),  # -1 padding, +offset bbox
        "y": float(np.round(row - 1 + oy, 1)),
        "size": float(np.round(size, 1)),
    }


def labels_for_regions(region_map, n_regions: int):
    """dict region_id -> {x, y, size}. Omite regiones sin etiqueta valida."""
    slices = find_objects(region_map + 1)  # +1: la etiqueta 0 no es "fondo"
    out = {}
    for rid in range(min(n_regions, len(slices))):
        sl = slices[rid]
        if sl is None:
            continue
        sub = region_map[sl] == rid
        if not sub.any():
            continue
        oy, ox = sl[0].start, sl[1].start
        lab = label_for_region(sub, ox=ox, oy=oy)
        if lab is not None:
            out[rid] = lab
    return out
