"""Etapa 2: cuantizacion de color (sin OpenCV).

Reduce la imagen a una paleta pequena con k-means en espacio LAB y produce un
mapa de etiquetas limpio. Dos ideas clave para acercarnos a la calidad
"Happy Color":

1. Muestreo ponderado por bordes: al entrenar k-means se da mas peso a los
   pixeles cerca de bordes/detalle (caras, rasgos) y menos a las zonas planas
   (fondos). Asi los colores "tienen sentido" en vez de gastarse en 20 grises
   casi identicos del fondo.

2. Filtro de mayoria sobre el mapa de etiquetas: cada pixel toma la etiqueta
   mas frecuente de su vecindad. Esto aplana la textura (acuarela, ruido) en
   zonas limpias y suaviza las fronteras -> menos "confeti", regiones grandes.
"""

import numpy as np
from skimage.color import lab2rgb, rgb2gray, rgb2lab
from skimage.filters import sobel
from skimage.filters.rank import majority
from skimage.morphology import disk
from sklearn.cluster import MiniBatchKMeans

SAMPLE_SIZE = 60000  # pixeles para entrenar k-means


def _hex(r: int, g: int, b: int) -> str:
    return "#%02x%02x%02x" % (int(r), int(g), int(b))


def quantize(rgb, n_colors=24, seed=42, detail_bias=4.0, clean_radius=2):
    """Cuantiza a `n_colors`.

    Args:
        detail_bias: cuanto se prioriza el detalle/bordes al elegir colores
            (0 = uniforme; mayor = mas resolucion de color en caras/rasgos).
        clean_radius: radio del filtro de mayoria para limpiar fronteras
            (0 lo desactiva; mayor = mas limpio pero pierde detalle fino).

    Returns:
        label_image (H, W) int32  -> indice de paleta por pixel
        palette     list[dict]    -> [{index, hex, rgb:[r,g,b]}]
    """
    h, w = rgb.shape[:2]
    n_colors = max(2, min(n_colors, 120))

    lab_img = rgb2lab(rgb.astype(np.float64) / 255.0)
    flat = lab_img.reshape(-1, 3).astype(np.float32)

    # Pesos de muestreo: mas probabilidad cerca de bordes (detalle).
    grad = sobel(rgb2gray(rgb.astype(np.float64) / 255.0))
    grad = grad / (grad.max() + 1e-6)
    weights = 1.0 + detail_bias * grad.reshape(-1)
    weights /= weights.sum()

    rng = np.random.default_rng(seed)
    n_sample = min(flat.shape[0], SAMPLE_SIZE)
    idx = rng.choice(flat.shape[0], size=n_sample, replace=True, p=weights)

    km = MiniBatchKMeans(
        n_clusters=n_colors, random_state=seed, n_init=3, max_iter=100, batch_size=4096
    )
    km.fit(flat[idx])
    labels = km.predict(flat)
    label_image = labels.reshape(h, w).astype(np.int32)

    # Limpieza de fronteras: filtro de mayoria (vota la etiqueta mas comun).
    if clean_radius and clean_radius > 0 and n_colors <= 256:
        smoothed = majority(label_image.astype(np.uint8), disk(int(clean_radius)))
        label_image = smoothed.astype(np.int32)

    # Centroides LAB -> RGB para la paleta.
    centers_lab = km.cluster_centers_.reshape(1, -1, 3).astype(np.float64)
    centers_rgb = (np.clip(lab2rgb(centers_lab), 0.0, 1.0) * 255.0).reshape(-1, 3)
    centers_rgb = np.round(centers_rgb).astype(np.uint8)

    palette = []
    for i, (r, g, b) in enumerate(centers_rgb):
        palette.append({"index": i, "hex": _hex(r, g, b), "rgb": [int(r), int(g), int(b)]})

    return label_image, palette
