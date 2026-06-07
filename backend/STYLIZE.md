# Modo "Ilustración (IA)" — foto → dibujo → color-by-number

Happy Color parte de **ilustraciones**, no de fotos. Para acercarnos a esa
calidad, este modo convierte primero tu foto en una **ilustración limpia**
(colores planos, contornos definidos) usando IA, y luego genera el
color-by-number de esa ilustración.

Es **opcional**: el backend funciona sin esto (pipeline normal). Solo se activa
si configuras una clave de API.

## Opción recomendada: Google Gemini (free tier generoso) 🆓

1. Consigue una API key **gratis** en Google AI Studio:
   https://aistudio.google.com/apikey

2. Instala la dependencia:
   ```bash
   pip install google-genai
   ```

3. Define la variable de entorno antes de arrancar el backend:

   **Git Bash (Windows):**
   ```bash
   export STYLIZE_API_KEY="tu_clave_de_google"
   python -m uvicorn app:app --reload --port 8000
   ```

   **PowerShell:**
   ```powershell
   $env:STYLIZE_API_KEY="tu_clave_de_google"
   python -m uvicorn app:app --reload --port 8000
   ```

4. En la app, al subir una foto aparecerá el interruptor
   **"✨ Convertir en ilustración (IA)"**. Actívalo y dale a Generar.

## Variables de entorno

| Variable           | Por defecto         | Para qué |
|--------------------|---------------------|----------|
| `STYLIZE_API_KEY`  | (vacío)             | Activa el modo. Obligatoria. |
| `STYLIZE_PROVIDER` | `gemini`            | `gemini` (gratis) o `openai` (de pago). |
| `STYLIZE_MODEL`    | (cadena automática) | Fuerza un único modelo. Si no se define, usa la cadena de fallback. |

**Cadena de modelos Gemini** (prueba el mejor primero; si falla o no hay cuota,
pasa al siguiente automáticamente):

1. `gemini-3.1-flash-image` — Nano Banana 2 (primario)
2. `gemini-3-pro-image` — Nano Banana Pro (backup, más calidad)
3. `gemini-2.5-flash-image` — Nano Banana (backup)

Para forzar uno solo: `export STYLIZE_MODEL="gemini-3-pro-image"`.

## Alternativa: OpenAI (de pago)

```bash
pip install openai
export STYLIZE_PROVIDER="openai"
export STYLIZE_API_KEY="sk-...tu_clave..."
```

## Ajustar el resultado

El "prompt" que convierte la foto está en `pipeline/stylize.py` (constante
`PROMPT`). Si las ilustraciones salen poco limpias o poco fieles, ahí se ajusta.

## Más proveedores

`stylize.py` está preparado para añadir proveedores (p. ej. Hugging Face o
Replicate con modelos de line-art/cartoon). Añade una función
`_stylize_<proveedor>` y un caso en `stylize()`.
