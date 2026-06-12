"""Orquestador del pipeline foto -> color-by-number SVG (JSON)."""

import os
import time

import numpy as np

from .preprocess import preprocess
from .lineart import build_lineart, build_photo, line_overlay_path, number_overlay_path, auto_dark_thresh
from .recolor import boundary_edge_strength
from .vectorize import vectorize
from .labels import labels_for_regions
from .serialize import assemble
from .stylize import stylize as ai_stylize


def generate_color_by_number(
    file_bytes: bytes,
    n_colors: int = 36,        # legacy (sin uso): se mantiene por compatibilidad del API
    min_area_pct: float = 0.02,   # legacy (sin uso)
    simplify_tol: float = 1.4,
    process_size: int = 1300,     # legacy (sin uso): ambos modos procesan a 1536
    max_regions: int = 5000,      # legacy (sin uso)
    clean_radius: int = 1,        # legacy (sin uso)
    stylize: bool = False,
    multitone: bool = True,
    ai_numbers: int = 60,
):
    """Ejecuta el pipeline y devuelve el dict JSON listo para el frontend.

    Ambos modos comparten el MISMO pipeline de dos niveles (dibujo vectorial +
    piezas pintables). Si `stylize` es True, primero convierte la foto en una
    ilustracion limpia con IA y las lineas salen de la tinta dibujada; si es
    False, las lineas salen de las fronteras entre numeros de la propia foto.
    """
    t0 = time.time()
    stylized = False
    if stylize:
        file_bytes = ai_stylize(file_bytes)   # foto -> ilustracion (IA)
        stylized = True

    # En modo IA la entrada ya es una ilustracion limpia y de alta resolucion:
    # NO se suaviza (para no emborronar la tinta) y se procesa a 1536. Para FOTOS
    # procesamos a 1300: suficiente detalle en movil y bastante mas rapido/ligero.
    eff_process_size = 1536 if stylized else 1300
    rgb = preprocess(file_bytes, process_size=eff_process_size, denoise=not stylized)
    h, w = rgb.shape[:2]

    # DOS NIVELES (como Happy Color) en ambos modos:
    #  - capa de DIBUJO (overlay VECTORIAL): lineas nitidas a cualquier zoom.
    #  - PIEZAS pintables (un clic = un numero); en modo multitono con sub-tonos.
    max_click = float(os.environ.get("LINEART_MAX_CLICK_PCT", "6"))  # % maximo por clic

    if stylized:
        # Ilustracion: las lineas son la TINTA dibujada (umbrales automaticos,
        # env opcional para forzar).
        env_edge = os.environ.get("LINEART_PIECE_EDGE")
        env_dark = os.environ.get("LINEART_DARK")
        piece_edge = float(env_edge) if env_edge else None      # None -> automatico
        dark_thresh = float(env_dark) if env_dark else auto_dark_thresh(rgb)
        region_map, n_regions, fills, groups, clusters, palette = build_lineart(
            rgb, n_numbers=ai_numbers, max_cluster_pct=max_click,
            piece_edge_thresh=piece_edge, dark_thresh=dark_thresh, multitone=multitone,
        )
        line_overlay = line_overlay_path(rgb, dark_thresh=dark_thresh)
    else:
        # Foto: dos niveles -> numeros limpios (lineas) + sub-tonos finos
        # (fidelidad). El dibujo son las fronteras entre numeros.
        region_map, n_regions, fills, groups, clusters, palette = build_photo(
            rgb, max_cluster_pct=max_click, multitone=multitone,
        )
        line_overlay = number_overlay_path(region_map, groups)

    region_area = np.bincount(region_map.ravel(), minlength=n_regions).astype(int).tolist()
    edge = boundary_edge_strength(region_map, n_regions, rgb)

    # En foto subimos la simplificacion de los paths: payload mas ligero sin
    # perdida visible a resolucion de movil.
    eff_simplify = simplify_tol if stylized else max(simplify_tol, 2.2)
    paths = vectorize(region_map, n_regions, simplify_tol=eff_simplify)
    labels = labels_for_regions(region_map, n_regions)

    doc = assemble(w, h, palette, groups, region_area, fills, edge, clusters, paths, labels)
    if line_overlay:
        doc["lineOverlayPath"] = line_overlay   # capa de dibujo VECTORIAL (path SVG)
    doc["meta"] = {
        "n_colors": ai_numbers,
        "multitone": multitone,
        "mode": "lineart" if stylized else "photo-lineart",
        "simplify_tol": simplify_tol,
        "process_size": eff_process_size,
        "stylized": stylized,
        "n_regions": len(doc["regions"]),
        "elapsed_ms": int((time.time() - t0) * 1000),
    }
    return doc
