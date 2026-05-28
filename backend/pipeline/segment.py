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

import cv2
import numpy as np
from skimage.measure import label as cc_label


def _palette_lab(palette):
    """Paleta RGB -> LAB (float) para medir cercania perceptual entre colores."""
    rgb = np.array([p["rgb"] for p in palette], dtype=np.uint8).reshape(1, -1, 3)
    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).reshape(-1, 3).astype(np.float32)
    return lab


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


def segment(label_image, palette, min_area_pct: float = 0.1):
    """Segmenta y fusiona regiones pequenas.

    Args:
        label_image: (H, W) indice de paleta por pixel (de quantize).
        palette: lista de la paleta (para distancia LAB en desempates).
        min_area_pct: area minima de una region como % del area total.

    Returns:
        region_map (H, W) int32  -> id de region contiguo (0..M-1)
        region_color list[int]   -> indice de paleta por region
        region_area  list[int]   -> area en pixeles por region
    """
    h, w = label_image.shape
    total = h * w
    min_area = max(1, int(total * (min_area_pct / 100.0)))

    # 1) Componentes conexas de color constante.
    regions = cc_label(label_image, connectivity=1).astype(np.int64)
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

    def find(x):
        root = x
        while parent[root] != root:
            root = parent[root]
        while parent[x] != root:
            parent[x], x = root, parent[x]
        return root

    # 2) Fusion lazy con heap de areas (entradas obsoletas se descartan al sacar).
    heap = [(int(area[r]), r) for r in range(n_regions) if area[r] < min_area]
    heapq.heapify(heap)

    while heap:
        a_size, r = heapq.heappop(heap)
        root = find(r)
        if root != r:
            continue  # ya fusionada
        if area[root] != a_size or area[root] >= min_area:
            continue  # entrada obsoleta o ya supera el umbral

        neighbors = adj.get(root)
        if not neighbors:
            continue  # region aislada (raro): se deja

        # Elegir vecino: mayor frontera compartida; desempate por color LAB.
        best_n, best_border, best_dist = None, -1, None
        my_lab = lab[region_color[root]]
        for n, border in neighbors.items():
            nr = find(n)
            if nr == root:
                continue
            d = float(np.linalg.norm(lab[region_color[nr]] - my_lab))
            if border > best_border or (border == best_border and (best_dist is None or d < best_dist)):
                best_n, best_border, best_dist = nr, border, d

        if best_n is None:
            continue

        # Fusionar root -> best_n (el vecino conserva su color).
        parent[root] = best_n
        area[best_n] += area[root]

        # Reescribir adyacencias de root hacia best_n.
        for n, border in neighbors.items():
            nr = find(n)
            if nr == best_n:
                continue
            adj[best_n][nr] += border
            adj[nr][best_n] += border
            adj[nr].pop(root, None)
        adj.pop(root, None)
        adj[best_n].pop(root, None)

        if area[best_n] < min_area:
            heapq.heappush(heap, (int(area[best_n]), best_n))

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
