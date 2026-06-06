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

import numpy as np
from PIL import Image
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from pipeline.runner import generate_color_by_number
from pipeline.preprocess import preprocess
from pipeline.quantize import quantize
from pipeline.segment import segment

app = FastAPI(title="HappyColor Foto -> SVG", version="1.0")

# PoC: se permite cualquier origen para que el frontend estatico
# (p.ej. http://localhost:5500) pueda llamar al API en :8000.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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


@app.post("/generate")
async def generate(
    file: UploadFile = File(...),
    n_colors: int = Form(24),
    min_area_pct: float = Form(0.1),
    simplify_tol: float = Form(1.5),
    process_size: int = Form(1200),
    max_regions: int = Form(600),
    clean_radius: int = Form(2),
):
    data = await _read_image(file)
    try:
        doc = generate_color_by_number(
            data,
            n_colors=int(n_colors),
            min_area_pct=float(min_area_pct),
            simplify_tol=float(simplify_tol),
            process_size=int(process_size),
            max_regions=int(max_regions),
            clean_radius=int(clean_radius),
        )
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
