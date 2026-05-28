"""Etapa 2: cuantizacion de color (sin OpenCV).

Reduce la imagen a una paleta pequena (~24 colores) con k-means en espacio LAB
(via scikit-image), donde las distancias euclideas se aproximan a la percepcion
humana. Devuelve un mapa de etiquetas (pixel -> indice de paleta) y la paleta.
"""

import numpy as np
from skimage.color import lab2rgb, rgb2lab
from sklearn.cluster import MiniBatchKMeans


def _hex(r: int, g: int, b: int) -> str:
    return "#%02x%02x%02x" % (int(r), int(g), int(b))


def quantize(rgb: np.ndarray, n_colors: int = 24, seed: int = 42):
    """Cuantiza a `n_colors`.

    Returns:
        label_image (H, W) int32  -> indice de paleta por pixel
        palette     list[dict]    -> [{index, hex, rgb:[r,g,b]}]
    """
    h, w = rgb.shape[:2]
    lab = rgb2lab(rgb.astype(np.float64) / 255.0).reshape(-1, 3).astype(np.float32)

    n_colors = max(2, min(n_colors, 120))
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
    centers_lab = km.cluster_centers_.reshape(1, -1, 3).astype(np.float64)
    centers_rgb = (np.clip(lab2rgb(centers_lab), 0.0, 1.0) * 255.0).reshape(-1, 3)
    centers_rgb = np.round(centers_rgb).astype(np.uint8)

    palette = []
    for i, (r, g, b) in enumerate(centers_rgb):
        palette.append({"index": i, "hex": _hex(r, g, b), "rgb": [int(r), int(g), int(b)]})

    return label_image, palette
