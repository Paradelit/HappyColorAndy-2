"""Etapa 3: segmentacion + fusion de regiones pequenas (PASO CLAVE).

A partir del mapa de colores cuantizado:
  1. Etiqueta componentes conexas (regiones de color constante, 4-conectividad).
  2. Fusiona iterativamente toda region cuya area sea menor que `min_area` en su
     vecino con mayor frontera compartida (desempate: color mas cercano en LAB).

Esto elimina el "confeti" de manchitas y es lo que separa un resultado que
"parece disenado a mano" de un trazado automatico ruidoso.

Devuelve un mapa de regiones limpio (ids contiguos) y, por region, su indice de
paleta y su area.
"""

import heapq
from collections import defaultdict

import numpy as np
from skimage.color import rgb2lab
from skimage.measure import label as cc_label


def _palette_lab(palette):
    """Paleta RGB -> LAB (float) para medir cercania perceptual entre colores."""
    rgb = np.array([p["rgb"] for p in palette], dtype=np.float64).reshape(1, -1, 3) / 255.0
    return rgb2lab(rgb).reshape(-1, 3).astype(np.float32)


def _build_adjacency(regions, n_regions):
    """Frontera compartida entre regiones vecinas (longitud en pixeles)."""
    adj = defaultdict(lambda: defaultdict(int))

    def accumulate(a, b):
        mask = a != b
        if not mask.any():
            return
        lo = np.minimum(a[mask], b[mask]).astype(np.int64)
        hi = np.maximum(a[mask], b[mask]).astype(np.int64)
        key = lo * (n_regions + 1) + hi
        uniq, counts = np.unique(key, return_counts=True)
        for k, c in zip(uniq, counts):
            ra = int(k // (n_regions + 1))
            rb = int(k % (n_regions + 1))
            adj[ra][rb] += int(c)
            adj[rb][ra] += int(c)

    accumulate(regions[:, :-1].ravel(), regions[:, 1:].ravel())
    accumulate(regions[:-1, :].ravel(), regions[1:, :].ravel())
    return adj


def segment(label_image, palette, min_area_pct: float = 0.1, max_regions: int = 400):
    """Segmenta y fusiona regiones pequenas.

    Args:
        label_image: (H, W) indice de paleta por pixel (de quantize).
        palette: lista de la paleta (para distancia LAB en desempates).
        min_area_pct: area minima de una region como % del area total.
        max_regions: tope de regiones; si tras la fusion por area quedan mas,
            se siguen fusionando las mas pequenas hasta bajar del tope. Evita el
            "confeti" en fotos con mucho detalle. 0/None lo desactiva.

    Returns:
        region_map (H, W) int32  -> id de region contiguo (0..M-1)
        region_color list[int]   -> indice de paleta por region
        region_area  list[int]   -> area en pixeles por region
    """
    h, w = label_image.shape
    total = h * w
    min_area = max(1, int(total * (min_area_pct / 100.0)))

    # 1) Componentes conexas de color constante.
    #    background=-1: NINGUN indice de paleta se trata como fondo, asi cada
    #    color se separa en sus componentes conexas reales (con el default 0
    #    skimage fusionaria todas las zonas del color 0 en una sola region).
    regions = cc_label(label_image, background=-1, connectivity=1).astype(np.int64)
    n_regions = int(regions.max()) + 1  # etiquetas 0..n_regions-1

    # Color e indice de paleta de cada region inicial.
    flat_r = regions.ravel()
    flat_c = label_image.ravel()
    region_color = np.zeros(n_regions, dtype=np.int64)
    region_color[flat_r] = flat_c  # cada region es de color constante
    area = np.bincount(flat_r, minlength=n_regions).astype(np.int64)

    lab = _palette_lab(palette)
    adj = _build_adjacency(regions, n_regions)

    # Union-Find para registrar fusiones.
    parent = list(range(n_regions))
    active = int((area > 0).sum())  # nº de regiones reales (con pixeles)

    def find(x):
        root = x
        while parent[root] != root:
            root = parent[root]
        while parent[x] != root:
            parent[x], x = root, parent[x]
        return root

    def merge_into_best(root):
        """Fusiona `root` en su mejor vecino. Devuelve el root superviviente o None."""
        neighbors = adj.get(root)
        if not neighbors:
            return None  # region aislada
        # Mayor frontera compartida; desempate por color mas cercano en LAB.
        best_n, best_border, best_dist = None, -1, None
        my_lab = lab[region_color[root]]
        for nn, border in neighbors.items():
            nr = find(nn)
            if nr == root:
                continue
            d = float(np.linalg.norm(lab[region_color[nr]] - my_lab))
            if border > best_border or (border == best_border and (best_dist is None or d < best_dist)):
                best_n, best_border, best_dist = nr, border, d
        if best_n is None:
            return None

        parent[root] = best_n               # el vecino conserva su color
        area[best_n] += area[root]
        for nn, border in neighbors.items():
            nr = find(nn)
            if nr == best_n:
                continue
            adj[best_n][nr] += border
            adj[nr][best_n] += border
            adj[nr].pop(root, None)
        adj.pop(root, None)
        adj[best_n].pop(root, None)
        return best_n

    # 2a) Fusion por area: eliminar regiones por debajo de min_area (menor primero).
    heap = [(int(area[r]), r) for r in range(n_regions) if 0 < area[r] < min_area]
    heapq.heapify(heap)
    while heap:
        a_size, r = heapq.heappop(heap)
        root = find(r)
        if root != r or area[root] != a_size or area[root] >= min_area:
            continue  # obsoleta o ya supera el umbral
        surv = merge_into_best(root)
        if surv is not None:
            active -= 1
            if area[surv] < min_area:
                heapq.heappush(heap, (int(area[surv]), surv))

    # 2b) Tope de regiones: fusiona las mas pequenas hasta bajar de max_regions.
    if max_regions and active > max_regions:
        heap2 = [(int(area[r]), r) for r in range(n_regions) if area[r] > 0 and find(r) == r]
        heapq.heapify(heap2)
        while active > max_regions and heap2:
            a_size, r = heapq.heappop(heap2)
            root = find(r)
            if root != r or area[root] != a_size:
                continue  # obsoleta
            surv = merge_into_best(root)
            if surv is not None:
                active -= 1
                heapq.heappush(heap2, (int(area[surv]), surv))

    # 3) Reetiquetado a ids contiguos.
    roots = np.array([find(r) for r in range(n_regions)], dtype=np.int64)
    unique_roots = np.unique(roots)
    remap = np.zeros(n_regions, dtype=np.int64)
    remap[unique_roots] = np.arange(len(unique_roots))
    region_map = remap[roots][regions].astype(np.int32)

    m = len(unique_roots)
    out_color = [int(region_color[r]) for r in unique_roots]
    out_area = np.bincount(region_map.ravel(), minlength=m).astype(int).tolist()

    return region_map, out_color, out_area
