"""Color fiel por region, agrupacion en "numeros" y senales para la UI.

- FILL: color real (fiel) de cada region = media de sus pixeles. Cientos de
  fills distintos -> imagen final casi identica al original.
- NUMERO/GRUPO: agrupamiento grueso de esos colores fieles (lo unico que el
  jugador distingue). Cada grupo sabe si es "multitono" (sus regiones varian de
  tono) o plano, para marcarlo distinto en la paleta.
- EDGE: fuerza del borde de cada region en el original -> sirve para variar el
  grosor de linea segun la profundidad (primer plano = bordes fuertes = grueso).
"""

import numpy as np
from skimage.color import rgb2gray, rgb2lab, lab2rgb
from skimage.filters import sobel
from skimage.segmentation import find_boundaries
from sklearn.cluster import KMeans

MULTITONE_SPREAD = 11.0  # desviacion de color (0-255) a partir de la cual un grupo es "multitono"


def _hex(r, g, b):
    return "#%02x%02x%02x" % (int(r), int(g), int(b))


def region_mean_colors(region_map, n_regions, rgb):
    """Color medio (fiel) de cada region. Devuelve array (n_regions, 3) uint8."""
    flat = region_map.ravel()
    counts = np.bincount(flat, minlength=n_regions).astype(np.float64)
    counts[counts == 0] = 1.0
    means = np.empty((n_regions, 3), dtype=np.float64)
    for c in range(3):
        means[:, c] = np.bincount(
            flat, weights=rgb[:, :, c].ravel().astype(np.float64), minlength=n_regions
        ) / counts
    return np.clip(np.round(means), 0, 255).astype(np.uint8)


def boundary_edge_strength(region_map, n_regions, rgb):
    """Fuerza media del borde de cada region en el original, normalizada 0..1.

    Regiones de primer plano (enfocadas, con contraste) tienen bordes fuertes;
    el fondo (suave, desenfocado) bordes debiles. Se usa para el grosor de linea.
    """
    grad = sobel(rgb2gray(rgb.astype(np.float64) / 255.0))
    bnd = find_boundaries(region_map, mode="inner", connectivity=1).ravel()
    flat = region_map.ravel()
    g = grad.ravel()
    sums = np.bincount(flat[bnd], weights=g[bnd], minlength=n_regions)
    cnts = np.bincount(flat[bnd], minlength=n_regions).astype(np.float64)
    cnts[cnts == 0] = 1.0
    strength = sums / cnts
    pos = strength[strength > 0]
    hi = np.percentile(pos, 88) if pos.size else 1.0
    return np.clip(strength / (hi + 1e-6), 0.0, 1.0)


def fills_and_groups(region_map, n_regions, rgb, n_groups, seed=42):
    """Fills fieles por region + agrupacion en numeros con metadatos de UI.

    Returns:
        fills   list[str]  -> hex fiel por region
        groups  list[int]  -> indice de grupo (numero) por region
        palette list[dict] -> [{index, hex, multitone, swatches:[hex,...]}]
    """
    means = region_mean_colors(region_map, n_regions, rgb)            # (m, 3)
    fills = [_hex(*means[i]) for i in range(n_regions)]

    means_lab = rgb2lab(means.reshape(1, -1, 3) / 255.0).reshape(-1, 3)
    k = int(max(1, min(n_groups, n_regions)))
    km = KMeans(n_clusters=k, random_state=seed, n_init=4).fit(means_lab)
    groups = km.labels_.astype(int)

    centers_rgb = (np.clip(lab2rgb(km.cluster_centers_.reshape(1, -1, 3)), 0, 1) * 255.0)
    centers_rgb = np.round(centers_rgb).reshape(-1, 3).astype(np.uint8)

    palette = []
    for i in range(k):
        members = means[groups == i]
        if len(members) > 1:
            spread = float(np.mean(np.std(members.astype(np.float64), axis=0)))
            lum = members.astype(np.float64) @ np.array([0.299, 0.587, 0.114])
            order = np.argsort(lum)
            picks = order[[0, len(order) // 2, len(order) - 1]]
            swatches = [_hex(*members[p]) for p in picks]
        else:
            spread = 0.0
            swatches = [_hex(*members[0])] if len(members) else [_hex(*centers_rgb[i])]
        palette.append({
            "index": i,
            "hex": _hex(*centers_rgb[i]),
            "multitone": bool(spread > MULTITONE_SPREAD),
            "swatches": swatches,
        })

    return fills, groups.tolist(), palette


def paint_clusters(region_map, n_regions, groups):
    """Agrupa regiones CONTIGUAS del mismo numero en un mismo "cluster".

    Asi un solo clic pinta todas las regiones contiguas que comparten numero
    (cada una con su tono fiel), en vez de exigir un clic por region. Regiones
    del mismo numero pero NO contiguas quedan en clusters distintos.

    Returns: list[int] -> id de cluster (contiguo) por region.
    """
    groups = np.asarray(groups)
    parent = list(range(n_regions))

    def find(x):
        root = x
        while parent[root] != root:
            root = parent[root]
        while parent[x] != root:
            parent[x], x = root, parent[x]
        return root

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    # Pares de regiones vecinas (unicos) -> unir si comparten numero.
    def neighbor_pairs(a, b):
        m = a != b
        if not m.any():
            return np.empty(0, np.int64), np.empty(0, np.int64)
        lo = np.minimum(a[m], b[m]).astype(np.int64)
        hi = np.maximum(a[m], b[m]).astype(np.int64)
        key = np.unique(lo * (n_regions + 1) + hi)
        return key // (n_regions + 1), key % (n_regions + 1)

    rm = region_map
    for a, b in (
        neighbor_pairs(rm[:, :-1].ravel(), rm[:, 1:].ravel()),
        neighbor_pairs(rm[:-1, :].ravel(), rm[1:, :].ravel()),
    ):
        for ra, rb in zip(a, b):
            if groups[ra] == groups[rb]:
                union(int(ra), int(rb))

    # Ids de cluster contiguos.
    remap = {}
    clusters = []
    for i in range(n_regions):
        r = find(i)
        if r not in remap:
            remap[r] = len(remap)
        clusters.append(remap[r])
    return clusters
