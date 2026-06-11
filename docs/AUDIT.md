# Auditoría pre-lanzamiento — Color Memories

Revisión de **seguridad, accesibilidad (WCAG AA) y calidad/arquitectura**.
Marcado como ✅ corregido, 🟡 recomendado (pendiente) o ℹ️ nota.

## 1. Seguridad

| Hallazgo | Estado |
|---|---|
| **Decompression bomb / DoS** al decodificar imágenes con PIL | ✅ `/generate` comprueba dimensiones sin decodificar y rechaza >40 MP, no-imágenes y formatos no soportados (400/413). |
| **Fuerza bruta / spam** en registro y login (sin límite) | ✅ Rate limiting en memoria por IP: registro 5/h, login 10/15min + bloqueo tras 5 fallos; `/generate` 40/h. Respeta `x-forwarded-for`. |
| **XSS** al inyectar datos de usuario (email) en `innerHTML` | ✅ `cmEsc()` escapa email/plan en el modal de ajustes y recuperación. |
| Contraseñas en claro | ✅ Ya se guardaban con PBKDF2-HMAC-SHA256 (200k iter) + salt. Tokens firmados con HMAC y caducidad. |
| Inyección SQL | ℹ️ Consultas parametrizadas en todo `accounts.py`. OK. |
| Path traversal en ficheros estáticos | ℹ️ Rutas servidas desde una *whitelist* fija. OK. |
| CORS `*` | 🟡 Aceptable con auth por token (sin cookies), pero en producción conviene fijar `CORS_ORIGINS` a tu dominio. |
| Borrado de cuenta con Supabase | 🟡 Hoy borra todos los datos del usuario; eliminar también el registro de `auth.users` requiere una función `service_role` en el servidor (pendiente para el despliegue). |
| Hash de contraseña | 🟡 PBKDF2 es correcto; para máxima robustez se podría migrar a argon2/bcrypt (no bloqueante; además con Supabase lo gestiona él). |

## 2. Accesibilidad (WCAG AA)

| Área | Estado |
|---|---|
| Foco de teclado visible | ✅ `:focus-visible` en todos los controles. |
| Botones de icono sin nombre | ✅ `aria-label` en herramientas, volver, borrar, ajustes; `alt` en imágenes. |
| Diálogos (modales) | ✅ `role="dialog"` + `aria-modal` + `aria-labelledby`; el foco entra al abrir y vuelve al cerrar; **Escape** cierra. |
| Navegación por teclado | ✅ Tarjetas de la galería operables (Enter/Espacio); enlaces-acción convertidos a `<button>`. |
| Contraste de texto | ✅ Subidos los grises sobre tarjetas blancas y textos atenuados sobre fondo oscuro a ratios AA. |
| Idioma, títulos, *reduced-motion* | ✅ `lang="es"`, jerarquía de encabezados, `prefers-reduced-motion` en landing y demo. |
| Auditoría automática (headless) | ✅ 0 botones sin nombre · 0 imágenes sin alt · 0 inputs sin etiqueta. |
| Revisión manual con lector de pantalla | 🟡 Recomendada una pasada final con VoiceOver/TalkBack en el móvil real. |

## 3. Calidad y arquitectura

| Tema | Estado / Recomendación |
|---|---|
| **Tests** | ✅ Añadida batería del backend (`backend/tests/`, 8 tests con FastAPI TestClient: auth, sync, RGPD, rate-limit, validación de imagen). 🟡 Faltan tests de frontend (e2e). |
| Aislamiento de capas | ℹ️ `Auth` (cuentas/sync), `Membership`/`Hints`, `Consent`, `Ads`, `Creations`, `Finale` están bien separados. El backend solo expone API + estáticos. |
| **`svg-game.js` monolítico** (~1200 líneas) | 🟡 Mezcla router/vistas, galería, juego, modales y ajustes. Recomendado dividir en módulos (p. ej. `views/`, `game/`, `ui/modals`) en una refactor futura; no bloquea el lanzamiento. |
| Módulos JS globales (sin bundler) | ℹ️ Scripts clásicos con objetos globales. Correcto para este tamaño; migrar a ES modules + bundler (Vite) facilitaría tree-shaking y tests. |
| **Código heredado** (`index.html`, `js/game.js`, `gallery*.js`, `data.js`, `keys.js`, `sync.js`, `tutorial.js`, `worker.js`, `db.js`, `audio.js` y media `*.mp3`/`*.png`) | 🟡 No los usa la app nueva y quedan fuera del Docker, pero **inflan el repo**. Recomendado moverlos a `legacy/` o borrarlos (decisión tuya; es tu app anterior). |
| Claves de `localStorage` (`andycolor_*`) | ℹ️ Aún con el prefijo antiguo tras el rebrand. Funciona; renombrar requeriría migración. Baja prioridad. |
| Versionado del Service Worker | ℹ️ Manual (bump por cambio). Correcto; se podría automatizar con hash del build. |
| Caché del SDK de Supabase | ✅ Vendorizado (`js/supabase.js`), servido en mismo origen (sin dependencia de CDN). |
| Manejo de errores | ℹ️ Backend captura y devuelve 4xx/5xx con mensaje; frontend con `try/catch` y *toasts*. OK. |

## 4. Pendiente (depende de cuentas/decisiones tuyas)
- **Supabase**: crear proyecto + pegar `url`/`anon key` en `js/config.js` (guía en `docs/SUPABASE_SETUP.md`).
- **Hosting**: desplegar (`DEPLOY.md`) con disco persistente y `CORS_ORIGINS` fijado.
- **CMP certificado** de Google para AdSense/AdMob en la UE (el banner actual cubre el flujo).
- **Stripe** real para el plan Plus.
- Rellenar datos legales `[entre corchetes]` y que lo revise un profesional.

## Cómo ejecutar los tests
```bash
cd backend && pip install -r requirements-dev.txt && pytest -q
```
