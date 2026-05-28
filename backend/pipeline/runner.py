"""Orquestador del pipeline foto -> color-by-number SVG (JSON)."""

import time

from .preprocess import preprocess
from .quantize import quantize
from .segment import segment
from .vectorize import vectorize
from .labels import labels_for_regions
from .serialize import assemble


def generate_color_by_number(
    file_bytes: bytes,
    n_colors: int = 24,
    min_area_pct: float = 0.1,
    simplify_tol: float = 1.5,
    process_size: int = 1200,
    max_regions: int = 400,
):
    """Ejecuta las 6 etapas y devuelve el dict JSON listo para el frontend."""
    t0 = time.time()

    rgb = preprocess(file_bytes, process_size=process_size)
    h, w = rgb.shape[:2]

    label_image, palette = quantize(rgb, n_colors=n_colors)
    region_map, region_color, _region_area = segment(
        label_image, palette, min_area_pct=min_area_pct, max_regions=max_regions
    )
    n_regions = len(region_color)

    paths = vectorize(region_map, n_regions, simplify_tol=simplify_tol)
    labels = labels_for_regions(region_map, n_regions)

    doc = assemble(w, h, palette, region_color, paths, labels)
    doc["meta"] = {
        "n_colors": n_colors,
        "min_area_pct": min_area_pct,
        "simplify_tol": simplify_tol,
        "process_size": process_size,
        "max_regions": max_regions,
        "n_regions": len(doc["regions"]),
        "elapsed_ms": int((time.time() - t0) * 1000),
    }
    return doc
