"""Etapa 6: ensamblado del JSON de salida.

Formato consumido por el frontend (coords en espacio-imagen para que el
viewBox="0 0 width height" del SVG haga el zoom trivial):

{
  "version": 1, "width": W, "height": H,
  "palette": [ {index, hex}, ... ],
  "regions": [ {id, color, d, label:{x,y,size}|null}, ... ]
}
"""


def assemble(width, height, palette, region_group, region_area, region_fill, paths, labels):
    regions = []
    for rid, d in paths.items():
        regions.append(
            {
                "id": int(rid),
                "color": int(region_group[rid]),                 # numero (grupo)
                "fill": region_fill[rid],                        # color fiel real
                "area": int(region_area[rid]) if rid < len(region_area) else 0,
                "d": d,
                "label": labels.get(rid),
            }
        )
    regions.sort(key=lambda r: r["id"])

    return {
        "version": 1,
        "width": int(width),
        "height": int(height),
        "palette": [{"index": p["index"], "hex": p["hex"]} for p in palette],
        "regions": regions,
    }
