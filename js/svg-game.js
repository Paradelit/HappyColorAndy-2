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
      aiToggle: document.getElementById('ai-toggle'),
      stylize: document.getElementById('stylize'),
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

    u.generate.onclick = () => this.generate();

    // muestra el modo IA solo si el backend tiene la clave configurada
    this.checkCapabilities();
    u.backendUrl.addEventListener('change', () => this.checkCapabilities());
  },

  async checkCapabilities() {
    const base = this.ui.backendUrl.value.replace(/\/$/, '');
    try {
      const res = await fetch(base + '/capabilities');
      const cap = await res.json();
      this.ui.aiToggle.hidden = !cap.stylize;
    } catch (e) {
      this.ui.aiToggle.hidden = true;  // backend no disponible aun
    }
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

    // sin parametros: el backend auto-ajusta para maxima fidelidad
    const useAi = this.ui.stylize && this.ui.stylize.checked && !this.ui.aiToggle.hidden;
    const fd = new FormData();
    fd.append('file', f);
    if (useAi) fd.append('stylize', 'true');

    this.ui.err.textContent = '';
    this.ui.loadingText.textContent = useAi ? 'Creando ilustración con IA…' : 'Generando tu obra…';
    this.ui.loading.style.display = 'flex';
    try {
      const res = await fetch(base + '/generate', { method: 'POST', body: fd });
      if (!res.ok) {
        let detail;
        try { detail = (await res.json()).detail; } catch (_) { detail = await res.text(); }
        throw new Error('HTTP ' + res.status + ' · ' + (detail || '').slice(0, 600));
      }
      const doc = await res.json();
      this.loadDoc(doc);
    } catch (e) {
      // error de red (no respondio el server) vs error devuelto por el server
      const isNetwork = (e instanceof TypeError);
      this.ui.err.textContent = isNetwork
        ? 'No se pudo conectar con el backend. ¿Está uvicorn en marcha y la URL es correcta?'
        : 'No se pudo generar: ' + e.message;
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
    this.regionsByCluster = {};   // cluster id -> [region ids] (un clic pinta todo)
    this.clusterColor = {};       // cluster id -> numero
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
    // quita (sin animacion) los numeros ya completados al retomar
    this.colorRemaining.forEach((rem, i) => {
      if (this.colorTotal[i] > 0 && rem <= 0) {
        const b = document.getElementById('cbtn-' + i);
        if (b) b.remove();
      }
    });
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

    // patron de cuadricula gris para resaltar las zonas a pintar (Happy Color)
    const defs = document.createElementNS(SVGNS, 'defs');
    defs.innerHTML =
      '<pattern id="checker" width="16" height="16" patternUnits="userSpaceOnUse">' +
      '<rect width="16" height="16" fill="#ececf2"/>' +
      '<rect width="8" height="8" fill="#ccd0db"/>' +
      '<rect x="8" y="8" width="8" height="8" fill="#ccd0db"/></pattern>';
    svg.appendChild(defs);

    const paths = document.createElementNS(SVGNS, 'g');
    const labels = document.createElementNS(SVGNS, 'g');

    regions.forEach(r => {
      const p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('d', r.d);
      p.setAttribute('fill-rule', 'evenodd');
      p.setAttribute('vector-effect', 'non-scaling-stroke'); // grosor constante al hacer zoom
      // grosor de linea segun la PROFUNDIDAD (fuerza de borde en el original):
      // primer plano (bordes fuertes) -> linea gruesa; fondo (suave) -> fina.
      const sw = Math.max(0.5, Math.min(3.6, 0.5 + (r.edge || 0) * 3.1));
      p.setAttribute('stroke-width', sw.toFixed(2));
      p.setAttribute('class', 'region');
      p.dataset.id = r.id;
      p.dataset.color = r.color;
      p.addEventListener('click', (e) => this.onRegionClick(r, p, e));
      paths.appendChild(p);
      this.pathEls[r.id] = p;
      this.regionsById[r.id] = r;
      (this.regionsByColor[r.color] = this.regionsByColor[r.color] || []).push(r.id);
      const cl = (r.cluster === undefined ? r.id : r.cluster);
      (this.regionsByCluster[cl] = this.regionsByCluster[cl] || []).push(r.id);
      this.clusterColor[cl] = r.color;
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

    // Capa de DIBUJO (overlay de lineas): se ve siempre, encima del color y debajo
    // de los numeros. Hace que se distinga todo el detalle antes y despues de pintar.
    if (this.doc.lineOverlay) {
      svg.classList.add('has-overlay');
      const img = document.createElementNS(SVGNS, 'image');
      img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', this.doc.lineOverlay);
      img.setAttribute('href', this.doc.lineOverlay);
      img.setAttribute('x', 0); img.setAttribute('y', 0);
      img.setAttribute('width', width); img.setAttribute('height', height);
      img.setAttribute('pointer-events', 'none');
      img.style.imageRendering = 'auto';
      svg.appendChild(img);
    } else {
      svg.classList.remove('has-overlay');
    }

    svg.appendChild(labels);
  },

  // ---------- pintado por region ----------
  onRegionClick(r, pathEl, e) {
    if (this.state.hasMov) return;            // fue arrastre/pinch, no pintar
    if (pathEl.classList.contains('painted')) return;
    if (r.color !== this.state.selectedColor) { this.shake(); return; }
    const pt = e ? this.eventToSvg(e) : null;  // punto de origen de la animacion
    // un solo clic pinta TODO el cluster contiguo (cada region con su tono)
    const cl = (r.cluster === undefined ? r.id : r.cluster);
    this.paintCluster(cl, pt, true);
  },

  // Pinta todas las regiones (sin pintar) de un cluster en una sola accion.
  paintCluster(cluster, point, withFeedback) {
    const ids = (this.regionsByCluster[cluster] || [])
      .filter(id => !this.pathEls[id].classList.contains('painted'));
    if (!ids.length) return;
    ids.forEach(id => this.paint(this.regionsById[id], this.pathEls[id],
      { feedback: false, animate: !!point, point }));
    if (withFeedback) {
      this.vibrate(30);
      const color = this.clusterColor[cluster];
      if (this.colorRemaining[color] === 0) this.onColorCompleted(color);
      if (this.state.paintedCount === this.state.totalRegions) this.triggerVictory();
    }
    this.saveProgress();
  },

  // Pinta una region con su color FIEL (no el color del numero). Reusado por
  // click, varita magica y al retomar. opts.animate => efecto de expansion.
  paint(r, pathEl, opts = {}) {
    if (pathEl.classList.contains('painted')) return;
    const hex = r.fill || this.doc.palette[r.color].hex; // color real de la region
    pathEl.classList.remove('target');
    pathEl.classList.add('painted');
    const lbl = this.labelEls[r.id];
    if (lbl) lbl.classList.add('hidden');     // el numero desaparece al pintar

    if (opts.animate && opts.point) {
      this.animateFill(r, pathEl, hex, opts.point);  // expansion desde el clic
    } else {
      pathEl.style.fill = hex;                        // instantaneo (wand/retomar)
    }

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

  // Efecto de "pintado": un circulo del color crece desde el punto pulsado,
  // recortado a la forma de la region, hasta cubrirla.
  animateFill(r, pathEl, hex, pt) {
    const NS = 'http://www.w3.org/2000/svg';
    const cid = 'clip-' + r.id;
    const clip = document.createElementNS(NS, 'clipPath');
    clip.id = cid;
    clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
    const cpath = document.createElementNS(NS, 'path');
    cpath.setAttribute('d', r.d);
    cpath.setAttribute('fill-rule', 'evenodd');
    clip.appendChild(cpath);

    const circ = document.createElementNS(NS, 'circle');
    circ.setAttribute('cx', pt.x);
    circ.setAttribute('cy', pt.y);
    circ.setAttribute('r', 0);
    circ.setAttribute('fill', hex);
    circ.setAttribute('clip-path', `url(#${cid})`);
    circ.setAttribute('pointer-events', 'none');

    this.ui.svg.appendChild(clip);
    this.ui.svg.appendChild(circ);

    // radio final = distancia del punto a la esquina mas lejana del bounding box
    const bb = pathEl.getBBox();
    const maxR = Math.hypot(
      Math.max(pt.x - bb.x, bb.x + bb.width - pt.x),
      Math.max(pt.y - bb.y, bb.y + bb.height - pt.y)
    ) + 2;

    const dur = 300, t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      circ.setAttribute('r', maxR * (1 - (1 - k) * (1 - k))); // ease-out
      if (k < 1) {
        requestAnimationFrame(step);
      } else {
        pathEl.style.fill = hex;   // fija el color y retira lo temporal
        circ.remove(); clip.remove();
      }
    };
    requestAnimationFrame(step);
  },

  // convierte coords de pantalla (evento) a coords del SVG (espacio-imagen),
  // deshaciendo nuestra propia transformacion (pX, pY, scale).
  eventToSvg(e) {
    const cx = (e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX);
    const cy = (e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY);
    const rect = this.ui.viewport.getBoundingClientRect();
    return {
      x: (cx - rect.left - this.state.pX) / this.state.scale,
      y: (cy - rect.top - this.state.pY) / this.state.scale,
    };
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
    (this.regionsByColor[colorIdx] || []).forEach(id => {
      const el = this.pathEls[id];
      if (el && !el.classList.contains('painted')) {
        el.style.fill = 'url(#checker)';  // cuadricula gris = "pinta aqui"
        el.classList.add('target');
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
      // multitono -> fondo en degradado de sus tonos (marca especial); plano -> solido
      if (c.multitone && c.swatches && c.swatches.length > 1) {
        btn.style.setProperty('--btn-color', `linear-gradient(135deg, ${c.swatches.join(', ')})`);
        btn.classList.add('multitone');
      } else {
        btn.style.setProperty('--btn-color', c.hex);
      }
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

  // ---------- LOD: mostrar/ocultar numeros y bordes segun el zoom ----------
  // Cada region/numero tiene un tamano aparente en pantalla = tamano * escala.
  // Si es demasiado pequeno para leerse/verse, se oculta; reaparece al acercar.
  scheduleLOD() {
    clearTimeout(this._lodTimer);
    this._lodTimer = setTimeout(() => this.applyLOD(), 90);
  },

  applyLOD() {
    if (!this.doc) return;
    const s = this.state.scale;
    const MIN_LABEL_PX = 7;    // un numero mas pequeno que esto no se lee
    const MIN_REGION_PX = 2.5; // un borde de region mas fino que esto estorba
    for (const id in this.regionsById) {
      const r = this.regionsById[id];
      const el = this.pathEls[id];
      if (el) el.classList.toggle('lod', Math.sqrt(r.area || 0) * s < MIN_REGION_PX);
      const lbl = this.labelEls[id];
      if (lbl && !lbl.classList.contains('hidden')) {
        lbl.classList.toggle('lod', !(r.label && r.label.size * s >= MIN_LABEL_PX));
      }
    }
  },

  selectFirstAvailable() {
    for (let i = 0; i < this.colorRemaining.length; i++) {
      if (this.colorRemaining[i] > 0) { this.selectColor(i); return; }
    }
  },

  onColorCompleted(index) {
    this.vibrate([40, 40, 40]);
    this.vanishColorBtn(index);  // el numero desaparece de la paleta (vanish)
    // avanzar al siguiente color con regiones pendientes (envuelve)
    const n = this.colorRemaining.length;
    for (let k = 1; k <= n; k++) {
      const i = (index + k) % n;
      if (this.colorRemaining[i] > 0) { setTimeout(() => this.selectColor(i), 300); return; }
    }
  },

  // anima la salida del numero completado y lo quita de la paleta
  vanishColorBtn(index) {
    const btn = document.getElementById('cbtn-' + index);
    if (!btn || btn.classList.contains('vanish')) return;
    btn.classList.add('vanish');
    btn.addEventListener('animationend', () => btn.remove(), { once: true });
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
    this.scheduleLOD();   // recalcula visibilidad de numeros/bordes (debounced)
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
