#!/usr/bin/env node
// Captura de pantalla de la app con Chromium headless (Puppeteer).
// Uso:
//   node scripts/screenshot.js <url> [salida.png] [ancho] [--full]
// Ejemplos:
//   node scripts/screenshot.js http://localhost:8000/ landing.png 402 --full
//   node scripts/screenshot.js http://localhost:8000/ desktop.png 1200
//
// Nota: usa --no-sandbox porque en contenedores se suele ejecutar como root.
const puppeteer = require('puppeteer');

(async () => {
  const args = process.argv.slice(2);
  const url = args[0];
  if (!url) {
    console.error('uso: node scripts/screenshot.js <url> [salida.png] [ancho] [--full]');
    process.exit(1);
  }
  const out = args[1] && !args[1].startsWith('--') ? args[1] : 'screenshot.png';
  const width = parseInt(args.find(a => /^\d+$/.test(a)) || '402', 10);
  const full = args.includes('--full');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--force-color-profile=srgb'],
  });
  const page = await browser.newPage();
  const mobile = width < 700;
  await page.setViewport({ width, height: Math.round(width * 2.17), deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: out, fullPage: full });
  await browser.close();
  console.log('guardado', out);
})().catch(e => { console.error(String(e)); process.exit(1); });
