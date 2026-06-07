# Desplegar HappyColor (M3)

El backend (FastAPI) sirve **también el frontend**, así que es **un único
despliegue** y **una sola URL** (sin CORS). Lo que publicas:

- `upload.html` + `js/{svg-game,creations,finale}.js` (la app)
- API: `POST /generate`, `GET /capabilities`, `GET /health`

La app antigua (`index.html` y sus módulos) y la media pesada (`*.mp3`,
`*.png`) quedan fuera de la imagen gracias a `.dockerignore`.

---

## Lo que necesitas tú

1. **Una clave de Gemini** (modo IA): créala gratis en
   [Google AI Studio](https://aistudio.google.com/apikey). Para límites altos,
   activa *billing* en el proyecto de Google Cloud asociado.
2. **Una cuenta en un hosting con Docker** (recomendado: Render).

> Sin clave Gemini la app **funciona igual** en modo "sin IA" (el toggle de IA
> simplemente no aparece). La clave solo habilita el modo ilustración.

---

## Opción recomendada: Render (1 clic con `render.yaml`)

1. Asegúrate de que el repo está subido (esta rama ya lo está).
2. En [render.com](https://render.com) → **New → Blueprint** → elige este repo.
   Render lee `render.yaml`, construye el `Dockerfile` y publica una URL HTTPS.
3. En el panel del servicio → **Environment** → añade el secreto
   `STYLIZE_API_KEY` con tu clave Gemini. (`STYLIZE_PROVIDER=gemini` y
   `CORS_ORIGINS=*` ya vienen del blueprint.)
4. Espera al build (~5-10 min la primera vez) y abre la URL. ¡Listo!

**Memoria:** el plan `free` (512 MB) vale para *probar* pero puede quedarse
corto con fotos grandes y se *duerme* tras inactividad (arranque en frío ~30 s).
Para uso real, sube el plan a `standard` (2 GB) en `render.yaml` o desde el panel.

---

## Variables de entorno

| Variable           | Por defecto | Para qué |
|--------------------|-------------|----------|
| `STYLIZE_API_KEY`  | (vacío)     | Activa el modo IA. Clave de Gemini/OpenAI. |
| `STYLIZE_PROVIDER` | `gemini`    | `gemini` (gratis) u `openai` (de pago). |
| `STYLIZE_MODEL`    | (auto)      | Forzar un modelo concreto (opcional). |
| `CORS_ORIGINS`     | `*`         | Orígenes permitidos si el frontend se hospeda aparte. |
| `PORT`             | `8000`      | Lo inyecta la plataforma; no lo toques. |
| `FRONTEND_DIR`     | `/app`      | Dónde está `upload.html` (ya configurado en el Dockerfile). |

---

## Probar la imagen en local (Docker)

```bash
docker build -t happycolor .
docker run -p 8000:8000 -e STYLIZE_API_KEY="TU_CLAVE" happycolor
# abre http://localhost:8000
```

Sin Docker (desarrollo): `cd backend && pip install -r requirements.txt && uvicorn app:app --reload --port 8000`,
y abre `http://localhost:8000`. (Si sirves el HTML con otro servidor estático en
el :5500, la app apunta sola a `http://localhost:8000` para el API.)

---

## Otras plataformas (mismo `Dockerfile`)

- **Fly.io:** `fly launch` (detecta el Dockerfile) → `fly secrets set STYLIZE_API_KEY=...` → `fly deploy`. Pon `internal_port = 8000` en `fly.toml`.
- **Railway:** New Project → Deploy from repo (usa el Dockerfile) → añade la variable `STYLIZE_API_KEY`.
- **Google Cloud Run:** `gcloud run deploy --source .` y define la variable de entorno. Asigna ≥1 GB de memoria.
