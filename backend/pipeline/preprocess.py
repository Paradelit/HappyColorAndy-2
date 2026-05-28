"""Etapa 1: preprocesado.

Orienta la imagen segun EXIF, la reescala a un tamano de trabajo manejable y
la suaviza preservando bordes. El suavizado (mean-shift + bilateral) es lo que
convierte una foto con gradientes y ruido en zonas de color planas, dando el
aspecto de "poster disenado" en lugar de un trazado automatico ruidoso.
"""

import cv2
import numpy as np
from PIL import Image, ImageOps


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
    return cv2.resize(rgb, (new_w, new_h), interpolation=cv2.INTER_AREA)


def smooth(rgb: np.ndarray, sp: int = 18, sr: int = 32) -> np.ndarray:
    """Suavizado preservando bordes.

    1) pyrMeanShiftFiltering: colapsa gradientes en mesetas de color plano.
    2) bilateralFilter: limpia el ruido residual sin difuminar bordes.

    OpenCV trabaja en BGR; convertimos de ida y vuelta.
    """
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    shifted = cv2.pyrMeanShiftFiltering(bgr, sp=sp, sr=sr)
    filtered = cv2.bilateralFilter(shifted, d=9, sigmaColor=75, sigmaSpace=75)
    return cv2.cvtColor(filtered, cv2.COLOR_BGR2RGB)


def preprocess(file_bytes: bytes, process_size: int = 1200) -> np.ndarray:
    """Devuelve la imagen RGB lista para cuantizar."""
    rgb = load_rgb(file_bytes)
    rgb = resize_longest(rgb, process_size)
    rgb = smooth(rgb)
    return rgb
