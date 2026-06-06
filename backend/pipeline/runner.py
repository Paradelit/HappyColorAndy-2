"""Orquestador del pipeline foto -> color-by-number SVG (JSON)."""

import time

from .preprocess import preprocess
from .quantize import quantize
from .segment import segment
from .recolor import fills_and_groups
from .vectorize import vectorize
from .labels import labels_for_regions
from .serialize import assemble


def generate_color_by_number(
    file_bytes: bytes,
    n_colors: int = 24,
    min_area_pct: float = 0.1,
    simplify_tol: float = 1.5,
    process_size: int = 1200,
    max_regions: int = 600,
    clean_radius: int = 2,
):
    """Ejecuta el pipeline y devuelve el dict JSON listo para el frontend.

    `n_colors` ahora es el numero de NUMEROS (grupos) de la paleta. Las regiones
    se forman con una cuantizacion mas fina y cada una se rellena con su color
    fiel; luego esos colores se agrupan en `n_colors` numeros.
    """
    t0 = time.time()

    rgb = preprocess(file_bytes, process_size=process_size)
    h, w = rgb.shape[:2]

    # Cuantizacion FINA para formar regiones detalladas (no es la paleta final).
    fine_colors = int(min(120, max(n_colors * 3, 60)))
    label_image, fine_palette = quantize(rgb, n_colors=fine_colors, clean_radius=clean_radius)
    region_map, _fine_color, region_area = segment(
        label_image, fine_palette, min_area_pct=min_area_pct, max_regions=max_regions
    )
    n_regions = len(region_area)

    # Color fiel por region + agrupacion en `n_colors` numeros.
    fills, groups, palette = fills_and_groups(region_map, n_regions, rgb, n_groups=n_colors)

    paths = vectorize(region_map, n_regions, simplify_tol=simplify_tol)
    labels = labels_for_regions(region_map, n_regions)

    doc = assemble(w, h, palette, groups, region_area, fills, paths, labels)
    doc["meta"] = {
        "n_colors": n_colors,
        "fine_colors": fine_colors,
        "min_area_pct": min_area_pct,
        "simplify_tol": simplify_tol,
        "process_size": process_size,
        "max_regions": max_regions,
        "clean_radius": clean_radius,
        "n_regions": len(doc["regions"]),
        "elapsed_ms": int((time.time() - t0) * 1000),
    }
    return doc
