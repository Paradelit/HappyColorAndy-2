"""Orquestador del pipeline foto -> color-by-number SVG (JSON)."""

import time

import numpy as np

from .preprocess import preprocess
from .quantize import quantize
from .segment import segment
from .lineart import regions_from_lines
from .recolor import fills_and_groups, boundary_edge_strength, paint_clusters
from .vectorize import vectorize
from .labels import labels_for_regions
from .serialize import assemble
from .stylize import stylize as ai_stylize


def generate_color_by_number(
    file_bytes: bytes,
    n_colors: int = 36,
    min_area_pct: float = 0.02,
    simplify_tol: float = 1.4,
    process_size: int = 1300,
    max_regions: int = 5000,
    clean_radius: int = 1,
    stylize: bool = False,
):
    """Ejecuta el pipeline y devuelve el dict JSON listo para el frontend.

    Si `stylize` es True, primero convierte la foto en una ilustracion limpia con
    IA (estilo Happy Color) y hace el color-by-number de esa ilustracion.
    """
    t0 = time.time()
    stylized = False
    if stylize:
        file_bytes = ai_stylize(file_bytes)   # foto -> ilustracion (IA)
        stylized = True

    # En modo IA la entrada ya es una ilustracion limpia: NO se suaviza (para no
    # emborronar las lineas nitidas) y se procesa a mayor resolucion.
    eff_process_size = 1500 if stylized else process_size
    rgb = preprocess(file_bytes, process_size=eff_process_size, denoise=not stylized)
    h, w = rgb.shape[:2]

    if stylized:
        # SEGMENTACION POR LINEAS: cada pieza es un area encerrada por las lineas
        # del dibujo (como Happy Color), no un trozo de color.
        region_map, n_regions = regions_from_lines(rgb, min_area_pct=0.025)
    else:
        # Perfil foto: regiones por color (cuantizacion fina + fusion).
        fine_colors = int(min(120, max(n_colors * 3, 96)))
        label_image, fine_palette = quantize(rgb, n_colors=fine_colors, clean_radius=clean_radius)
        region_map, _fine_color, _area = segment(
            label_image, fine_palette, min_area_pct=min_area_pct, max_regions=max_regions
        )
        n_regions = len(_area)

    region_area = np.bincount(region_map.ravel(), minlength=n_regions).astype(int).tolist()

    # Color fiel por region + agrupacion en numeros + fuerza de borde (profundidad).
    fills, groups, palette = fills_and_groups(region_map, n_regions, rgb, n_groups=n_colors)
    edge = boundary_edge_strength(region_map, n_regions, rgb)
    clusters = paint_clusters(region_map, n_regions, groups)  # un clic = todo el grupo contiguo

    paths = vectorize(region_map, n_regions, simplify_tol=simplify_tol)
    labels = labels_for_regions(region_map, n_regions)

    doc = assemble(w, h, palette, groups, region_area, fills, edge, clusters, paths, labels)
    doc["meta"] = {
        "n_colors": n_colors,
        "mode": "lineart" if stylized else "color",
        "min_area_pct": min_area_pct,
        "simplify_tol": simplify_tol,
        "process_size": eff_process_size,
        "max_regions": max_regions,
        "clean_radius": clean_radius,
        "stylized": stylized,
        "n_regions": len(doc["regions"]),
        "elapsed_ms": int((time.time() - t0) * 1000),
    }
    return doc
