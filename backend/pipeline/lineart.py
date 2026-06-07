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
from skimage.color import rgb2gray, rgb2lab
from skimage.filters import sobel
from skimage.measure import label as cc_label


def line_overlay_datauri(rgb, dark_thresh: float = 0.32, line_width: int = 3) -> str:
    """Capa de DIBUJO: las lineas finas y oscuras del dibujo en PNG transparente.

    Es la "capa de tinta" que se ve siempre (antes y despues de pintar), igual que
    en Happy Color: hace que se distinga todo el detalle (mechones, hojas...) aunque
    las areas pintables sean mas grandes. Se quedan SOLO las lineas finas (no los
    rellenos oscuros grandes). Devuelve un data URI 'data:image/png;base64,...'.
    """
    gray = rgb2gray(rgb.astype(np.float64) / 255.0)
    dark = gray < dark_thresh
    k = line_width * 2 + 1
    thick = binary_opening(dark, structure=np.ones((k, k), dtype=bool))
    lines = dark & ~thick

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
    lab = cc_label(~walls, connectivity=1)  # piezas (no-muro) = 1..N, muro = 0

    # Asignar cada pixel de muro a la pieza valida mas cercana (sin huecos).
    if (lab == 0).any() and (lab > 0).any():
        idx = distance_transform_edt(lab == 0, return_distances=False, return_indices=True)
        lab = lab[tuple(idx)]

    # Reetiquetar 0..N-1 y fusionar piezas diminutas.
    uniq = np.unique(lab)
    remap = np.zeros(int(uniq.max()) + 1, dtype=np.int64)
    remap[uniq] = np.arange(len(uniq))
    region_map = remap[lab].astype(np.int32)
    return _merge_small(region_map, len(uniq), rgb, min_area_pct)
