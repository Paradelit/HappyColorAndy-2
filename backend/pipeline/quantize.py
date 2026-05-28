"""Etapa 2: cuantizacion de color.

Reduce la imagen a una paleta pequena (~24 colores) con k-means en espacio LAB,
donde las distancias euclideas se aproximan a la percepcion humana. Devuelve un
mapa de etiquetas (cada pixel -> indice de paleta) y la paleta en hex/RGB.
"""

import cv2
import numpy as np
from sklearn.cluster import MiniBatchKMeans


def _rgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)


def _lab_to_rgb(lab: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(lab, cv2.COLOR_LAB2RGB)


def _hex(r: int, g: int, b: int) -> str:
    return "#%02x%02x%02x" % (int(r), int(g), int(b))


def quantize(rgb: np.ndarray, n_colors: int = 24, seed: int = 42):
    """Cuantiza a `n_colors`.

    Returns:
        label_image (H, W) int32  -> indice de paleta por pixel
        palette     list[dict]    -> [{index, hex, rgb:[r,g,b]}]
    """
    h, w = rgb.shape[:2]
    lab = _rgb_to_lab(rgb).reshape(-1, 3).astype(np.float32)

    n_colors = max(2, min(n_colors, 64))
    km = MiniBatchKMeans(
        n_clusters=n_colors,
        random_state=seed,
        n_init=3,
        max_iter=100,
        batch_size=4096,
    )
    labels = km.fit_predict(lab)
    label_image = labels.reshape(h, w).astype(np.int32)

    # Centroides LAB -> RGB para la paleta.
    centers_lab = km.cluster_centers_.reshape(1, -1, 3).astype(np.uint8)
    centers_rgb = _lab_to_rgb(centers_lab).reshape(-1, 3)

    palette = []
    for i, (r, g, b) in enumerate(centers_rgb):
        palette.append({"index": i, "hex": _hex(r, g, b), "rgb": [int(r), int(g), int(b)]})

    return label_image, palette
