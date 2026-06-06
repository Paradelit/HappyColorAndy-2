# Modo "Ilustración (IA)" — foto → dibujo → color-by-number

Happy Color parte de **ilustraciones**, no de fotos. Para acercarnos a esa
calidad, este modo convierte primero tu foto en una **ilustración limpia**
(colores planos, contornos definidos) usando IA, y luego genera el
color-by-number de esa ilustración.

Es **opcional**: el backend funciona sin esto (pipeline normal). Solo se activa
si configuras una clave de API.

## Activarlo (proveedor por defecto: OpenAI)

1. Consigue una API key de OpenAI: https://platform.openai.com/api-keys
   (tiene coste por imagen, unos pocos céntimos; las imágenes se envían a OpenAI).

2. Instala la dependencia (ya está en requirements.txt):
   ```
   pip install -r requirements.txt
   ```

3. Define la variable de entorno antes de arrancar el backend:

   **Git Bash (Windows):**
   ```bash
   export STYLIZE_API_KEY="sk-...tu_clave..."
   python -m uvicorn app:app --reload --port 8000
   ```

   **PowerShell:**
   ```powershell
   $env:STYLIZE_API_KEY="sk-...tu_clave..."
   python -m uvicorn app:app --reload --port 8000
   ```

4. En la app, al subir una foto aparecerá el interruptor
   **"✨ Convertir en ilustración (IA)"**. Actívalo y dale a Generar.

## Variables de entorno

| Variable           | Por defecto    | Para qué |
|--------------------|----------------|----------|
| `STYLIZE_API_KEY`  | (vacío)        | Activa el modo. Obligatoria. |
| `STYLIZE_PROVIDER` | `openai`       | Proveedor de estilizado. |
| `STYLIZE_MODEL`    | `gpt-image-1`  | Modelo de imagen (OpenAI). |

## Ajustar el resultado

El "prompt" que convierte la foto está en `pipeline/stylize.py` (constante
`PROMPT`). Si las ilustraciones salen poco limpias o poco fieles, ahí se ajusta.

## Otros proveedores

`stylize.py` está preparado para añadir más proveedores (p. ej. Replicate con
modelos de line-art/cartoon, que suelen dar contornos aún más limpios). Añade
una función `_stylize_<proveedor>` y un caso en `stylize()`.
