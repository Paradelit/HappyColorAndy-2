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
from skimage.measure import find_contours, label as cc_label
from skimage.segmentation import slic
from sklearn.cluster import KMeans
from shapely.geometry import LinearRing

from .quantize import quantize


def _subdivide_large(region_map, n, rgb, max_area_px):
    """Parte las regiones MAS GRANDES que el tope en celdas (superpixeles) para
    que ningun clic pueda pintar mas de `max_area_px`. Las zonas pequenas y de
    detalle no se tocan."""
    area = np.bincount(region_map.ravel(), minlength=n)
    big = np.where(area > max_area_px * 1.2)[0]
    if len(big) == 0:
        return region_map, n
    total = region_map.size
    n_seg = max(8, int(total / (max_area_px * 0.7)))
    sp = slic(rgb, n_segments=n_seg, compactness=18, start_label=0, enforce_connectivity=True)
    out = region_map.copy()
    nxt = n
    for r in big:
        mask = region_map == r
        first = True
        for s in np.unique(sp[mask]):
            cell = mask & (sp == s)
            if not cell.any():
                continue
            if first:
                first = False  # la primera celda conserva el id r
                continue
            out[cell] = nxt
            nxt += 1
    uniq = np.unique(out)
    remap = np.zeros(int(uniq.max()) + 1, dtype=np.int64)
    remap[uniq] = np.arange(len(uniq))
    return remap[out].astype(np.int32), len(uniq)


def auto_dark_thresh(rgb) -> float:
    """Umbral de tinta automatico: la tinta son los pixeles mas oscuros."""
    gray = rgb2gray(rgb.astype(np.float64) / 255.0)
    return float(np.clip(np.percentile(gray, 7) + 0.05, 0.18, 0.42))


def auto_edge_thresh(rgb) -> float:
    """Umbral de borde automatico: percentil alto de la magnitud del gradiente."""
    g = sobel(rgb2gray(rgb.astype(np.float64) / 255.0))
    return float(np.clip(np.percentile(g, 90), 0.05, 0.22))


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


def line_overlay_path(rgb, dark_thresh: float = 0.32, line_width: int = 7, simplify_tol: float = 0.5) -> str:
    """Capa de DIBUJO en VECTOR: las lineas de tinta como un path SVG (nitido a
    cualquier zoom). `line_width` alto conserva tambien las lineas GRUESAS
    (contornos importantes), no solo las finas. Solo se descartan los rellenos
    oscuros muy grandes. Traza el contorno de las lineas y las rellena (evenodd)."""
    return _mask_to_path(_ink_lines(rgb, dark_thresh, line_width), simplify_tol)


def number_overlay_path(region_map, numbers, simplify_tol: float = 0.6, thickness: int = 2) -> str:
    """Capa de DIBUJO en VECTOR para FOTOS (sin tinta que detectar): traza las
    fronteras donde cambia el NUMERO a pintar, como un libro de colorear hecho
    de la foto. Las fronteras entre piezas del MISMO numero (sub-tonos del
    multitono, celdas de subdivision) no se dibujan, igual que en el modo IA
    la tinta no marca los sombreados."""
    nums = np.asarray(numbers, dtype=np.int32)[region_map]
    edges = np.zeros(nums.shape, dtype=bool)
    edges[:, 1:] |= nums[:, 1:] != nums[:, :-1]
    edges[1:, :] |= nums[1:, :] != nums[:-1, :]
    if thickness > 1:
        from scipy.ndimage import binary_dilation
        edges = binary_dilation(edges, structure=np.ones((thickness, thickness), dtype=bool))
    return _mask_to_path(edges, simplify_tol)


def _mask_to_path(mask, simplify_tol: float = 0.5) -> str:
    """Mascara booleana -> path SVG (contornos rellenables con evenodd)."""
    padded = np.pad(mask.astype(np.uint8), 1, mode="constant", constant_values=0)
    contours = find_contours(padded, level=0.5)
    subs = []
    for c in contours:
        pts = [(float(col) - 1.0, float(row) - 1.0) for row, col in c]
        if len(pts) < 4:
            continue
        try:
            ring = LinearRing(pts).simplify(simplify_tol, preserve_topology=False)
        except Exception:
            continue
        coords = list(ring.coords)
        if len(coords) < 4:
            continue
        d = "M " + " L ".join(f"{round(x, 1)} {round(y, 1)}" for x, y in coords[:-1]) + " Z"
        subs.append(d)
    return " ".join(subs)


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


def capped_clusters(region_map, n, numbers, max_area_px):
    """Clusters = zonas contiguas del MISMO numero, pero con tope de area.

    Un clic pinta un cluster. Las zonas grandes del mismo color se parten en
    varios clusters (<= max_area_px) para que un clic no pinte medio cuadro.
    """
    from collections import deque

    numbers = np.asarray(numbers)
    area = np.bincount(region_map.ravel(), minlength=n).astype(np.int64)

    adj = defaultdict(set)

    def accum(a, b):
        m = a != b
        if not m.any():
            return
        lo = np.minimum(a[m], b[m]).astype(np.int64)
        hi = np.maximum(a[m], b[m]).astype(np.int64)
        for key in np.unique(lo * (n + 1) + hi):
            ra, rb = int(key // (n + 1)), int(key % (n + 1))
            adj[ra].add(rb)
            adj[rb].add(ra)

    accum(region_map[:, :-1].ravel(), region_map[:, 1:].ravel())
    accum(region_map[:-1, :].ravel(), region_map[1:, :].ravel())

    cluster = [-1] * n
    cid = 0
    for s in range(n):
        if cluster[s] != -1:
            continue
        cluster[s] = cid
        cur = int(area[s])
        q = deque([s])
        while q:
            x = q.popleft()
            for nb in adj.get(x, ()):
                if cluster[nb] == -1 and numbers[nb] == numbers[s] and cur + area[nb] <= max_area_px:
                    cluster[nb] = cid
                    cur += int(area[nb])
                    q.append(nb)
        cid += 1
    return cluster


def _build_palette(numbers, means, centers, k, multitone, multitone_spread):
    """Paleta de la UI: representante por numero + swatches si es multitono."""
    n = len(numbers)
    palette = []
    for g in range(k):
        cols = means[[i for i in range(n) if numbers[i] == g]]
        if multitone and len(cols) > 1:
            spread = float(np.mean(np.std(cols.astype(np.float64), axis=0)))
            lum = cols.astype(np.float64) @ np.array([0.299, 0.587, 0.114])
            order = np.argsort(lum)
            swatches = [_hex(*cols[p]) for p in order[[0, len(order) // 2, len(order) - 1]]]
        else:
            spread = 0.0
            swatches = [_hex(*centers[g])]
        palette.append({
            "index": g, "hex": _hex(*centers[g]),
            "multitone": bool(multitone and spread > multitone_spread), "swatches": swatches,
        })
    return palette


def build_photo(rgb, n_numbers=60, max_cluster_pct=6.0, multitone=True,
                multitone_spread=6.0, clean_radius=4, min_piece_pct=0.05):
    """Color-by-number para FOTOS con las MISMAS capacidades que el modo IA.

    Una foto no tiene tinta que detectar, asi que el "dibujo" se construye
    posterizando directamente a `n_numbers` colores (cuantizacion con muestreo
    sesgado a detalle + filtro de mayoria fuerte que elimina el confeti del
    ruido). Las piezas son las zonas contiguas de cada numero, y las lineas las
    fronteras entre numeros: el aspecto "libro de colorear" del modo IA.

    Mismas garantias: numero por COLOR, tope de area por clic, multitono/plano.

    Returns: region_map, n_regions, fills, numbers, clusters, palette
    """
    h, w = rgb.shape[:2]

    # Posterizado = asignacion de numeros por pixel, ya limpia de ruido.
    nmap, pal = quantize(rgb, n_colors=n_numbers, clean_radius=clean_radius)
    k = len(pal)
    centers = np.array([p["rgb"] for p in pal], dtype=np.uint8)

    # Piezas = zonas contiguas del mismo numero; se funden las diminutas.
    comp = cc_label(nmap, connectivity=1)
    uniq = np.unique(comp)
    remap = np.zeros(int(uniq.max()) + 1, dtype=np.int64)
    remap[uniq] = np.arange(len(uniq))
    region_map = remap[comp].astype(np.int32)
    region_map, n = _merge_small(region_map, len(uniq), rgb, min_area_pct=min_piece_pct)

    # Tope de area por clic: subdividir piezas enormes (cielos, fondos).
    max_area_px = max(1, int(h * w * (max_cluster_pct / 100.0)))
    region_map, n = _subdivide_large(region_map, n, rgb, max_area_px)

    # Numero de cada pieza = numero mas frecuente entre sus pixeles.
    flat_r = region_map.ravel()
    flat_n = nmap.ravel().astype(np.int64)
    counts = np.bincount(flat_r * k + flat_n, minlength=n * k).reshape(n, k)
    numbers = counts.argmax(axis=1).astype(int).tolist()

    means = _region_means_u8(region_map, n, rgb)
    clusters = capped_clusters(region_map, n, numbers, max_area_px)

    # FILLS: multitono = tono fiel de la pieza; plano = color del numero.
    if multitone:
        fills = [_hex(*means[i]) for i in range(n)]
    else:
        fills = [_hex(*centers[numbers[i]]) for i in range(n)]

    palette = _build_palette(numbers, means, centers, k, multitone, multitone_spread)
    return region_map, n, fills, numbers, clusters, palette


def build_lineart(rgb, n_numbers=60, max_cluster_pct=6.0, piece_edge_thresh=None,
                  dark_thresh=None, fine_colors=72, multitone=True, multitone_spread=6.0):
    """Color-by-number por LINEAS para una ilustracion (estilo Happy Color).

    - Las sub-regiones se delimitan por las lineas del dibujo (+ bordes fuertes).
    - El NUMERO va por COLOR (no por pieza): azul es un numero, marron otro -> al
      pintar un numero solo se pintan colores de ESE numero (coherente).
    - Un CLIC pinta una zona contigua del mismo numero, con TOPE de area
      (max_cluster_pct % del lienzo) para que un clic no pinte medio cuadro.
    - multitono: cada sub-region con su tono fiel. plano: el color del numero.

    Returns: region_map, n_regions, fills, numbers, clusters, palette
    """
    h, w = rgb.shape[:2]
    if dark_thresh is None:
        dark_thresh = auto_dark_thresh(rgb)
    if piece_edge_thresh is None:
        piece_edge_thresh = auto_edge_thresh(rgb)

    # Muros = lineas de tinta + bordes fuertes (separan sub-regiones).
    walls = piece_walls(rgb, dark_thresh=dark_thresh, piece_edge_thresh=piece_edge_thresh)

    # Sub-regiones = areas de color que no cruzan lineas (conservan el detalle).
    fine, _pal = quantize(rgb, n_colors=fine_colors, clean_radius=1)
    masked = fine.astype(np.int64)
    masked[walls] = -1
    sub = cc_label(masked, background=-1, connectivity=1)
    if (sub == 0).any() and (sub > 0).any():
        idx = distance_transform_edt(sub == 0, return_distances=False, return_indices=True)
        sub = sub[tuple(idx)]
    uniq = np.unique(sub)
    remap = np.zeros(int(uniq.max()) + 1, dtype=np.int64)
    remap[uniq] = np.arange(len(uniq))
    region_map = remap[sub].astype(np.int32)
    region_map, n = _merge_small(region_map, len(uniq), rgb, min_area_pct=0.006)

    # Subdividir zonas grandes para respetar el tope de area por clic.
    max_area_px = max(1, int(h * w * (max_cluster_pct / 100.0)))
    region_map, n = _subdivide_large(region_map, n, rgb, max_area_px)

    means = _region_means_u8(region_map, n, rgb)

    # NUMERO por color de la sub-region (coherente: azul!=marron).
    means_lab = rgb2lab(means.reshape(1, -1, 3) / 255.0).reshape(-1, 3)
    k = int(max(1, min(n_numbers, n)))
    km = KMeans(n_clusters=k, n_init=4, random_state=42).fit(means_lab)
    numbers = km.labels_.astype(int).tolist()
    centers = np.round(np.clip(lab2rgb(km.cluster_centers_.reshape(1, -1, 3)), 0, 1) * 255.0)
    centers = centers.reshape(-1, 3).astype(np.uint8)

    # CLUSTERS (clics) con tope de area.
    clusters = capped_clusters(region_map, n, numbers, max_area_px)

    # FILLS: multitono = tono fiel; plano = color del numero.
    if multitone:
        fills = [_hex(*means[i]) for i in range(n)]
    else:
        fills = [_hex(*centers[numbers[i]]) for i in range(n)]

    # PALETA: representante + multitono (si el numero tiene varios tonos).
    palette = _build_palette(numbers, means, centers, k, multitone, multitone_spread)
    return region_map, n, fills, numbers, clusters, palette
