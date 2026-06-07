# ==========================================================================
# Imagen unica: API FastAPI (foto -> color-by-number) + frontend estatico.
# Sirve la web y el API en el mismo origen, asi que no hace falta CORS.
# ==========================================================================
FROM python:3.12-slim

# libgomp1: runtime de OpenMP que usan scikit-learn / scipy.
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencias primero (mejor cache de capas).
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Codigo del backend + frontend (el .dockerignore deja fuera la app antigua y la media).
COPY backend/ ./backend/
COPY upload.html ./upload.html
COPY js/ ./js/
# Ficheros PWA (instalable + offline)
COPY manifest.json sw.js icon-192.png icon-512.png ./

# El backend encuentra el frontend en /app (upload.html + js/).
ENV FRONTEND_DIR=/app
ENV PORT=8000

WORKDIR /app/backend
EXPOSE 8000

# La mayoria de plataformas (Render, Railway, Fly) inyectan $PORT.
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}"]
