#!/usr/bin/env node
// E2E de Color Memories con Chromium headless (Puppeteer).
//
// Uso:  node scripts/e2e.js http://localhost:8000
// (arranca antes el servidor: cd backend && uvicorn app:app --port 8000)
//
// Cada escenario corre en un contexto de navegador AISLADO (storage/SW limpios)
// para evitar contaminación entre tests. Sale con código 1 si algo falla.

let puppeteer;
try { puppeteer = require('puppeteer'); }
catch (e) { puppeteer = require('/tmp/node_modules/puppeteer'); }

const path = require('path');
const BASE = process.argv[2];
if (!BASE) { console.error('uso: node scripts/e2e.js <url-del-servidor>'); process.exit(1); }

const PHOTO = path.join(__dirname, 'fixtures', 'test-photo.jpg');
const CONSENT = JSON.stringify({ v: 1, ts: Date.now(), analytics: true, ads: true });

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { failed++; console.log('  ✗', msg); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function newPage(browser, storage = {}) {
  const ctx = await browser.createBrowserContext();   // aislado (storage + SW)
  const page = await ctx.newPage();
  await page.setViewport({ width: 402, height: 874, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument((s) => { for (const k in s) localStorage.setItem(k, s[k]); }, storage);
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.evaluate(() => { const el = document.getElementById('backend-url'); if (el) el.value = ''; });
  await sleep(700);
  return { ctx, page };
}

const visible = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return false;
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden') return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}, sel);


(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  // ---------------------------------------------------------- S1 · landing
  console.log('S1 · Landing pública');
  {
    const { ctx, page } = await newPage(browser, { andycolor_consent: CONSENT });
    ok(await visible(page, '#landing-view'), 'la landing es la vista inicial sin sesión');
    const h1 = await page.evaluate(() => document.querySelector('.lp-hero h1').textContent);
    ok(/cuadros para pintar/i.test(h1), 'el hero tiene el titular de marca');
    await page.click('#landing-cta');
    await sleep(400);
    ok(await visible(page, '#auth-view'), 'el CTA lleva a crear cuenta');
    const title = await page.evaluate(() => document.getElementById('auth-title').textContent);
    ok(title === 'Crear cuenta', 'la vista auth abre en modo registro');
    ok(!(await page.evaluate(() => !document.getElementById('auth-google-wrap').hidden)),
      'sin Supabase no aparece el botón de Google');
    await ctx.close();
  }

  // ----------------------------------------------- S2 · invitado + tutorial
  console.log('S2 · Invitado y tutorial de primera vez');
  {
    const { ctx, page } = await newPage(browser, { andycolor_consent: CONSENT });
    await page.click('#landing-guest');
    await sleep(500);
    ok(await visible(page, '#tutorial'), 'el tutorial aparece la primera vez');
    for (let i = 0; i < 4; i++) { await page.click('#tut-next'); await sleep(250); }
    ok(!(await visible(page, '#tutorial')), 'el tutorial se cierra al terminar los pasos');
    ok(await visible(page, '#gallery-view'), 'tras el tutorial se ve la galería');
    ok(await page.evaluate(() => localStorage.getItem('andycolor_tutorial_done') === '1'),
      'el flag de tutorial queda guardado (no se repetirá)');
    ok(await visible(page, '#gal-empty'), 'la galería vacía muestra su estado vacío');
    await ctx.close();
  }

  // -------------------------------------------- S3 · registro y cerrar sesión
  console.log('S3 · Registro, ajustes y cerrar sesión');
  {
    const { ctx, page } = await newPage(browser, { andycolor_consent: CONSENT, andycolor_tutorial_done: '1' });
    await page.click('#landing-cta');
    await sleep(300);
    await page.type('#auth-email', 'e2e@test.com');
    await page.type('#auth-pass', 'secreta1');
    await page.click('#auth-submit');
    await sleep(1500);
    ok(await visible(page, '#gallery-view'), 'tras registrarse entra a la galería');
    await page.evaluate(() => SvgGame.openAccount());
    await sleep(400);
    const who = await page.evaluate(() => document.querySelector('.acct-who b').textContent);
    ok(who === 'e2e@test.com', 'los ajustes muestran el email de la cuenta');
    await page.evaluate(() => SvgGame.accountAction('logout', () => document.querySelector('.paywall').remove()));
    await sleep(500);
    ok(await visible(page, '#landing-view'), 'cerrar sesión vuelve a la landing');
    await ctx.close();
  }

  // -------------------------------- S4 · generar (free): anuncio + juego listo
  console.log('S4 · Generar cuadro (free): anuncio durante la generación');
  let gamePage = null, gameCtx = null;
  {
    const { ctx, page } = await newPage(browser, {
      andycolor_consent: CONSENT, andycolor_guest: '1', andycolor_tutorial_done: '1',
    });
    await page.evaluate(() => SvgGame.showUpload());
    await sleep(300);
    const input = await page.$('#file');
    await input.uploadFile(PHOTO);
    await page.evaluate(() => { document.getElementById('generate').disabled = false; });
    await page.click('#generate');
    let adSeen = false;
    for (let i = 0; i < 12 && !adSeen; i++) { adSeen = !!(await page.$('.ad-overlay')); await sleep(250); }
    ok(adSeen, 'el anuncio se muestra mientras se genera (usuario free)');
    let ready = false;
    for (let i = 0; i < 90 && !ready; i++) {
      ready = await page.evaluate(() =>
        document.getElementById('game-view').style.display === 'flex' &&
        document.querySelectorAll('#paleta .color-btn').length > 0 &&
        !document.querySelector('.ad-overlay'));
      if (!ready) await sleep(500);
    }
    ok(ready, 'el juego carga con la paleta tras generar');
    ok(await page.evaluate(() => document.querySelector('#svg-canvas').children.length > 0), 'el lienzo SVG tiene contenido');
    ok((await page.evaluate(() => document.getElementById('hint-badge').textContent)) === '3', 'el contador de pistas empieza en 3');
    ok(await page.evaluate(() => document.getElementById('tool-finale').style.display === 'none'), 'el botón de timelapse está oculto antes de completar');
    gamePage = page; gameCtx = ctx;   // lo reusa S5
  }

  // ----------------------------- S5 · pista, pintar todo, final y persistencia
  console.log('S5 · Pista, pintar, final (timelapse) y persistencia');
  {
    const page = gamePage;
    await page.evaluate(() => SvgGame.hint());
    await sleep(400);
    ok((await page.evaluate(() => document.getElementById('hint-badge').textContent)) === '2', 'usar una pista descuenta el contador');
    // pinta todo; la ÚLTIMA región con feedback para que dispare la victoria
    await page.evaluate(() => {
      const ids = Object.keys(SvgGame.pathEls)
        .filter(id => !SvgGame.pathEls[id].classList.contains('painted'));
      ids.forEach((id, i) => {
        const el = SvgGame.pathEls[id], r = SvgGame.regionsById[id];
        if (r) SvgGame.paint(r, el, i === ids.length - 1 ? { feedback: true } : {});
      });
    });
    await sleep(2400);   // la pantalla final abre ~900ms después de completar
    ok(await visible(page, '#victory'), 'al completar aparece la pantalla final');
    const canvasOk = await page.evaluate(() => {
      const c = document.getElementById('finale-canvas');
      return c && c.width > 400;   // Finale.play redimensiona (por defecto sería 300)
    });
    ok(canvasOk, 'el timelapse se reproduce en el lienzo final');
    await page.click('#victory-close');
    await sleep(900);
    ok(await visible(page, '#gallery-view'), 'desde el final se vuelve a la galería');
    const cardInfo = await page.evaluate(() => {
      const cards = document.querySelectorAll('.gal-card');
      return { n: cards.length, done: !!document.querySelector('.gal-card .done') };
    });
    ok(cardInfo.n === 1, 'la creación queda guardada en la galería');
    ok(cardInfo.done, 'la tarjeta marca la creación como completada');
    // persistencia: recarga la misma origin (mismo contexto => mismo IndexedDB)
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(900);
    ok((await page.evaluate(() => document.querySelectorAll('.gal-card').length)) === 1,
      'tras recargar, la creación sigue ahí (IndexedDB)');
    await gameCtx.close();
  }

  // -------------------------------------------------- S6 · Plus: sin anuncios
  console.log('S6 · Plan Plus (demo): sin anuncio al generar');
  {
    const { ctx, page } = await newPage(browser, {
      andycolor_consent: CONSENT, andycolor_guest: '1', andycolor_tutorial_done: '1', andycolor_plan: 'plus',
    });
    ok(await page.evaluate(() => Membership.isMember()), 'el plan Plus (demo) queda activo');
    await page.evaluate(() => SvgGame.showUpload());
    await sleep(300);
    const input = await page.$('#file');
    await input.uploadFile(PHOTO);
    await page.evaluate(() => { document.getElementById('generate').disabled = false; });
    await page.click('#generate');
    let adSeen = false;
    for (let i = 0; i < 12 && !adSeen; i++) { adSeen = !!(await page.$('.ad-overlay')); await sleep(250); }
    ok(!adSeen, 'Plus no ve anuncios al generar');
    ok((await page.evaluate(() => document.getElementById('hint-badge') && Hints.unlimited())), 'Plus tiene pistas ilimitadas');
    await ctx.close();
  }

  // ------------------------------------------ S7 · paywall demo desde ajustes
  console.log('S7 · Paywall: compra demo desde ajustes');
  {
    const { ctx, page } = await newPage(browser, {
      andycolor_consent: CONSENT, andycolor_guest: '1', andycolor_tutorial_done: '1',
    });
    await page.evaluate(() => SvgGame.openAccount());
    await sleep(300);
    await page.evaluate(() => { document.querySelector('[data-act="plus"]').click(); });
    await sleep(400);
    ok(!!(await page.$('.plan-cta[data-buy="plus"]')), 'los ajustes abren el paywall de Plus');
    await page.click('.plan-cta[data-buy="plus"]');
    await sleep(400);
    ok(await page.evaluate(() => Membership.isMember()), 'la compra demo activa el plan Plus');
    ok(await page.evaluate(() => !document.getElementById('plan-chip').hidden), 'el chip del plan aparece para miembros');
    await ctx.close();
  }

  await browser.close();
  console.log(`\nResultado: ${passed} ✓ · ${failed} ✗`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERROR FATAL', e); process.exit(1); });
