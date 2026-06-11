#!/usr/bin/env bash
# Prepara las capturas de UI: instala Puppeteer (descarga Chromium) si falta.
# Idempotente: si ya está, sale rápido. Se ejecuta solo desde el hook
# SessionStart (en segundo plano) y también se puede lanzar a mano.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -d node_modules/puppeteer ]; then
  exit 0
fi

echo "Instalando Puppeteer + Chromium para capturas de UI..."
npm install --no-audit --no-fund
echo "Listo. Ejemplo:"
echo "  (cd backend && uvicorn app:app --port 8000 &)"
echo "  node scripts/screenshot.js http://localhost:8000/ landing.png 402 --full"
