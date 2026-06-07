"""Segmentacion por LINEAS (no por color) para el modo ilustracion/IA.

Replica como define Happy Color cada pieza: las regiones son las AREAS
ENCERRADAS por las lineas de tinta del dibujo, no trozos de color. Asi, al
pintar "la mejilla" se rellena toda la mejilla (delimitada por sus lineas), aunque
tenga varios tonos, en vez de muchas manchas por color.

Pasos:
  1. detectar las lineas (tinta fina y oscura) -> mascara de "muros"
  2. componentes conexas de lo NO-muro = piezas encerradas por lineas
  3. asignar los pixeles de linea a la pieza vecina mas cercana (sin huecos)
  4. fusionar piezas diminutas en su vecina
"""

import base64
import heapq
import io
from collections import defaultdict

import numpy as np
from PIL import Image
from scipy.ndimage import binary_closing, binary_opening, distance_transform_edt
from skimage.color import lab2rgb, rgb2gray, rgb2lab
from skimage.filters import sobel
from skimage.measure import label as cc_label
from sklearn.cluster import KMeans

from .quantize import quantize


def _ink_lines(rgb, dark_thresh: float = 0.32, line_width: int = 3) -> np.ndarray:
    """Mascara de las lineas de tinta: oscuras y FINAS (no los rellenos oscuros)."""
    gray = rgb2gray(rgb.astype(np.float64) / 255.0)
    dark = gray < dark_thresh
    k = line_width * 2 + 1
    thick = binary_opening(dark, structure=np.ones((k, k), dtype=bool))
    return dark & ~thick


def ink_walls(rgb, dark_thresh: float = 0.32, line_width: int = 3, close: int = 5) -> np.ndarray:
    """Lineas de tinta como muros, con huecos sellados para que las piezas cierren.

    Importante: las piezas se delimitan SOLO por las lineas dibujadas, NO por
    cambios de color; asi una pieza puede tener varios tonos dentro.
    """
    lines = _ink_lines(rgb, dark_thresh, line_width)
    return binary_closing(lines, structure=np.ones((close, close), dtype=bool))


def line_overlay_datauri(rgb, dark_thresh: float = 0.32, line_width: int = 3) -> str:
    """Capa de DIBUJO: las lineas de tinta en PNG transparente (data URI).

    Es la "capa de tinta" que se ve siempre (antes y despues de pintar): hace que
    se distinga todo el detalle (mechones, hojas...) aunque las piezas sean grandes.
    """
    lines = _ink_lines(rgb, dark_thresh, line_width)
    h, w = lines.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[lines] = (25, 25, 25, 255)  # tinta casi negra
    buf = io.BytesIO()
    Image.fromarray(rgba, "RGBA").save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def detect_walls(rgb, edge_thresh: float = 0.10) -> np.ndarray:
    """Mascara booleana de los BORDES del dibujo (muros entre piezas).

    Las lineas de tinta son los bordes mas fuertes, asi que un umbral sobre la
    magnitud del gradiente las captura y, ademas, forma contornos cerrados (cada
    pieza queda bien delimitada). Tambien capta cambios de color marcados sin
    linea (aceptable). Se cierran huecos pequenos para garantizar piezas cerradas.
    """
    gray = rgb2gray(rgb.astype(np.float64) / 255.0)
    walls = sobel(gray) > edge_thresh
    return binary_closing(walls, structure=np.ones((3, 3), dtype=bool))


def _region_means(region_map, n, rgb):
    flat = region_map.ravel()
    counts = np.bincount(flat, minlength=n).astype(np.float64)
    counts[counts == 0] = 1.0
    return np.stack(
        [np.bincount(flat, weights=rgb[:, :, c].ravel().astype(np.float64), minlength=n) / counts
         for c in range(3)], axis=1)


def _merge_small(region_map, n, rgb, min_area_pct):
    """Fusiona piezas con area < min_area en la vecina (mayor frontera; desempate color)."""
    h, w = region_map.shape
    min_area = max(1, int(h * w * (min_area_pct / 100.0)))
    area = np.bincount(region_map.ravel(), minlength=n).astype(np.int64)
    lab = rgb2lab(_region_means(region_map, n, rgb).reshape(1, -1, 3) / 255.0).reshape(-1, 3)

    adj = defaultdict(lambda: defaultdict(int))

    def accum(a, b):
        m = a != b
        if not m.any():
            return
        lo = np.minimum(a[m], b[m]).astype(np.int64)
        hi = np.maximum(a[m], b[m]).astype(np.int64)
        uniq, cnt = np.unique(lo * (n + 1) + hi, return_counts=True)
        for k, c in zip(uniq, cnt):
            ra, rb = int(k // (n + 1)), int(k % (n + 1))
            adj[ra][rb] += int(c)
            adj[rb][ra] += int(c)

    accum(region_map[:, :-1].ravel(), region_map[:, 1:].ravel())
    accum(region_map[:-1, :].ravel(), region_map[1:, :].ravel())

    parent = list(range(n))

    def find(x):
        r = x
        while parent[r] != r:
            r = parent[r]
        while parent[x] != r:
            parent[x], x = r, parent[x]
        return r

    def merge_into_best(root):
        nb = adj.get(root)
        if not nb:
            return None
        best, bborder, bdist = None, -1, None
        ml = lab[root]
        for nn, border in nb.items():
            nr = find(nn)
            if nr == root:
                continue
            d = float(np.linalg.norm(lab[nr] - ml))
            if border > bborder or (border == bborder and (bdist is None or d < bdist)):
                best, bborder, bdist = nr, border, d
        if best is None:
            return None
        parent[root] = best
        area[best] += area[root]
        for nn, border in nb.items():
            nr = find(nn)
            if nr == best:
                continue
            adj[best][nr] += border
            adj[nr][best] += border
            adj[nr].pop(root, None)
        adj.pop(root, None)
        adj[best].pop(root, None)
        return best

    heap = [(int(area[r]), r) for r in range(n) if 0 < area[r] < min_area]
    heapq.heapify(heap)
    while heap:
        a_size, r = heapq.heappop(heap)
        root = find(r)
        if root != r or area[root] != a_size or area[root] >= min_area:
            continue
        surv = merge_into_best(root)
        if surv is not None and area[surv] < min_area:
            heapq.heappush(heap, (int(area[surv]), surv))

    roots = np.array([find(r) for r in range(n)], dtype=np.int64)
    uniq = np.unique(roots)
    remap = np.zeros(n, dtype=np.int64)
    remap[uniq] = np.arange(len(uniq))
    out = remap[roots][region_map].astype(np.int32)
    return out, len(uniq)


def regions_from_lines(rgb, min_area_pct: float = 0.03, edge_thresh: float = 0.10):
    """Devuelve (region_map, n_regions): piezas encerradas por las lineas del dibujo."""
    walls = detect_walls(rgb, edge_thresh=edge_thresh)
    return _regions_from_walls(walls, rgb, min_area_pct)


def _regions_from_walls(walls, rgb, min_area_pct):
    lab = cc_label(~walls, connectivity=1)  # piezas (no-muro) = 1..N, muro = 0
    if (lab == 0).any() and (lab > 0).any():
        idx = distance_transform_edt(lab == 0, return_distances=False, return_indices=True)
        lab = lab[tuple(idx)]
    uniq = np.unique(lab)
    remap = np.zeros(int(uniq.max()) + 1, dtype=np.int64)
    remap[uniq] = np.arange(len(uniq))
    region_map = remap[lab].astype(np.int32)
    return _merge_small(region_map, len(uniq), rgb, min_area_pct)


def _hex(r, g, b):
    return "#%02x%02x%02x" % (int(r), int(g), int(b))


def _region_means_u8(region_map, n, rgb):
    return np.clip(np.round(_region_means(region_map, n, rgb)), 0, 255).astype(np.uint8)


def piece_walls(rgb, dark_thresh=0.32, piece_edge_thresh=0.12):
    """Muros de PIEZA = lineas de tinta + bordes fuertes (formas/colores marcados).

    Garantiza que se formen piezas (aunque la deteccion de tinta falle) y delimita
    formas, pero el sombreado SUAVE (gradiente debil) NO supera el umbral, asi que
    no parte la pieza -> esa pieza queda multitono.
    """
    gray = rgb2gray(rgb.astype(np.float64) / 255.0)
    walls = _ink_lines(rgb, dark_thresh) | (sobel(gray) > piece_edge_thresh)
    return binary_closing(walls, structure=np.ones((3, 3), dtype=bool))


def build_lineart(rgb, n_numbers=36, min_piece_area_pct=0.02, piece_edge_thresh=0.10,
                  fine_colors=48, multitone_spread=6.0):
    """Modelo de DOS NIVELES estilo Happy Color para una ilustracion.

    - PIEZA: area delimitada por lineas = unidad de pintado (un clic, un numero).
    - SUB-REGION: dentro de una pieza, cada tono fiel distinto (se rellenan todos
      al pintar la pieza). Asi un numero "verde" pinta su area con los verdes que
      haga falta para ser fiel al original.

    Returns: region_map, n_regions, fills, numbers, clusters, palette
      - fills[i]    hex fiel de la sub-region i
      - numbers[i]  numero (grupo) de la PIEZA de la sub-region i
      - clusters[i] id de PIEZA (un clic pinta toda la pieza)
      - palette     [{index, hex, multitone, swatches}]
    """
    h, w = rgb.shape[:2]
    # Muros = lineas de tinta + bordes fuertes; el sombreado suave no parte la pieza.
    walls = piece_walls(rgb, dark_thresh=0.32, piece_edge_thresh=piece_edge_thresh)

    # 1) Piezas (clics) delimitadas por lineas.
    piece_map, n_pieces = _regions_from_walls(walls, rgb, min_piece_area_pct)

    # 2) Cuantizacion fina de color (base de los tonos fieles).
    fine, _pal = quantize(rgb, n_colors=fine_colors, clean_radius=1)

    # 3) Sub-regiones = areas de (misma pieza + mismo color) sin cruzar lineas.
    combined = piece_map.astype(np.int64) * (int(fine.max()) + 2) + fine.astype(np.int64)
    combined[walls] = -1
    sub = cc_label(combined, background=-1, connectivity=1)
    if (sub == 0).any() and (sub > 0).any():
        idx = distance_transform_edt(sub == 0, return_distances=False, return_indices=True)
        sub = sub[tuple(idx)]
    uniq = np.unique(sub)
    remap = np.zeros(int(uniq.max()) + 1, dtype=np.int64)
    remap[uniq] = np.arange(len(uniq))
    region_map = remap[sub].astype(np.int32)
    region_map, n = _merge_small(region_map, len(uniq), rgb, min_area_pct=0.008)

    # 4) Pieza y color fiel de cada sub-region.
    flat_r = region_map.ravel()
    _, first_idx = np.unique(flat_r, return_index=True)
    region_piece = piece_map.ravel()[first_idx].astype(np.int64)  # pieza por sub-region
    means = _region_means_u8(region_map, n, rgb)
    fills = [_hex(*means[i]) for i in range(n)]

    # cluster = pieza (ids contiguos)
    upi = np.unique(region_piece)
    pmap = {p: i for i, p in enumerate(upi)}
    clusters = [pmap[int(region_piece[i])] for i in range(n)]
    n_clusters = len(upi)

    # 5) Color medio de cada pieza (ponderado por area) -> agrupar en numeros.
    area = np.bincount(flat_r, minlength=n).astype(np.float64)
    psum = np.zeros((n_clusters, 3))
    parea = np.zeros(n_clusters)
    for i in range(n):
        c = clusters[i]
        psum[c] += means[i].astype(np.float64) * area[i]
        parea[c] += area[i]
    parea[parea == 0] = 1
    piece_mean = psum / parea[:, None]
    piece_lab = rgb2lab(piece_mean.reshape(1, -1, 3) / 255.0).reshape(-1, 3)
    k = int(max(1, min(n_numbers, n_clusters)))
    km = KMeans(n_clusters=k, n_init=4, random_state=42).fit(piece_lab)
    piece_number = km.labels_.astype(int)
    numbers = [int(piece_number[clusters[i]]) for i in range(n)]

    # 6) Paleta: color representativo + multitono (si sus piezas llevan varios tonos).
    centers = (np.clip(lab2rgb(km.cluster_centers_.reshape(1, -1, 3)), 0, 1) * 255.0)
    centers = np.round(centers).reshape(-1, 3).astype(np.uint8)
    palette = []
    for g in range(k):
        cols = means[[i for i in range(n) if numbers[i] == g]]
        if len(cols) > 1:
            spread = float(np.mean(np.std(cols.astype(np.float64), axis=0)))
            lum = cols.astype(np.float64) @ np.array([0.299, 0.587, 0.114])
            order = np.argsort(lum)
            picks = order[[0, len(order) // 2, len(order) - 1]]
            swatches = [_hex(*cols[p]) for p in picks]
        else:
            spread = 0.0
            swatches = [_hex(*cols[0])] if len(cols) else [_hex(*centers[g])]
        palette.append({
            "index": g, "hex": _hex(*centers[g]),
            "multitone": bool(spread > multitone_spread), "swatches": swatches,
        })

    return region_map, n, fills, numbers, clusters, palette
