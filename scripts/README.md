# Capturas de UI y tests e2e (dev)

## Tests end-to-end (`scripts/e2e.js`)
Suite de 31 asserts que recorre los flujos críticos con Chromium headless:
landing → registro/invitado → tutorial → generar (con/sin anuncio según plan)
→ pintar → pista → final/timelapse → persistencia → paywall demo.

```bash
# 1) arranca el servidor
(cd backend && uvicorn app:app --port 8000 &)
# 2) lanza la suite (sale con código 1 si algo falla)
node scripts/e2e.js http://localhost:8000     # o: npm run e2e
```

Cada escenario corre en un contexto de navegador aislado (storage y service
worker limpios). Esta suite es la **red de seguridad para refactorizar**
`svg-game.js` después del lanzamiento.


Herramientas para hacer **capturas reales** de la app con Chromium headless, y
así poder revisar la interfaz en este entorno (Claude Code en la web).

## Por qué funciona aquí
La política de red de este entorno bloquea la descarga de Chromium de Playwright
y de `apt`, **pero sí permite la de Puppeteer** (otro host). Chromium se ejecuta
con `--no-sandbox` porque el contenedor corre como root.

## Uso
```bash
# 1) una vez por sesión (lo hace solo el hook SessionStart en segundo plano):
bash scripts/setup-screenshots.sh

# 2) arranca el servidor y captura:
(cd backend && uvicorn app:app --port 8000 &)
node scripts/screenshot.js http://localhost:8000/ landing.png 402 --full
```

- `ancho < 700` → modo móvil (deviceScaleFactor 2). `--full` = página completa.
- Para automatizarlo en cada sesión, este repo trae un hook `SessionStart` en
  `.claude/settings.json` que ejecuta `setup-screenshots.sh` en segundo plano.

> `node_modules/` está en `.gitignore`: no se commitea Chromium. Tampoco entra en
> la imagen Docker (el Dockerfile solo copia el backend + el frontend).
