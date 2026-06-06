"""Color fiel por region + agrupacion en "numeros" (estilo Happy Color).

Idea clave: separar dos cosas que normalmente van juntas:
  - el FILL: el color real (fiel) con el que se rellena cada region, calculado
    como la media de los pixeles originales de esa region. Puede haber cientos
    de fills distintos -> la imagen final es casi identica a la realidad.
  - el NUMERO/GRUPO: un agrupamiento grueso (~30) de esos colores fieles. Es lo
    unico que el jugador tiene que distinguir. Varias regiones comparten numero
    (p.ej. "4 = verde") pero cada una se pinta con su verde exacto.
"""

import numpy as np
from skimage.color import rgb2lab, lab2rgb
from sklearn.cluster import KMeans


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


def fills_and_groups(region_map, n_regions, rgb, n_groups, seed=42):
    """Calcula fills fieles por region y los agrupa en `n_groups` numeros.

    Returns:
        fills   list[str]  -> hex fiel por region
        groups  list[int]  -> indice de grupo (numero) por region
        palette list[dict] -> [{index, hex}] color representativo de cada numero
    """
    means = region_mean_colors(region_map, n_regions, rgb)            # (m, 3)
    fills = [_hex(*means[i]) for i in range(n_regions)]

    # Agrupar los colores fieles en numeros (k-means perceptual en LAB).
    means_lab = rgb2lab(means.reshape(1, -1, 3) / 255.0).reshape(-1, 3)
    k = int(max(1, min(n_groups, n_regions)))
    km = KMeans(n_clusters=k, random_state=seed, n_init=4).fit(means_lab)
    groups = km.labels_.astype(int).tolist()

    # Color representativo de cada numero = centroide del grupo (en RGB).
    centers_rgb = (np.clip(lab2rgb(km.cluster_centers_.reshape(1, -1, 3)), 0, 1) * 255.0)
    centers_rgb = np.round(centers_rgb).reshape(-1, 3).astype(np.uint8)
    palette = [{"index": i, "hex": _hex(*centers_rgb[i])} for i in range(k)]

    return fills, groups, palette
