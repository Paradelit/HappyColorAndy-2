"""Orquestador del pipeline foto -> color-by-number SVG (JSON)."""

import time

from .preprocess import preprocess
from .quantize import quantize
from .segment import segment
from .recolor import fills_and_groups, boundary_edge_strength, paint_clusters
from .vectorize import vectorize
from .labels import labels_for_regions
from .serialize import assemble


def generate_color_by_number(
    file_bytes: bytes,
    n_colors: int = 36,
    min_area_pct: float = 0.06,
    simplify_tol: float = 1.6,
    process_size: int = 1200,
    max_regions: int = 1200,
    clean_radius: int = 2,
):
    """Ejecuta el pipeline y devuelve el dict JSON listo para el frontend.

    Los valores por defecto buscan MAXIMA FIDELIDAD automaticamente (el usuario
    no toca parametros). `n_colors` es el numero de NUMEROS de la paleta; la
    fidelidad no depende de el, sino del color fiel por region.
    """
    t0 = time.time()

    rgb = preprocess(file_bytes, process_size=process_size)
    h, w = rgb.shape[:2]

    # Cuantizacion FINA para formar regiones detalladas (no es la paleta final).
    fine_colors = int(min(96, max(n_colors * 2, 64)))
    label_image, fine_palette = quantize(rgb, n_colors=fine_colors, clean_radius=clean_radius)
    region_map, _fine_color, region_area = segment(
        label_image, fine_palette, min_area_pct=min_area_pct, max_regions=max_regions
    )
    n_regions = len(region_area)

    # Color fiel por region + agrupacion en numeros + fuerza de borde (profundidad).
    fills, groups, palette = fills_and_groups(region_map, n_regions, rgb, n_groups=n_colors)
    edge = boundary_edge_strength(region_map, n_regions, rgb)
    clusters = paint_clusters(region_map, n_regions, groups)  # un clic = todo el grupo contiguo

    paths = vectorize(region_map, n_regions, simplify_tol=simplify_tol)
    labels = labels_for_regions(region_map, n_regions)

    doc = assemble(w, h, palette, groups, region_area, fills, edge, clusters, paths, labels)
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
