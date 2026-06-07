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

# Prompt afinable: pide ilustracion plana, limpia y SIMPLE (pocas formas grandes).
PROMPT = (
    "Redraw this photo as a clean, simple color-by-number illustration in the style "
    "of the Happy Color app. Use bold black outlines and LARGE flat areas of solid "
    "color with a limited palette (about 20-30 colors). Strongly simplify everything: "
    "remove all photographic texture, noise and grain; turn fur, bark and foliage into "
    "a few large simple flat shapes instead of many tiny details. Clean vector-like "
    "cartoon look. Keep the same composition, subject, pose and overall colors as the "
    "original photo."
)

# Cadena de modelos Gemini (el mejor primero; si uno falla/sin cuota, pasa al
# siguiente). Se puede forzar uno solo con la variable STYLIZE_MODEL.
GEMINI_MODELS = [
    "gemini-3.1-flash-image",  # Nano Banana 2 (primario)
    "gemini-3-pro-image",      # Nano Banana Pro (backup, mas calidad/menos cuota)
    "gemini-2.5-flash-image",  # Nano Banana (backup)
]

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


def _extract_image(resp):
    """Saca los bytes de imagen de la respuesta de Gemini, o None."""
    parts = getattr(resp, "parts", None)
    if not parts:
        candidates = getattr(resp, "candidates", None) or []
        parts = candidates[0].content.parts if candidates else []
    for part in parts:
        inline = getattr(part, "inline_data", None)
        if inline is not None and getattr(inline, "data", None):
            return inline.data
    return None


def _stylize_gemini(image_bytes: bytes) -> bytes:
    """Google Gemini con cadena de modelos (free tier). Import perezoso."""
    try:
        from google import genai
        from google.genai import types
    except ImportError:
        raise RuntimeError(
            "Falta la libreria 'google-genai'. Instalala con: pip install google-genai"
        )

    client = genai.Client(api_key=os.environ["STYLIZE_API_KEY"])
    # Si se fuerza un modelo concreto, se usa solo ese; si no, la cadena completa.
    forced = os.environ.get("STYLIZE_MODEL")
    models = [forced] if forced else GEMINI_MODELS

    # Normaliza a PNG para enviar.
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    part_img = types.Part.from_bytes(data=buf.getvalue(), mime_type="image/png")

    last_err = None
    for model in models:
        try:
            resp = client.models.generate_content(model=model, contents=[PROMPT, part_img])
            data = _extract_image(resp)
            if data:
                return data
            last_err = RuntimeError(f"{model}: la respuesta no traia imagen")
        except Exception as exc:  # noqa: BLE001 - probamos el siguiente modelo
            last_err = RuntimeError(f"{model}: {exc}")
            continue

    msg = str(last_err)
    if "429" in msg or "RESOURCE_EXHAUSTED" in msg or "limit: 0" in msg:
        hint = (" -> La generacion de imagenes de Gemini necesita FACTURACION activada "
                "(free tier = 0). Activala en https://aistudio.google.com (Plan -> Upgrade) "
                "y entra en cuota gratis de Nano Banana.")
    else:
        hint = ""
    raise RuntimeError(
        f"Todos los modelos Gemini fallaron ({', '.join(models)}). Ultimo error: {last_err}{hint}"
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
