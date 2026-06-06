// ==========================================
// 🎨 SVG-GAME.JS — Renderizador color-by-number vectorial (PoC)
// ==========================================
// Cada region es un <path> tappable: zoom infinito y numeros nitidos.
// Reusa los patrones de pan/zoom y de paleta del juego raster (js/game.js)
// pero NO usa flood-fill ni worker: la unidad es la region SVG.

const SvgGame = {
  ui: {},
  doc: null,
  state: {
    scale: 1, pX: 0, pY: 0,
    isDrag: false, hasMov: false,
    selectedColor: -1,
    paintedCount: 0, totalRegions: 0,
    lastTransformUpdate: 0, transformThrottle: 16,
  },
  // por indice de paleta: cuantas regiones quedan / total
  colorRemaining: [], colorTotal: [],
  // mapas de apoyo (se llenan en buildSvg)
  pathEls: {},        // region id -> <path>
  labelEls: {},       // region id -> <text>
  regionsById: {},    // region id -> objeto region
  regionsByColor: {}, // indice de color -> [region ids]
  targetEls: [],      // regiones actualmente resaltadas
  sig: '',            // firma del puzzle (para guardar/retomar progreso)
  input: { lX: 0, lY: 0, initDist: 0, lZoomT: 0 },

  // ---------- arranque ----------
  init() {
    this.ui = {
      uploadView: document.getElementById('upload-view'),
      gameView: document.getElementById('game-view'),
      drop: document.getElementById('drop'),
      file: document.getElementById('file'),
      thumb: document.getElementById('preview-thumb'),
      generate: document.getElementById('generate'),
      err: document.getElementById('err'),
      backendUrl: document.getElementById('backend-url'),
      loading: document.getElementById('loading-overlay'),
      loadingText: document.getElementById('loading-text'),
      viewport: document.getElementById('viewport'),
      shakeLayer: document.getElementById('shake-layer'),
      zoomLayer: document.getElementById('zoom-layer'),
      svg: document.getElementById('svg-canvas'),
      paleta: document.getElementById('paleta'),
      progressBar: document.getElementById('progress-bar'),
      progressPct: document.getElementById('progress-pct'),
      victory: document.getElementById('victory'),
    };
    this.bindUpload();
    this.bindCanvas();
  },

  // ---------- vista de subida ----------
  bindUpload() {
    const u = this.ui;
    u.drop.onclick = () => u.file.click();
    u.file.onchange = () => this.onFilePicked();

    ['dragover', 'dragenter'].forEach(ev =>
      u.drop.addEventListener(ev, e => { e.preventDefault(); u.drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev =>
      u.drop.addEventListener(ev, e => { e.preventDefault(); u.drop.classList.remove('over'); }));
    u.drop.addEventListener('drop', e => {
      if (e.dataTransfer.files.length) { u.file.files = e.dataTransfer.files; this.onFilePicked(); }
    });

    // sliders -> etiquetas
    const bind = (id, fn) => { const el = document.getElementById(id); el.oninput = fn; fn(); };
    bind('n_colors', () => document.getElementById('v-colors').textContent = document.getElementById('n_colors').value);
    bind('min_area', () => document.getElementById('v-area').textContent =
      (document.getElementById('min_area').value / 100).toFixed(2) + '%');
    bind('simplify', () => document.getElementById('v-tol').textContent =
      (document.getElementById('simplify').value / 10).toFixed(1));

    // presets de calidad: ajustan los sliders + la limpieza de fronteras de golpe.
    // clean = radio del filtro de mayoria (mas = fronteras mas limpias).
    this.presets = {
      suave:       { n_colors: 24, min_area: 22, simplify: 24, clean: 3 },
      equilibrado: { n_colors: 36, min_area: 13, simplify: 18, clean: 2 },
      detallado:   { n_colors: 56, min_area: 7,  simplify: 12, clean: 1 },
    };
    this.cleanRadius = this.presets.equilibrado.clean;
    document.querySelectorAll('.preset').forEach(b => {
      b.onclick = () => {
        document.querySelectorAll('.preset').forEach(x => x.classList.remove('selected'));
        b.classList.add('selected');
        this.applyPreset(b.dataset.preset);
      };
    });

    u.generate.onclick = () => this.generate();
  },

  applyPreset(name) {
    const p = this.presets[name];
    if (!p) return;
    const set = (id, val) => {
      const el = document.getElementById(id);
      el.value = val;
      el.dispatchEvent(new Event('input')); // refresca la etiqueta del slider
    };
    set('n_colors', p.n_colors);
    set('min_area', p.min_area);
    set('simplify', p.simplify);
    this.cleanRadius = p.clean;   // la limpieza no es slider, se manda aparte
  },

  onFilePicked() {
    const f = this.ui.file.files[0];
    if (!f) return;
    this.ui.thumb.src = URL.createObjectURL(f);
    this.ui.thumb.style.display = 'block';
    this.ui.generate.disabled = false;
    this.ui.err.textContent = '';
  },

  async generate() {
    const f = this.ui.file.files[0];
    if (!f) return;
    const base = this.ui.backendUrl.value.replace(/\/$/, '');

    const fd = new FormData();
    fd.append('file', f);
    fd.append('n_colors', document.getElementById('n_colors').value);
    fd.append('min_area_pct', (document.getElementById('min_area').value / 100).toString());
    fd.append('simplify_tol', (document.getElementById('simplify').value / 10).toString());
    fd.append('clean_radius', String(this.cleanRadius));

    this.ui.err.textContent = '';
    this.ui.loading.style.display = 'flex';
    try {
      const res = await fetch(base + '/generate', { method: 'POST', body: fd });
      if (!res.ok) {
        const t = await res.text();
        throw new Error('HTTP ' + res.status + ' · ' + t.slice(0, 160));
      }
      const doc = await res.json();
      this.loadDoc(doc);
    } catch (e) {
      this.ui.err.textContent = 'No se pudo generar: ' + e.message +
        ' — ¿está el backend en marcha y la URL es correcta?';
    } finally {
      this.ui.loading.style.display = 'none';
    }
  },

  // ---------- carga del documento y construccion del SVG ----------
  loadDoc(doc) {
    this.doc = doc;
    const n = doc.palette.length;
    this.colorRemaining = new Array(n).fill(0);
    this.colorTotal = new Array(n).fill(0);
    this.pathEls = {};
    this.labelEls = {};
    this.regionsById = {};
    this.regionsByColor = {};
    this.targetEls = [];
    this.state.paintedCount = 0;
    this.state.totalRegions = doc.regions.length;
    this.sig = this.signature(doc);

    this.buildSvg();
    this.generarPaletaUI();

    this.ui.uploadView.style.display = 'none';
    this.ui.gameView.style.display = 'flex';
    this.fitCamera(doc.width, doc.height);
    this.resumeProgress();      // retoma lo ya pintado de una sesion anterior
    this.selectFirstAvailable();
    this.updateProgress();
  },

  buildSvg() {
    const { width, height, regions, palette } = this.doc;
    const svg = this.ui.svg;
    const SVGNS = 'http://www.w3.org/2000/svg';
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.classList.remove('revealed');
    svg.innerHTML = '';

    const paths = document.createElementNS(SVGNS, 'g');
    const labels = document.createElementNS(SVGNS, 'g');

    regions.forEach(r => {
      const p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('d', r.d);
      p.setAttribute('fill-rule', 'evenodd');
      p.setAttribute('vector-effect', 'non-scaling-stroke'); // grosor constante al hacer zoom
      // grosor de linea variable segun el area (como Happy Color): areas grandes
      // -> borde mas grueso; areas diminutas -> borde fino.
      const sw = Math.max(0.7, Math.min(3.4, 0.6 + Math.sqrt(r.area || 0) / 38));
      p.setAttribute('stroke-width', sw.toFixed(2));
      p.setAttribute('class', 'region');
      p.dataset.id = r.id;
      p.dataset.color = r.color;
      p.addEventListener('click', () => this.onRegionClick(r, p));
      paths.appendChild(p);
      this.pathEls[r.id] = p;
      this.regionsById[r.id] = r;
      (this.regionsByColor[r.color] = this.regionsByColor[r.color] || []).push(r.id);
      this.colorTotal[r.color]++;
      this.colorRemaining[r.color]++;

      if (r.label) {
        const t = document.createElementNS(SVGNS, 'text');
        t.setAttribute('x', r.label.x);
        t.setAttribute('y', r.label.y);
        t.setAttribute('font-size', r.label.size);
        t.setAttribute('class', 'rlabel');
        t.textContent = (r.color + 1);
        labels.appendChild(t);
        this.labelEls[r.id] = t;
      }
    });

    svg.appendChild(paths);
    svg.appendChild(labels);
  },

  // ---------- pintado por region ----------
  onRegionClick(r, pathEl) {
    if (this.state.hasMov) return;            // fue arrastre/pinch, no pintar
    if (pathEl.classList.contains('painted')) return;
    if (r.color !== this.state.selectedColor) { this.shake(); return; }
    this.paint(r, pathEl, { feedback: true });
  },

  // Pinta una region (sin comprobar el color seleccionado). Reusado por click,
  // varita magica y al retomar progreso. opts.feedback => vibra + sonidos +
  // avanza de color + comprueba victoria.
  paint(r, pathEl, opts = {}) {
    if (pathEl.classList.contains('painted')) return;
    pathEl.style.fill = this.doc.palette[r.color].hex; // inline gana a la CSS
    pathEl.classList.remove('target');
    pathEl.classList.add('painted');
    const lbl = this.labelEls[r.id];
    if (lbl) lbl.classList.add('hidden');     // el numero desaparece al pintar
    this.state.paintedCount++;
    this.colorRemaining[r.color]--;
    this.updateColorBtn(r.color);
    this.updateProgress();

    if (opts.feedback) {
      this.vibrate(30);
      if (this.colorRemaining[r.color] === 0) this.onColorCompleted(r.color);
      if (this.state.paintedCount === this.state.totalRegions) this.triggerVictory();
    }
    this.saveProgress();
  },

  // ---------- resaltado de las regiones del color seleccionado ----------
  clearTargets() {
    this.targetEls.forEach(el => {
      el.classList.remove('target');
      if (!el.classList.contains('painted')) el.style.fill = ''; // vuelve a la CSS
    });
    this.targetEls = [];
  },

  highlightTargets(colorIdx) {
    this.clearTargets();
    const tintHex = this.tint(this.doc.palette[colorIdx].hex, 0.78);
    (this.regionsByColor[colorIdx] || []).forEach(id => {
      const el = this.pathEls[id];
      if (el && !el.classList.contains('painted')) {
        el.style.fill = tintHex;     // pista de color suave
        el.classList.add('target');  // pulso (CSS)
        this.targetEls.push(el);
      }
    });
  },

  // mezcla un color hacia el blanco (amt 0..1 = cuanto blanco)
  tint(hex, amt) {
    const { r, g, b } = this.hexToRgb(hex);
    const m = v => Math.round(v + (255 - v) * amt);
    return `rgb(${m(r)},${m(g)},${m(b)})`;
  },

  // ---------- varita magica: pinta todas las del color seleccionado ----------
  magicWand() {
    const i = this.state.selectedColor;
    if (i < 0) return;
    const ids = (this.regionsByColor[i] || []).filter(id => !this.pathEls[id].classList.contains('painted'));
    if (!ids.length) return;
    ids.forEach(id => this.paint(this.regionsById[id], this.pathEls[id], { feedback: false }));
    this.vibrate([40, 40, 40]);
    if (this.state.paintedCount === this.state.totalRegions) this.triggerVictory();
    else this.onColorCompleted(i);
  },

  // ---------- pista: lleva la camara a una region pendiente y la hace parpadear ----------
  hint() {
    const i = this.state.selectedColor;
    if (i < 0) return;
    const id = (this.regionsByColor[i] || []).find(id => !this.pathEls[id].classList.contains('painted'));
    if (id === undefined) return;
    const el = this.pathEls[id];
    this.centerOn(el);
    el.classList.add('hintpulse');
    setTimeout(() => el.classList.remove('hintpulse'), 2400);
  },

  centerOn(el) {
    const bb = el.getBBox();
    const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
    const vW = this.ui.viewport.clientWidth, vH = this.ui.viewport.clientHeight;
    const target = Math.min(8, Math.max(this.state.scale, 3));
    this.state.scale = target;
    this.state.pX = vW / 2 - cx * target;
    this.state.pY = vH / 2 - cy * target;
    this.ui.zoomLayer.style.transition = 'transform .4s ease';
    this.updateTransform();
    setTimeout(() => { this.ui.zoomLayer.style.transition = 'none'; }, 420);
  },

  shake() {
    const sl = this.ui.shakeLayer;
    sl.classList.add('shake');
    this.vibrate(120);
    setTimeout(() => sl.classList.remove('shake'), 300);
  },

  vibrate(ms) { if (navigator.vibrate) navigator.vibrate(ms); },

  // ---------- paleta (reusa patron de game.js) ----------
  generarPaletaUI() {
    const pal = this.ui.paleta;
    pal.innerHTML = '';
    this.doc.palette.forEach((c, i) => {
      const { r, g, b } = this.hexToRgb(c.hex);
      const btn = document.createElement('div');
      btn.className = 'color-btn';
      btn.id = 'cbtn-' + i;
      btn.style.setProperty('--btn-color', c.hex);
      const isLight = (r * 0.299 + g * 0.587 + b * 0.114) > 186;
      btn.innerHTML = `<span class="color-number" style="color:${isLight ? '#333' : '#fff'}">${i + 1}</span>`;
      btn.onclick = () => { if (this.colorRemaining[i] > 0) this.selectColor(i); };
      pal.appendChild(btn);
      this.updateColorBtn(i);
    });
  },

  updateColorBtn(i) {
    const btn = document.getElementById('cbtn-' + i);
    if (!btn) return;
    const total = this.colorTotal[i] || 1;
    const rem = this.colorRemaining[i];
    if (rem <= 0) {
      btn.classList.add('completed');
      btn.classList.remove('selected');
      btn.style.setProperty('--progress', '100%');
    } else {
      btn.style.setProperty('--progress', `${((total - rem) / total) * 100}%`);
    }
  },

  selectColor(i) {
    this.state.selectedColor = i;
    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('selected'));
    const btn = document.getElementById('cbtn-' + i);
    if (btn) { btn.classList.add('selected'); btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); }
    this.highlightTargets(i);   // resalta donde hay que pintar
  },

  // ---------- guardar / retomar progreso (localStorage) ----------
  signature(doc) {
    // firma barata pero suficiente para no confundir dos puzzles distintos
    let h = doc.regions.length * 2654435761;
    h ^= doc.width * 40503 + doc.height;
    doc.palette.forEach(p => { for (const c of p.hex) h = (h * 31 + c.charCodeAt(0)) | 0; });
    return 'svgpaint:' + (h >>> 0).toString(36) + ':' + doc.regions.length;
  },

  saveProgress() {
    if (!this.sig) return;
    const ids = [];
    for (const id in this.pathEls) {
      if (this.pathEls[id].classList.contains('painted')) ids.push(+id);
    }
    try { localStorage.setItem(this.sig, JSON.stringify(ids)); } catch (e) { /* cuota llena */ }
  },

  resumeProgress() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(this.sig) || '[]'); } catch (e) { saved = []; }
    saved.forEach(id => {
      const el = this.pathEls[id], r = this.regionsById[id];
      if (el && r) this.paint(r, el, { feedback: false });
    });
  },

  // ---------- botones de zoom ----------
  zoomBy(factor) {
    const vW = this.ui.viewport.clientWidth, vH = this.ui.viewport.clientHeight;
    const mx = vW / 2, my = vH / 2;
    const ns = Math.min(Math.max(0.1, this.state.scale * factor), 40);
    this.state.pX = mx - (mx - this.state.pX) * (ns / this.state.scale);
    this.state.pY = my - (my - this.state.pY) * (ns / this.state.scale);
    this.state.scale = ns;
    this.updateTransform();
  },

  fit() { if (this.doc) this.fitCamera(this.doc.width, this.doc.height); },

  selectFirstAvailable() {
    for (let i = 0; i < this.colorRemaining.length; i++) {
      if (this.colorRemaining[i] > 0) { this.selectColor(i); return; }
    }
  },

  onColorCompleted(index) {
    this.vibrate([40, 40, 40]);
    // avanzar al siguiente color con regiones pendientes (envuelve)
    const n = this.colorRemaining.length;
    for (let k = 1; k <= n; k++) {
      const i = (index + k) % n;
      if (this.colorRemaining[i] > 0) { setTimeout(() => this.selectColor(i), 250); return; }
    }
  },

  updateProgress() {
    const pct = this.state.totalRegions
      ? Math.round((this.state.paintedCount / this.state.totalRegions) * 100) : 0;
    this.ui.progressBar.style.width = pct + '%';
    this.ui.progressPct.textContent = pct + '%';
  },

  triggerVictory() {
    this.ui.svg.classList.add('revealed'); // funde lineas y numeros
    if (typeof confetti === 'function') {
      confetti({ particleCount: 120, spread: 80, origin: { y: .6 }, colors: ['#d63384', '#667eea', '#764ba2', '#f093fb', '#4facfe'] });
    }
    setTimeout(() => { this.ui.victory.style.display = 'flex'; }, 900);
  },

  // ---------- camara: pan / zoom (portado de game.js) ----------
  hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  },

  getDist(t1, t2) { return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY); },

  fitCamera(w, h) {
    const vW = this.ui.viewport.clientWidth, vH = this.ui.viewport.clientHeight;
    const sW = (vW - 40) / w, sH = (vH - 40) / h;
    this.state.scale = Math.min(sW, sH) || 0.5;
    this.state.pX = (vW - w * this.state.scale) / 2;
    this.state.pY = (vH - h * this.state.scale) / 2;
    this.updateTransform();
  },

  updateTransform() {
    this.ui.zoomLayer.style.transform =
      `translate(${this.state.pX}px, ${this.state.pY}px) scale(${this.state.scale})`;
  },

  updateTransformThrottled() {
    const now = Date.now();
    if (now - this.state.lastTransformUpdate < this.state.transformThrottle) return;
    this.state.lastTransformUpdate = now;
    this.updateTransform();
  },

  bindCanvas() {
    const vp = this.ui.viewport;
    // raton
    vp.addEventListener('mousedown', e => { this.state.isDrag = true; this.state.hasMov = false; this.input.lX = e.clientX; this.input.lY = e.clientY; });
    window.addEventListener('mousemove', e => {
      if (!this.state.isDrag) return;
      const dx = e.clientX - this.input.lX, dy = e.clientY - this.input.lY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this.state.hasMov = true;
      this.state.pX += dx; this.state.pY += dy;
      this.input.lX = e.clientX; this.input.lY = e.clientY;
      this.updateTransformThrottled();
    });
    window.addEventListener('mouseup', () => { this.state.isDrag = false; });
    vp.addEventListener('wheel', e => this.handleWheel(e), { passive: false });

    // tactil
    vp.addEventListener('touchstart', e => this.handleTouchStart(e), { passive: false });
    vp.addEventListener('touchmove', e => this.handleTouchMove(e), { passive: false });
    vp.addEventListener('touchend', e => this.handleTouchEnd(e));

    // botones
    document.getElementById('back-btn').onclick = () => this.backToUpload();
    document.getElementById('victory-close').onclick = () => { this.ui.victory.style.display = 'none'; this.backToUpload(); };
    // herramientas (zoom / pista / varita)
    const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    bind('tool-zoom-in', () => this.zoomBy(1.4));
    bind('tool-zoom-out', () => this.zoomBy(0.72));
    bind('tool-fit', () => this.fit());
    bind('tool-hint', () => this.hint());
    bind('tool-wand', () => this.magicWand());
  },

  handleWheel(e) {
    e.preventDefault();
    const rect = this.ui.viewport.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const ns = Math.min(Math.max(0.1, this.state.scale * (e.deltaY > 0 ? 0.9 : 1.1)), 40);
    this.state.pX = mx - (mx - this.state.pX) * (ns / this.state.scale);
    this.state.pY = my - (my - this.state.pY) * (ns / this.state.scale);
    this.state.scale = ns;
    this.updateTransform();
  },

  handleTouchStart(e) {
    if (e.touches.length === 1) {
      this.state.isDrag = true; this.state.hasMov = false;
      this.input.lX = e.touches[0].clientX; this.input.lY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      this.state.isDrag = false;
      this.input.initDist = this.getDist(e.touches[0], e.touches[1]);
      this.input.lZoomT = Date.now();
    }
  },

  handleTouchMove(e) {
    e.preventDefault();
    const rect = this.ui.viewport.getBoundingClientRect();
    if (e.touches.length === 1 && this.state.isDrag) {
      const dx = e.touches[0].clientX - this.input.lX, dy = e.touches[0].clientY - this.input.lY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this.state.hasMov = true;
      this.state.pX += dx; this.state.pY += dy;
      this.input.lX = e.touches[0].clientX; this.input.lY = e.touches[0].clientY;
      this.updateTransformThrottled();
    } else if (e.touches.length === 2) {
      this.input.lZoomT = Date.now();
      this.state.hasMov = true;
      const dist = this.getDist(e.touches[0], e.touches[1]);
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
      const ns = Math.min(Math.max(0.1, this.state.scale * (dist / this.input.initDist)), 40);
      this.state.pX = midX - (midX - this.state.pX) * (ns / this.state.scale);
      this.state.pY = midY - (midY - this.state.pY) * (ns / this.state.scale);
      this.state.scale = ns; this.input.initDist = dist;
      this.updateTransform();
    }
  },

  handleTouchEnd() {
    this.state.isDrag = false;
    // tras un pinch reciente, no tratar el toque como tap-pintar
    if (Date.now() - this.input.lZoomT < 400) this.state.hasMov = true;
    // hasMov se resetea en el proximo touchstart/mousedown (evita carrera con el click)
  },

  backToUpload() {
    this.ui.gameView.style.display = 'none';
    this.ui.uploadView.style.display = 'flex';
  },
};

document.addEventListener('DOMContentLoaded', () => SvgGame.init());
