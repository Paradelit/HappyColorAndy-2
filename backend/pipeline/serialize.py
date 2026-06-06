"""Etapa 6: ensamblado del JSON de salida.

Formato consumido por el frontend (coords en espacio-imagen para que el
viewBox="0 0 width height" del SVG haga el zoom trivial):

{
  "version": 1, "width": W, "height": H,
  "palette": [ {index, hex, multitone, swatches:[...]}, ... ],
  "regions": [ {id, color, fill, area, edge, d, label:{x,y,size}|null}, ... ]
}

  - color    = numero (grupo) que el jugador selecciona
  - fill     = color real (fiel) con el que se rellena la region
  - edge     = fuerza de borde 0..1 (grosor de linea / profundidad)
  - multitone= si ese numero pinta en varios tonos (marca especial en paleta)
"""


def assemble(width, height, palette, region_group, region_area, region_fill, region_edge, region_cluster, paths, labels):
    regions = []
    for rid, d in paths.items():
        regions.append(
            {
                "id": int(rid),
                "color": int(region_group[rid]),                       # numero (grupo)
                "cluster": int(region_cluster[rid]),                   # un clic pinta todo el cluster
                "fill": region_fill[rid],                              # color fiel real
                "area": int(region_area[rid]) if rid < len(region_area) else 0,
                "edge": round(float(region_edge[rid]), 3) if rid < len(region_edge) else 0.0,
                "d": d,
                "label": labels.get(rid),
            }
        )
    regions.sort(key=lambda r: r["id"])

    return {
        "version": 1,
        "width": int(width),
        "height": int(height),
        "palette": palette,
        "regions": regions,
    }
