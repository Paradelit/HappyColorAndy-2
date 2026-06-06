"""Etapa 1: preprocesado (sin OpenCV).

Orienta la imagen segun EXIF, la reescala a un tamano de trabajo manejable y
la aplana con denoising por Variacion Total (TV). El denoising TV produce
regiones planas a trozos (piecewise-constant), justo el aspecto de "poster
disenado" que buscamos antes de cuantizar; sustituye al mean-shift de OpenCV.
"""

import numpy as np
from PIL import Image, ImageOps
from skimage.restoration import denoise_tv_chambolle


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


def smooth(rgb: np.ndarray, weight: float = 0.12) -> np.ndarray:
    """Aplana gradientes y ruido preservando bordes (denoising TV).

    `weight` mayor => mas plano (mas regiones grandes); menor => mas detalle.
    """
    f = rgb.astype(np.float32) / 255.0
    out = denoise_tv_chambolle(f, weight=weight, channel_axis=-1)
    return (np.clip(out, 0.0, 1.0) * 255.0).astype(np.uint8)


def preprocess(file_bytes: bytes, process_size: int = 1200) -> np.ndarray:
    """Devuelve la imagen RGB lista para cuantizar."""
    rgb = load_rgb(file_bytes)
    rgb = resize_longest(rgb, process_size)
    rgb = smooth(rgb)
    return rgb
