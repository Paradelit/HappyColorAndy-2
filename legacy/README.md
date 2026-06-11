# legacy/ — HappyColor Andy-2 (app original)

Esta carpeta guarda la **app original "HappyColor Andy-2"** (un regalo): el juego
de pintar por números con niveles, llaves, música y galería de imágenes
predefinidas. Se conserva **íntegra** aquí para no perderla.

> **No forma parte de Color Memories** (la app que se publica) y **no se incluye
> en el despliegue** (queda fuera vía `.dockerignore`). El backend solo sirve la
> app nueva.

## Contenido
- `index.html` — entrada de la app original.
- `service-worker.js` — su PWA/offline.
- `js/` — `game.js`, `gallery.js`, `gallery_backup.js`, `data.js`, `keys.js`,
  `sync.js`, `tutorial.js`, `worker.js`, `db.js`, `audio.js`.
- Media: `*.mp3` (música y efectos), `lineas*.png` / `solucion*.png` (niveles),
  `icon.png`.

## Cómo ejecutarla (si quieres revisitarla)
```bash
cd legacy && python3 -m http.server 5500
# abre http://localhost:5500/
```

## Relación con Color Memories
Color Memories (en la raíz del repo) es una app nueva: foto → color-by-number
vectorial, cuentas, timelapse, etc. Reaprovecha **ideas** de esta app original
(pintar por números, paleta, zoom) pero es una base de código distinta. Si en el
futuro quieres traer algo de aquí (p. ej. la música o efectos), está todo a mano.
