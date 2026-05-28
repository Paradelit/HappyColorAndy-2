"""Etapa 5: colocacion del numero.

Para cada region calcula el "polo de inaccesibilidad": el punto interior mas
lejano a cualquier borde (= centro del mayor circulo inscrito). Es el mejor
sitio para centrar el numero sin que toque el contorno, incluso en regiones
concavas o con agujeros.

Se obtiene con la transformada de distancia sobre la mascara raster: el pixel de
maxima distancia es el centro y su valor es el radio inscrito. El tamano de
fuente escala con ese radio; si el radio es muy pequeno, se omite el numero
(pero la region sigue siendo pintable).
"""

import cv2
import numpy as np

MIN_RADIUS = 6.0   # radio inscrito minimo para mostrar numero
FONT_MIN = 9.0
FONT_MAX = 42.0


def label_for_region(mask: np.ndarray):
    """Devuelve {x, y, size} o None si la region es demasiado pequena."""
    m = (mask.astype(np.uint8)) * 255
    # Borde de ceros: asi el limite de la imagen cuenta como borde y el numero
    # nunca queda pegado al filo (donde se cortaria).
    padded = cv2.copyMakeBorder(m, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=0)
    dist = cv2.distanceTransform(padded, cv2.DIST_L2, 5)
    _, max_val, _, max_loc = cv2.minMaxLoc(dist)
    if max_val < MIN_RADIUS:
        return None
    # El numero centrado cabe comodamente en ~1.2x el radio inscrito.
    size = float(np.clip(max_val * 1.2, FONT_MIN, FONT_MAX))
    return {
        "x": float(np.round(max_loc[0] - 1, 1)),  # descontar el padding
        "y": float(np.round(max_loc[1] - 1, 1)),
        "size": float(np.round(size, 1)),
    }


def labels_for_regions(region_map, n_regions: int):
    """dict region_id -> {x, y, size}. Omite regiones sin etiqueta valida."""
    out = {}
    for rid in range(n_regions):
        mask = region_map == rid
        if not mask.any():
            continue
        lab = label_for_region(mask)
        if lab is not None:
            out[rid] = lab
    return out
