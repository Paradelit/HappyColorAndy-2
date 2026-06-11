# Modo IA — estado guardado para la v2

> Este documento congela TODO lo que ya tenemos del modo IA para retomarlo en la
> v2. El código sigue en el repo (no se ha borrado): solo está **oculto en la
> UI** de la v1. Reactivarlo es, sobre todo, volver a mostrar el toggle.

## La visión (v2)

El usuario **describe con un prompt** qué quiere hacer con su foto
(p. ej. *"versión Disney"*, *"acuarela"*, *"estilo cómic"*). La IA genera una
**ilustración estilizada** de la foto y, sobre esa ilustración limpia, se crea
el color-by-number. Es decir:

```
foto del usuario  ─▶  IA (prompt) ─▶  ilustración estilizada  ─▶  color-by-number
```

Esto es distinto del modo sin IA (v1), que hace el color-by-number directamente
de la foto. El modo IA da resultados tipo "lámina premium" porque parte de un
dibujo con tinta limpia, no de una foto con ruido/degradados.

## Qué hay YA implementado (y funciona)

| Pieza | Fichero | Estado |
|---|---|---|
| Generación foto→ilustración (Gemini "Nano Banana" + OpenAI fallback) | `backend/pipeline/stylize.py` | ✅ funcional, pluggable por env |
| Color-by-number por LÍNEAS de una ilustración (tinta → piezas) | `backend/pipeline/lineart.py` → `build_lineart(ink=True)` | ✅ funcional |
| Overlay vectorial desde la tinta | `lineart.py` → `line_overlay_path()` | ✅ |
| Rama `stylize=True` en el pipeline | `backend/pipeline/runner.py` | ✅ intacta (se ejecuta si llega `stylize=true`) |
| Endpoint `/capabilities` (dice si hay clave IA) | `backend/app.py` | ✅ |
| Toggle de IA + selector multitono/plano en la UI | `index.html` (`#ai-toggle`) | 🔒 **oculto en v1** (`svg-game.js` fuerza `aiToggle.hidden = true`) |
| Doc de configuración del proveedor | `backend/STYLIZE.md` | ✅ |

### Cómo se activa hoy (técnicamente)
1. Definir `STYLIZE_API_KEY` (Gemini) en el backend → `/capabilities` devuelve `{stylize:true}`.
2. El frontend, si destapa el toggle, manda `stylize=true` en `POST /generate`.
3. `runner.py` llama a `ai_stylize(file_bytes)` (genera la ilustración) y luego
   `build_lineart(ink=True)` para el color-by-number.

### Configuración (env)
- `STYLIZE_API_KEY` — clave del proveedor (obligatoria para activar).
- `STYLIZE_PROVIDER` — `gemini` (free tier, por defecto) | `openai` (de pago).
- `STYLIZE_MODEL` — forzar un modelo concreto (opcional).
- Modelos Gemini probados en cadena: `gemini-3.1-flash-image` (Nano Banana 2),
  `gemini-3-pro-image` (Pro), `gemini-2.5-flash-image`.
- ⚠️ La generación de imágenes de Gemini **requiere facturación activada** en
  Google AI Studio (el free tier de *imagen* es 0). Texto→texto sí es gratis.

### El prompt actual
Está fijo en `stylize.py` (`PROMPT`): pide "ilustración detallada estilo
paint-by-numbers, tinta negra limpia que delinea todo, colores planos fieles a
la foto, misma composición". Para la v2 hay que **parametrizar el prompt** con
lo que escriba el usuario (ver más abajo).

## Lo que falta para la v2 (TODO)

1. **Input de prompt en la UI**: caja de texto ("¿qué quieres crear?") +
   ejemplos rápidos (Disney, acuarela, cómic, Pixar…). Volver a mostrar el
   `#ai-toggle` (quitar el `aiToggle.hidden = true` de `svg-game.js`).
2. **Pasar el prompt al backend**: añadir campo `prompt` a `POST /generate` y a
   `stylize(image_bytes, prompt=...)`; combinarlo con el `PROMPT` base
   (estilo + "respeta composición") para no perder la calidad de las líneas.
3. **Vista previa de la ilustración** antes de hacer el color-by-number, con
   opción "regenerar" (cuesta otra llamada IA) — decidir si se cobra por intento.
4. **Monetización**: la IA es de pago (coste real por imagen). Opciones a decidir:
   - créditos de IA (N generaciones por compra), o
   - incluida en un plan superior, o
   - micro-pago por generación.
   El gating ya tiene el sitio: `Membership` + paywall en `js/membership.js`.
5. **Coste y límites**: rate-limit por usuario, tamaño máximo, control de gasto
   (la generación de imágenes cuesta dinero por llamada).
6. **Moderación de contenido**: al permitir prompts libres + fotos, conviene
   filtrar usos indebidos (caras de terceros, contenido sensible) según las
   políticas del proveedor.
7. **Privacidad**: el modo IA **envía la foto a Google/OpenAI**. Hay que
   reflejarlo en la política de privacidad y pedir consentimiento explícito
   antes de usarlo (el modo sin IA NO envía la foto a terceros).

## Decisiones abiertas
- ¿Proveedor definitivo? Gemini (más barato/free-ish) vs OpenAI (calidad).
- ¿Prompt totalmente libre o estilos predefinidos (más controlable y barato)?
- ¿Cómo se cobra (créditos / plan / micro-pago)?
- ¿Guardamos la ilustración generada para reusarla (caché) o se regenera?

## Para reactivarlo en una rama de pruebas
```python
# backend: define la clave y arranca
export STYLIZE_API_KEY="...tu_clave_gemini..."
# frontend: en js/svg-game.js, en bindUpload(), quita/condiciona:
#   this.ui.aiToggle.hidden = true;   <-- esta línea oculta el modo IA en v1
# y vuelve a llamar a this.checkCapabilities() para que aparezca si hay clave.
```
El historial de git con toda la evolución del modo IA está en los commits
anteriores a la v1 (busca "AI mode" / "stylize" / "lineart").
