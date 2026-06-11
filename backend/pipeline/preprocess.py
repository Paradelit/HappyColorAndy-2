"""Etapa 1: preprocesado (sin OpenCV).

Orienta la imagen segun EXIF, la reescala a un tamano de trabajo manejable y
la aplana con denoising por Variacion Total (TV). El denoising TV produce
regiones planas a trozos (piecewise-constant), justo el aspecto de "poster
disenado" que buscamos antes de cuantizar; sustituye al mean-shift de OpenCV.
"""

import numpy as np
from PIL import Image, ImageOps
from scipy.ndimage import median_filter


def load_rgb(file_bytes: bytes) -> np.ndarray:
    """Carga bytes de imagen -> array RGB uint8 (H, W, 3), corrigiendo EXIF."""
    from io import BytesIO

    img = Image.open(BytesIO(file_bytes))
    img = ImageOps.exif_transpose(img)  # respeta la orientacion de la camara
    img = img.convert("RGB")
    return np.asarray(img)


def resize_longest(rgb: np.ndarray, longest: int) -> np.ndarray:
    """Reescala para que el borde mas largo mida `longest` px (solo reduce)."""
    h, w = rgb.shape[:2]
    cur = max(h, w)
    if cur <= longest:
        return rgb
    scale = longest / float(cur)
    new_w = max(1, int(round(w * scale)))
    new_h = max(1, int(round(h * scale)))
    im = Image.fromarray(rgb).resize((new_w, new_h), Image.LANCZOS)
    return np.asarray(im)


def smooth(rgb: np.ndarray, size: int = 3) -> np.ndarray:
    """Aplana el ruido PRESERVANDO los bordes (mediana ligera + TV suave).

    La mediana quita el speckle; el denoising por Variacion Total con peso BAJO
    aplana el grano de las zonas lisas (cielos, degradados) sin derretir los
    bordes -> las fronteras de la posterizacion salen como curvas limpias en
    vez de "gusanos" de ruido.
    """
    from skimage.restoration import denoise_tv_chambolle

    out = median_filter(rgb, size=(size, size, 1))
    out = denoise_tv_chambolle(out.astype(np.float64) / 255.0, weight=0.13, channel_axis=-1)
    return np.clip(np.round(out * 255.0), 0, 255).astype(np.uint8)


def preprocess(file_bytes: bytes, process_size: int = 1200, denoise: bool = True) -> np.ndarray:
    """Devuelve la imagen RGB lista para cuantizar.

    `denoise=False` salta el suavizado: util cuando la entrada ya es una
    ilustracion limpia (modo IA), para no emborronar sus lineas nitidas.
    """
    rgb = load_rgb(file_bytes)
    rgb = resize_longest(rgb, process_size)
    if denoise:
        rgb = smooth(rgb)
    return rgb
