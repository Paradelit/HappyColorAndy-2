"""Paso OPCIONAL de IA: foto -> ilustracion limpia (estilo coloring-book).

Convierte la foto en una ilustracion de colores planos y contornos limpios
ANTES del pipeline de color-by-number. Es lo que acerca el resultado a Happy
Color, que parte de ilustraciones (no de fotos). El resto del pipeline ya sabe
sacar regiones limpias + color fiel de una ilustracion plana.

Pluggable por proveedor via variables de entorno (no se activa sin clave):
  STYLIZE_API_KEY   clave del proveedor (obligatoria para activarlo)
  STYLIZE_PROVIDER  "openai" (por defecto)
  STYLIZE_MODEL     "gpt-image-1" (por defecto, para openai)

Asi el backend funciona igual sin clave (pipeline normal) y, en cuanto se
configura la clave, el frontend puede pedir el modo ilustracion.
"""

import base64
import io
import os

from PIL import Image

# Prompt afinable: pide ilustracion plana y limpia conservando la composicion.
PROMPT = (
    "Redraw this image as a clean color-by-number style illustration. "
    "Use bold, smooth black outlines and large flat areas of solid color. "
    "Strongly simplify shapes and remove ALL photographic texture, noise and grain "
    "(fur, bark, foliage become simple flat shapes). "
    "Coloring-book / cartoon illustration look, like the Happy Color app. "
    "Keep the same composition, subject, pose and overall colors as the original."
)

# Tamanos soportados por gpt-image-1 segun proporcion.
_SIZES = {"square": "1024x1024", "landscape": "1536x1024", "portrait": "1024x1536"}


def stylize_available() -> bool:
    """True si hay clave configurada (el modo ilustracion puede usarse)."""
    return bool(os.environ.get("STYLIZE_API_KEY"))


def _pick_size(image_bytes: bytes) -> str:
    with Image.open(io.BytesIO(image_bytes)) as im:
        w, h = im.size
    if w > h * 1.2:
        return _SIZES["landscape"]
    if h > w * 1.2:
        return _SIZES["portrait"]
    return _SIZES["square"]


def stylize(image_bytes: bytes) -> bytes:
    """Devuelve los bytes PNG de la ilustracion generada. Lanza si falla."""
    provider = os.environ.get("STYLIZE_PROVIDER", "openai").lower()
    if provider == "openai":
        return _stylize_openai(image_bytes)
    raise ValueError(f"STYLIZE_PROVIDER no soportado: {provider!r}")


def _stylize_openai(image_bytes: bytes) -> bytes:
    # Import perezoso: el backend arranca aunque no este instalado 'openai'.
    from openai import OpenAI

    client = OpenAI(api_key=os.environ["STYLIZE_API_KEY"])
    model = os.environ.get("STYLIZE_MODEL", "gpt-image-1")

    buf = io.BytesIO(image_bytes)
    buf.name = "input.png"
    resp = client.images.edit(
        model=model,
        image=buf,
        prompt=PROMPT,
        size=_pick_size(image_bytes),
    )
    return base64.b64decode(resp.data[0].b64_json)
