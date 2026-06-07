"""Paso OPCIONAL de IA: foto -> ilustracion limpia (estilo coloring-book).

Convierte la foto en una ilustracion de colores planos y contornos limpios
ANTES del pipeline de color-by-number. Es lo que acerca el resultado a Happy
Color, que parte de ilustraciones (no de fotos). El resto del pipeline ya sabe
sacar regiones limpias + color fiel de una ilustracion plana.

Pluggable por proveedor via variables de entorno (no se activa sin clave):
  STYLIZE_API_KEY   clave del proveedor (obligatoria para activarlo)
  STYLIZE_PROVIDER  "gemini" (por defecto, free tier de Google AI Studio) | "openai"
  STYLIZE_MODEL     modelo a usar (por defecto segun proveedor)

Proveedor por defecto: Google Gemini (modelo de imagen "Nano Banana"), que tiene
free tier generoso. OpenAI queda como alternativa (de pago).

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
    provider = os.environ.get("STYLIZE_PROVIDER", "gemini").lower()
    if provider == "gemini":
        return _stylize_gemini(image_bytes)
    if provider == "openai":
        return _stylize_openai(image_bytes)
    raise ValueError(f"STYLIZE_PROVIDER no soportado: {provider!r}")


def _stylize_gemini(image_bytes: bytes) -> bytes:
    """Google Gemini (free tier de Google AI Studio). Import perezoso."""
    try:
        from google import genai
        from google.genai import types
    except ImportError:
        raise RuntimeError(
            "Falta la libreria 'google-genai'. Instalala con: pip install google-genai"
        )

    client = genai.Client(api_key=os.environ["STYLIZE_API_KEY"])
    # "Nano Banana" preview: tiene cuota diaria GRATIS (~2000/dia). La version GA
    # (gemini-2.5-flash-image) requiere facturacion -> da 429 en free tier.
    model = os.environ.get("STYLIZE_MODEL", "gemini-2.5-flash-image-preview")

    # Normaliza a PNG para enviar.
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG")

    try:
        resp = client.models.generate_content(
            model=model,
            contents=[PROMPT, types.Part.from_bytes(data=buf.getvalue(), mime_type="image/png")],
        )
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            f"Gemini fallo (modelo '{model}'). Revisa la clave, el modelo o la cuota. Detalle: {exc}"
        )

    candidates = getattr(resp, "candidates", None) or []
    if not candidates:
        fb = getattr(resp, "prompt_feedback", None)
        raise RuntimeError(f"Gemini no devolvio resultado (posible bloqueo de contenido). {fb or ''}".strip())

    for part in candidates[0].content.parts:
        inline = getattr(part, "inline_data", None)
        if inline is not None and inline.data:
            return inline.data
    raise RuntimeError(
        f"Gemini no devolvio imagen con el modelo '{model}'. "
        "Prueba otro modelo con STYLIZE_MODEL (p.ej. gemini-2.0-flash-preview-image-generation)."
    )


def _stylize_openai(image_bytes: bytes) -> bytes:
    """OpenAI gpt-image-1 (alternativa de pago). Import perezoso."""
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
