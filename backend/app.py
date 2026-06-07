"""Backend FastAPI: foto -> color-by-number SVG (JSON).

Endpoints:
  GET  /health    -> sanity check
  POST /generate  -> sube imagen (multipart) + knobs -> JSON del color-by-number
  POST /preview   -> igual pero devuelve un PNG coloreado de las regiones
                     (util para ajustar calidad: n_colors / min_area_pct)

Ejecutar local:
  cd backend && pip install -r requirements.txt
  uvicorn app:app --reload --port 8000
"""

import io
import os
from pathlib import Path

import numpy as np
from PIL import Image
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from pipeline.runner import generate_color_by_number
from pipeline.preprocess import preprocess
from pipeline.quantize import quantize
from pipeline.segment import segment
from pipeline.stylize import stylize_available

app = FastAPI(title="HappyColor Foto -> SVG", version="1.0")

# CORS: en produccion el backend sirve tambien el frontend (mismo origen), pero
# se deja configurable por si el frontend se hospeda aparte. CORS_ORIGINS =
# lista separada por comas, o "*" (por defecto) para permitir cualquiera.
_origins_env = os.environ.get("CORS_ORIGINS", "*").strip()
_origins = ["*"] if _origins_env in ("", "*") else [o.strip() for o in _origins_env.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_BYTES = 25 * 1024 * 1024  # 25 MB


async def _read_image(file: UploadFile) -> bytes:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Archivo vacio.")
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Imagen demasiado grande (max 25MB).")
    return data


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/capabilities")
def capabilities():
    """Le dice al frontend que funciones extra estan disponibles."""
    return {"stylize": stylize_available()}


@app.post("/generate")
async def generate(
    file: UploadFile = File(...),
    n_colors: int = Form(36),
    min_area_pct: float = Form(0.02),
    simplify_tol: float = Form(1.4),
    process_size: int = Form(1300),
    max_regions: int = Form(5000),
    clean_radius: int = Form(1),
    stylize: bool = Form(False),
    multitone: bool = Form(True),
    ai_numbers: int = Form(60),
):
    data = await _read_image(file)
    if stylize and not stylize_available():
        raise HTTPException(
            status_code=400,
            detail="Modo ilustracion (IA) no configurado: define STYLIZE_API_KEY en el backend.",
        )
    try:
        doc = generate_color_by_number(
            data,
            n_colors=int(n_colors),
            min_area_pct=float(min_area_pct),
            simplify_tol=float(simplify_tol),
            process_size=int(process_size),
            max_regions=int(max_regions),
            clean_radius=int(clean_radius),
            stylize=bool(stylize),
            multitone=bool(multitone),
            ai_numbers=int(ai_numbers),
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 - PoC: superficie de error simple
        raise HTTPException(status_code=500, detail=f"Error procesando imagen: {exc}")
    return doc


@app.post("/preview")
async def preview(
    file: UploadFile = File(...),
    n_colors: int = Form(24),
    min_area_pct: float = Form(0.1),
    process_size: int = Form(1200),
    max_regions: int = Form(600),
    clean_radius: int = Form(2),
):
    """Devuelve un PNG con cada region pintada de su color (para ajustar knobs)."""
    data = await _read_image(file)
    try:
        rgb = preprocess(data, process_size=int(process_size))
        label_image, palette = quantize(rgb, n_colors=int(n_colors), clean_radius=int(clean_radius))
        region_map, region_color, _ = segment(
            label_image, palette, min_area_pct=float(min_area_pct),
            max_regions=int(max_regions),
        )
        pal_rgb = np.array([p["rgb"] for p in palette], dtype=np.uint8)
        color_per_region = np.array(region_color, dtype=np.int64)
        out_rgb = pal_rgb[color_per_region[region_map]]
        buf = io.BytesIO()
        Image.fromarray(out_rgb).save(buf, format="PNG")
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Error en preview: {exc}")
    return Response(content=buf.getvalue(), media_type="image/png")


# ----------------------------------------------------------------------------
# Servir el frontend estatico (mismo origen que el API -> sin CORS).
# FRONTEND_DIR apunta a la carpeta con upload.html + js/ (por defecto, la raiz
# del repo, un nivel por encima de backend/). Se montan rutas concretas para no
# tapar los endpoints del API.
# ----------------------------------------------------------------------------
FRONTEND_DIR = Path(os.environ.get("FRONTEND_DIR", Path(__file__).resolve().parent.parent))
_INDEX = FRONTEND_DIR / "upload.html"


@app.get("/")
def index():
    if _INDEX.exists():
        return FileResponse(_INDEX)
    return {"status": "ok", "note": "frontend no encontrado; usa el API en /generate"}


# Sirve los modulos JS de la app.
if (FRONTEND_DIR / "js").is_dir():
    app.mount("/js", StaticFiles(directory=str(FRONTEND_DIR / "js")), name="js")


# Sirve, si existen, los ficheros sueltos de PWA (manifest, service worker, iconos).
_ROOT_ASSETS = {"manifest.json", "sw.js", "icon-192.png", "icon-512.png", "favicon.ico"}


@app.get("/{asset}")
def root_asset(asset: str):
    if asset in _ROOT_ASSETS:
        f = FRONTEND_DIR / asset
        if f.exists():
            return FileResponse(f)
    raise HTTPException(status_code=404, detail="No encontrado")
