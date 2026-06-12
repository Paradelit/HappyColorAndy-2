# Color Memories — contexto del proyecto (leer al iniciar sesión)

App PWA mobile-first que convierte **fotos en cuadros de pintar por números
(SVG vectorial)**: subes una foto, la pintas tocando, ves un timelapse y la
compartes. Idioma de la app y del usuario: **español**. Marca: **Color Memories**
("Pinta tus recuerdos"). La app antigua ("HappyColor Andy-2", un regalo) está
archivada íntegra en `legacy/` y NO se toca ni se despliega.

## Estructura
- **Frontend** (raíz): `index.html` (SPA: landing → auth → galería → subir → juego)
  + `js/`:
  - `svg-game.js` — núcleo (vistas/rutas, juego SVG, galería, ajustes, modales,
    comparador antes/después, iconos `CM_ICONS`). Monolito ~1400 líneas: hay
    suite e2e como red para refactorizarlo post-lanzamiento.
  - `auth.js` — cuentas **modo dual**: usa **Supabase** (Google + email,
    perfiles y sync con RLS) si `js/config.js` tiene url+anonKey; si no, cae al
    backend propio (`/auth/*`, `/sync/*`). Misma forma de `Auth.user`
    `{email, plan, hints, tutorialDone}` en ambos.
  - `config.js` — config pública del cliente (**aquí se pegan** los valores de
    Supabase). Vacío = login propio.
  - `supabase.js` — SDK supabase-js v2 UMD **vendorizado** (no usar CDN: este
    sandbox bloquea jsdelivr; en prod sí funciona).
  - `membership.js` (planes Free/Plus €5 + pistas), `ads.js` (anuncios mock),
    `consent.js` (banner cookies), `creations.js` (IndexedDB), `finale.js`
    (timelapse/compartir), `landing.js` (animaciones landing).
  - PWA: `sw.js` (cache `cm-v13`; **subir versión en cada cambio de UI**),
    `manifest.json`, `icon-192/512.png`.
- **Backend** `backend/`: FastAPI sirve frontend + API.
  - `app.py` — `/generate` (foto→doc SVG; valida imagen ≤25MB/≤40MP, rate-limit,
    auth opcional `GENERATE_REQUIRE_AUTH`), sirve estáticos y `/privacy` `/terms`.
  - `accounts.py` — login propio (SQLite en `DATA_DIR`, PBKDF2 + token HMAC,
    rate-limit, RGPD export/delete). Es el **fallback**; con Supabase activo el
    cliente no lo usa.
  - `pipeline/` — algoritmo. `lineart.py::build_photo` = **modelo simple**:
    posterizado limpio LAB (`n_colors`) → regiones = componentes conexas → cada
    región 1 número, relleno = su **media real** (multitono). Presets
    `PHOTO_DIFFICULTY` (easy 18 / medium 30 / hard 46 colores). El modo IA
    (`build_lineart` + `stylize.py`) está intacto pero oculto en v1 (ver
    `docs/AI_MODE_V2.md`).
- **Tests**: `backend/tests/` (8, pytest) y `scripts/e2e.js` (37 asserts,
  Puppeteer). Despliegue: `Dockerfile`, `render.yaml`, `DEPLOY.md`.
- Docs clave: `docs/SUPABASE_SETUP.md`, `docs/AUDIT.md`, `docs/AI_MODE_V2.md`.

## Cómo ejecutar y verificar (en este entorno remoto)
```bash
# servidor
cd backend && uvicorn app:app --port 8000 &
# tests backend
cd backend && python3 -m pytest tests/ -q
# capturas/e2e: instala Puppeteer+Chromium PRIMERO (idempotente; /tmp se borra
# entre sesiones). La descarga de Chromium de Puppeteer SÍ pasa el egress.
bash scripts/setup-screenshots.sh
node scripts/e2e.js http://localhost:8000
node scripts/screenshot.js http://localhost:8000/ shot.png 402 --full
```
- Chromium necesita `--no-sandbox` (ya puesto en los scripts).
- `cairosvg` (Python) sirve para rasterizar los docs SVG en tests visuales.
- Para servir en tests del navegador: poner `document.getElementById('backend-url').value=''`
  (mismo origen) y usar contextos de navegador AISLADOS (el SW contamina cachés).

## Lecciones importantes (no repetir errores)
1. **Probar el algoritmo SIEMPRE con fotos reales** (`skimage.data.astronaut()/
   chelsea()/coffee()`), nunca solo sintéticas. Un "two-level + merge de
   clusters" pasó los tests sintéticos y destrozó el dibujo en fotos reales
   (se revirtió en commit 6a49dfc). El criterio: el dibujo SIN pintar debe
   delinear claramente al sujeto, y el pintado parecerse a la foto.
2. La red del sandbox bloquea jsdelivr/Google Fonts/api.supabase.com (en prod
   funcionan). npm y PyPI sí van.
3. El completado de un color lo gestiona SOLO `updateColorBtn` (idempotente);
   no añadir comprobaciones por otros caminos (causaba el bug del "número
   pillado").
4. La foto original del usuario se guarda SOLO en local (`creation.original`)
   y se excluye del sync (privacidad) — ver `Auth.pushCreation`.

## ▶️ TAREA PENDIENTE INMEDIATA: activar Supabase
El usuario ha conectado un **MCP de Supabase** (buscar herramientas con
ToolSearch: `+supabase`). Con él:
1. Ejecutar el SQL de **`supabase/schema.sql`** en el proyecto (crea `profiles`
   y `creations` con RLS + trigger de perfil). Es idempotente.
2. Obtener **Project URL** y **anon key** (pública, NUNCA la service_role) y
   pegarlas en **`js/config.js`** (`window.CM_CONFIG.supabase`).
3. Comprobar que el provider **Email** está activado (y si se puede, desactivar
   "Confirm email" para probar; Google OAuth lo configura el usuario aparte,
   necesita Google Cloud Console — guía en `docs/SUPABASE_SETUP.md`).
4. Verificar con navegador headless: con config puesta, `Auth.usesSupabase()`
   es true y aparece el botón "Continuar con Google" + enlace "¿Olvidaste tu
   contraseña?" en login (`SvgGame.showAuth('login')`). Si hay red al proyecto,
   probar registro email real end-to-end.
5. Subir `sw.js` a `cm-v14`, commit + push.
6. Después: guiar despliegue en Render (`DEPLOY.md`); en Auth → URL
   Configuration de Supabase habrá que añadir la URL de producción.

## Git
Rama de trabajo: `claude/photo-color-by-number-XvClM` (desarrollar y pushear
SIEMPRE aquí). Todo el historial de decisiones está en los mensajes de commit.
