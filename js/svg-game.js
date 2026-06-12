// ==========================================
// 🎨 SVG-GAME.JS — Renderizador color-by-number vectorial (PoC)
// ==========================================
// Cada region es un <path> tappable: zoom infinito y numeros nitidos.
// Reusa los patrones de pan/zoom y de paleta del juego raster (js/game.js)
// pero NO usa flood-fill ni worker: la unidad es la region SVG.

// Iconos de línea (estilo Feather, stroke=currentColor) para los ajustes y
// modales: aspecto profesional y consistente, sin emojis.
const CM_ICONS = {
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15 8m-3.4 3.6L19 4m-4 0l3 3"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
  device: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M12 18h.01"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
};

// Escapa texto para insertarlo con seguridad en innerHTML (evita XSS).
function cmEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

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
      modeToggle: document.getElementById('mode-toggle'),
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
      galleryView: document.getElementById('gallery-view'),
      galGrid: document.getElementById('gal-grid'),
      galEmpty: document.getElementById('gal-empty'),
      btnNew: document.getElementById('btn-new'),
      uploadBack: document.getElementById('upload-back'),
      landingView: document.getElementById('landing-view'),
      authView: document.getElementById('auth-view'),
      tutorial: document.getElementById('tutorial'),
      toolFinale: document.getElementById('tool-finale'),
      hintBadge: document.getElementById('hint-badge'),
    };
    this.applyDefaultBackend();
    this.bindUpload();
    this.bindCanvas();
    this.bindGallery();
    this.bindFinale();
    this.bindLanding();
    this.bindAuth();
    this.bindTutorial();
    this.bindA11y();
    this.route();
  },

  // Accesibilidad de los modales (overlay .paywall / .ad-overlay): rol de
  // diálogo, foco al abrir, devolver el foco al cerrar y Escape para cerrar.
  bindA11y() {
    const isOverlay = (n) => n && n.nodeType === 1 && n.classList &&
      (n.classList.contains('paywall') || n.classList.contains('ad-overlay'));

    new MutationObserver((muts) => {
      muts.forEach((m) => {
        m.addedNodes.forEach((n) => {
          if (!isOverlay(n)) return;
          const card = n.querySelector('.paywall-card, .ad-box') || n;
          card.setAttribute('role', 'dialog');
          card.setAttribute('aria-modal', 'true');
          const h = card.querySelector('h2');
          if (h) { if (!h.id) h.id = 'cmmt-' + Math.random().toString(36).slice(2, 7); card.setAttribute('aria-labelledby', h.id); }
          this._lastFocus = document.activeElement;
          const f = n.querySelector('input, button:not([disabled]), [tabindex]');
          if (f) setTimeout(() => { try { f.focus(); } catch (e) { /* noop */ } }, 30);
        });
        m.removedNodes.forEach((n) => {
          if (isOverlay(n) && this._lastFocus && this._lastFocus.focus) {
            try { this._lastFocus.focus(); } catch (e) { /* noop */ }
          }
        });
      });
    }).observe(document.body, { childList: true });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const ovs = document.querySelectorAll('.paywall');
      const top = ovs[ovs.length - 1];
      if (!top) return;
      const x = top.querySelector('.paywall-x');
      if (x) x.click(); else top.remove();
    });
  },

  // Decide la primera vista: sesión -> app; invitado -> app; nadie -> landing.
  async route() {
    // enlace de recuperación de contraseña (Supabase) -> pedir la nueva
    if (Auth.usesSupabase()) {
      try {
        Auth.client().auth.onAuthStateChange((event) => {
          if (event === 'PASSWORD_RECOVERY') this.openNewPasswordModal();
        });
      } catch (e) { /* noop */ }
    }
    // pinta la galería ya si parece haber sesión (la validación va detrás)
    if (Auth.token() || Auth.isGuest()) this.showGallery();
    const user = await Auth.restore();
    if (user || Auth.isGuest()) {
      this.enterApp();
      if (user) Auth.syncAll().then(() => this.renderGallery());  // progreso de la cuenta
    } else {
      this.showLanding();
    }
  },

  // Entra a la app (galería) y muestra el tutorial solo la primera vez.
  enterApp() {
    this.showGallery();
    if (!this.tutorialSeen()) this.showTutorial();
  },

  // URL del backend: por defecto el mismo servidor que sirve la web (relativa).
  // En desarrollo local con un servidor estatico aparte (Live Server :5500,
  // file://...), apunta a uvicorn en :8000.
  applyDefaultBackend() {
    if (this.ui.backendUrl.value.trim()) return;     // respeta override del usuario
    const loc = location;
    const devStatic = loc.protocol === 'file:' ||
      (/^(localhost|127\.0\.0\.1)$/.test(loc.hostname) && loc.port && loc.port !== '8000');
    if (devStatic) this.ui.backendUrl.value = 'http://localhost:8000';
  },

  // ---------- navegacion entre vistas ----------
  bindGallery() {
    this.ui.btnNew.onclick = () => this.showUpload();
    this.ui.uploadBack.onclick = () => this.showGallery();
    this.ui.planChip = document.getElementById('plan-chip');
    this.ui.planChip.onclick = () => Membership.openPaywall('manual');
    this.ui.accountBtn = document.getElementById('btn-account');
    this.ui.accountBtn.onclick = () => this.openAccount();
    this.updatePlanChip();
    document.addEventListener('plan-changed', () => {
      this.updatePlanChip();
      this.updateHintBadge();
    });
    document.addEventListener('hints-changed', () => this.updateHintBadge());
  },

  updateAccountBtn() { /* el botón es un icono ⚙️ fijo */ },

  // Ajustes: perfil + secciones (cuenta, privacidad, sesión) con iconos de línea.
  openAccount() {
    const logged = Auth.isLogged();
    const email = logged ? Auth.user.email : null;
    const member = Membership.isMember();
    const row = (act, icon, label, cls = '') =>
      `<button class="acct-row ${cls}" data-act="${act}">${CM_ICONS[icon]}<span>${label}</span>${CM_ICONS.chev}</button>`;

    const accountRows =
      (logged ? '' : row('login', 'key', 'Entrar o crear cuenta')) +
      (member ? '' : row('plus', 'star', 'Hazte Plus — sin anuncios')) +
      (window.__deferredPrompt ? row('install', 'device', 'Instalar la aplicación') : '');

    const wrap = document.createElement('div');
    wrap.className = 'paywall';
    wrap.innerHTML =
      `<div class="paywall-card acct-sheet">
        <button class="paywall-x" aria-label="Cerrar">✕</button>
        <h2>Ajustes</h2>
        <div class="acct-head">
          <div class="acct-avatar">${logged ? cmEsc(email[0].toUpperCase()) : CM_ICONS.user}</div>
          <div class="acct-who">
            <b>${logged ? cmEsc(email) : 'Invitado'}</b>
            <small>${logged ? 'Plan ' + cmEsc(Membership.plan().name) : 'Solo en este dispositivo · Plan ' + cmEsc(Membership.plan().name)}</small>
          </div>
        </div>
        ${accountRows ? '<div class="acct-sec">Cuenta</div>' + accountRows : ''}
        <div class="acct-sec">Privacidad</div>
        ${row('cookies', 'shield', 'Privacidad y cookies')}
        ${row('privacy', 'doc', 'Política de privacidad')}
        ${row('terms', 'doc', 'Términos y condiciones')}
        ${logged ? row('export', 'download', 'Descargar mis datos') : ''}
        ${logged ? '<div class="acct-sec">Sesión</div>' + row('logout', 'logout', 'Cerrar sesión') + row('delete', 'trash', 'Borrar mi cuenta', 'danger') : ''}
      </div>`;
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.querySelector('.paywall-x').onclick = close;
    wrap.onclick = (e) => { if (e.target === wrap) close(); };
    wrap.querySelectorAll('[data-act]').forEach(b => {
      b.onclick = () => this.accountAction(b.getAttribute('data-act'), close);
    });
  },

  async accountAction(act, close) {
    if (act === 'login') { close(); this.showAuth('login'); }
    else if (act === 'plus') { close(); Membership.openPaywall('ads'); }
    else if (act === 'install') {
      close();
      const dp = window.__deferredPrompt;
      if (dp) { dp.prompt(); await dp.userChoice; window.__deferredPrompt = null; }
    }
    else if (act === 'cookies') { close(); Consent.openPreferences(); }
    else if (act === 'privacy') { window.open('/privacy', '_blank'); }
    else if (act === 'terms') { window.open('/terms', '_blank'); }
    else if (act === 'logout') { close(); Auth.logout(); this.showLanding(); }
    else if (act === 'export') {
      try {
        const data = await Auth.exportData();
        downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'mis-datos-color-memories.json');
      } catch (e) { toast('No se pudieron descargar los datos'); }
    }
    else if (act === 'delete') {
      if (!confirm('¿Seguro que quieres BORRAR tu cuenta y todos tus datos? Esta acción no se puede deshacer.')) return;
      try {
        await Auth.deleteAccount();
        close();
        toast('Cuenta borrada');
        this.showLanding();
      } catch (e) { toast('No se pudo borrar la cuenta'); }
    }
  },

  updatePlanChip() {
    const member = Membership.isMember();
    this.ui.planChip.hidden = !member;            // solo se muestra a los miembros
    this.ui.planChip.textContent = '✨ ' + Membership.plan().name;
    this.ui.planChip.classList.toggle('member', member);
  },

  hideAllViews() {
    this.ui.landingView.style.display = 'none';
    this.ui.authView.style.display = 'none';
    this.ui.galleryView.style.display = 'none';
    this.ui.uploadView.style.display = 'none';
    this.ui.gameView.style.display = 'none';
  },

  showLanding() {
    this.hideAllViews();
    this.ui.landingView.style.display = 'flex';
  },

  showUpload() {
    this.hideAllViews();
    this.ui.uploadView.style.display = 'flex';
  },

  // ---------- landing + login ----------
  bindLanding() {
    document.getElementById('landing-login').onclick = () => this.showAuth('login');
    document.getElementById('landing-cta').onclick = () => this.showAuth('register');
    document.getElementById('landing-cta2').onclick = () => this.showAuth('register');
    document.getElementById('landing-guest').onclick = () => {
      Auth.setGuest(true);
      this.enterApp();
    };
    document.getElementById('land-cookies').onclick = () => Consent.openPreferences();
  },

  showAuth(mode) {
    this.authMode = mode === 'login' ? 'login' : 'register';
    const login = this.authMode === 'login';
    document.getElementById('auth-title').textContent = login ? 'Entrar' : 'Crear cuenta';
    document.getElementById('auth-submit').textContent = login ? 'Entrar' : 'Crear cuenta';
    document.getElementById('auth-switch').innerHTML = login
      ? '¿No tienes cuenta? <button type="button" class="linkbtn" id="auth-toggle">Crear cuenta</button>'
      : '¿Ya tienes cuenta? <button type="button" class="linkbtn" id="auth-toggle">Entrar</button>';
    document.getElementById('auth-toggle').onclick = () =>
      this.showAuth(login ? 'register' : 'login');
    document.getElementById('auth-err').textContent = '';
    // "Continuar con Google" y recuperación solo si Supabase está configurado
    const gw = document.getElementById('auth-google-wrap');
    if (gw) gw.hidden = !Auth.usesSupabase();
    const fg = document.getElementById('auth-forgot');
    if (fg) fg.hidden = !(login && Auth.usesSupabase());
    this.hideAllViews();
    this.ui.authView.style.display = 'flex';
  },

  bindAuth() {
    document.getElementById('auth-back').onclick = () => this.showLanding();
    document.getElementById('auth-submit').onclick = () => this.submitAuth();
    document.getElementById('auth-pass').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.submitAuth();
    });
    const g = document.getElementById('auth-google');
    if (g) g.onclick = async () => {
      try { await Auth.loginWithGoogle(); }
      catch (e) { document.getElementById('auth-err').textContent = 'No se pudo iniciar con Google.'; }
    };
    const fl = document.getElementById('auth-forgot-link');
    if (fl) fl.onclick = () => this.openForgotModal();
  },

  // ---------- recuperación de contraseña ----------
  openForgotModal() {
    const prefill = document.getElementById('auth-email').value.trim();
    const wrap = document.createElement('div');
    wrap.className = 'paywall';
    wrap.innerHTML =
      `<div class="paywall-card">
        <button class="paywall-x" aria-label="Cerrar">✕</button>
        <h2>Recuperar contraseña</h2>
        <p class="paywall-sub">Te enviaremos un enlace para crear una contraseña nueva.</p>
        <input type="email" id="forgot-email" class="modal-input" placeholder="Email" aria-label="Email" value="${cmEsc(prefill)}">
        <button class="plan-cta" id="forgot-send" style="width:100%">Enviar enlace</button>
        <div class="err" id="forgot-err"></div>
      </div>`;
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.querySelector('.paywall-x').onclick = close;
    wrap.onclick = (e) => { if (e.target === wrap) close(); };
    wrap.querySelector('#forgot-send').onclick = async () => {
      const email = wrap.querySelector('#forgot-email').value.trim();
      const err = wrap.querySelector('#forgot-err');
      if (!email) { err.textContent = 'Escribe tu email.'; return; }
      const btn = wrap.querySelector('#forgot-send');
      btn.disabled = true; btn.textContent = 'Enviando…';
      try {
        await Auth.resetPassword(email);
        close();
        toast('Enlace enviado. Revisa tu correo.');
      } catch (e) {
        err.textContent = e.message;
        btn.disabled = false; btn.textContent = 'Enviar enlace';
      }
    };
  },

  // Tras volver del enlace de recuperación: pedir la contraseña nueva.
  openNewPasswordModal() {
    const wrap = document.createElement('div');
    wrap.className = 'paywall';
    wrap.innerHTML =
      `<div class="paywall-card">
        <h2>Nueva contraseña</h2>
        <p class="paywall-sub">Crea tu nueva contraseña para terminar.</p>
        <input type="password" id="newpass" class="modal-input" placeholder="Nueva contraseña (mín. 6)">
        <button class="plan-cta" id="newpass-save" style="width:100%">Guardar</button>
        <div class="err" id="newpass-err"></div>
      </div>`;
    document.body.appendChild(wrap);
    wrap.querySelector('#newpass-save').onclick = async () => {
      const pass = wrap.querySelector('#newpass').value;
      const err = wrap.querySelector('#newpass-err');
      if (pass.length < 6) { err.textContent = 'Mínimo 6 caracteres.'; return; }
      try {
        await Auth.updatePassword(pass);
        wrap.remove();
        toast('Contraseña actualizada');
      } catch (e) { err.textContent = e.message; }
    };
  },

  async submitAuth() {
    const email = document.getElementById('auth-email').value.trim();
    const pass = document.getElementById('auth-pass').value;
    const err = document.getElementById('auth-err');
    const btn = document.getElementById('auth-submit');
    err.textContent = '';
    if (!email || pass.length < 6) {
      err.textContent = 'Escribe tu email y una contraseña de al menos 6 caracteres.';
      return;
    }
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = 'Un momento…';
    try {
      if (this.authMode === 'login') await Auth.login(email, pass);
      else await Auth.register(email, pass);
      await Auth.syncAll();          // fusiona lo local con la cuenta
      this.enterApp();
    } catch (e) {
      err.textContent = (e instanceof TypeError)
        ? 'No hay conexión con el servidor. Prueba de nuevo.'
        : e.message;
    } finally {
      btn.disabled = false;
      btn.textContent = prev;
    }
  },

  // ---------- tutorial de primera vez ----------
  TUTORIAL_STEPS: [
    { e: '📷', t: 'Sube una foto', x: 'Convertimos tu foto en un dibujo numerado, listo para pintar.' },
    { e: '🎨', t: 'Pinta por números', x: 'Elige un color de la paleta y toca las zonas que llevan su número.' },
    { e: '💡', t: 'Pistas y zoom', x: 'Si te pierdes, la pista te lleva a una zona (tienes 3 gratis). Pellizca para hacer zoom y usa ⌖ para centrar.' },
    { e: '🎬', t: 'Comparte tu obra', x: 'Al terminar verás el timelapse de tu pintura para descargarlo o compartirlo.' },
  ],

  tutorialSeen() {
    if (Auth.isLogged() && Auth.user.tutorialDone) return true;
    return localStorage.getItem('andycolor_tutorial_done') === '1';
  },

  markTutorialDone() {
    localStorage.setItem('andycolor_tutorial_done', '1');
    if (Auth.isLogged()) Auth.saveFlags({ tutorialDone: true });
  },

  bindTutorial() {
    document.getElementById('tut-skip').onclick = () => this.closeTutorial();
    document.getElementById('tut-next').onclick = () => {
      if (this.tutStep >= this.TUTORIAL_STEPS.length - 1) this.closeTutorial();
      else this.renderTutorialStep(this.tutStep + 1);
    };
  },

  showTutorial() {
    this.ui.tutorial.style.display = 'flex';
    this.renderTutorialStep(0);
    const nx = document.getElementById('tut-next');
    if (nx) setTimeout(() => { try { nx.focus(); } catch (e) { /* noop */ } }, 30);
  },

  renderTutorialStep(i) {
    this.tutStep = i;
    const s = this.TUTORIAL_STEPS[i];
    document.getElementById('tut-emoji').textContent = s.e;
    document.getElementById('tut-title').textContent = s.t;
    document.getElementById('tut-text').textContent = s.x;
    document.getElementById('tut-dots').innerHTML =
      this.TUTORIAL_STEPS.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
    document.getElementById('tut-next').textContent =
      i >= this.TUTORIAL_STEPS.length - 1 ? '¡A pintar!' : 'Siguiente';
  },

  closeTutorial() {
    this.ui.tutorial.style.display = 'none';
    this.markTutorialDone();
  },

  async showGallery() {
    this.hideAllViews();
    this.ui.galleryView.style.display = 'flex';
    this.updateAccountBtn();
    this.updatePlanChip();
    await this.renderGallery();
  },

  async renderGallery() {
    let items = [];
    try { items = await Creations.list(); } catch (e) { items = []; }
    this.ui.galEmpty.hidden = items.length > 0;
    this.ui.galGrid.innerHTML = '';
    items.forEach(c => {
      const card = document.createElement('div');
      card.className = 'gal-card';
      const done = c.progress >= 100;
      const pct = c.progress || 0;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `Creación ${done ? 'completada' : pct + ' por ciento'}, abrir`);
      card.innerHTML =
        `<img class="thumb" src="${c.thumb || ''}" alt="">` +
        `<button class="del" title="Borrar" aria-label="Borrar creación">✕</button>` +
        `<div class="meta"><div class="bar"><div style="width:${pct}%"></div></div>` +
        `<div class="pct"><span>${done ? '<span class=\"done\">✓ Completo</span>' : pct + '%'}</span></div></div>`;
      const open = () => this.resumeCreation(c.id);
      card.querySelector('.thumb').onclick = open;
      card.querySelector('.meta').onclick = open;
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
      card.querySelector('.del').onclick = async (e) => {
        e.stopPropagation();
        if (confirm('¿Borrar esta creación?')) {
          await Creations.remove(c.id);
          Auth.deleteCreation(c.id);
          this.renderGallery();
        }
      };
      this.ui.galGrid.appendChild(card);
    });
  },

  async resumeCreation(id) {
    const c = await Creations.get(id);
    if (!c) return;
    this.creation = c;
    this.loadDoc(c.doc, c.paintedIds || []);
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

    // modo multitono / colores planos
    this.multitone = true;
    document.querySelectorAll('.mode').forEach(b => {
      b.onclick = () => {
        document.querySelectorAll('.mode').forEach(x => x.classList.remove('selected'));
        b.classList.add('selected');
        this.multitone = (b.dataset.mode === 'multi');
      };
    });
    // v1 sin modo IA: el toggle queda oculto (volverá con "imagina tu foto" + IA)
    this.ui.aiToggle.hidden = true;
    this.ui.modeToggle.hidden = false;   // multitono / colores planos, siempre
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
    fd.append('multitone', this.multitone ? 'true' : 'false');

    this.ui.err.textContent = '';
    this.ui.loadingText.textContent = 'Generando tu obra…';
    this.ui.loading.style.display = 'flex';
    // El anuncio se reproduce MIENTRAS se genera (free); Plus no ve anuncios.
    const adPromise = Ads.gate('create');
    try {
      const headers = {};
      const tk = await Auth.getAccessToken();
      if (tk) headers['Authorization'] = 'Bearer ' + tk;
      const res = await fetch(base + '/generate', { method: 'POST', body: fd, headers });
      if (!res.ok) {
        let detail;
        try { detail = (await res.json()).detail; } catch (_) { detail = await res.text(); }
        throw new Error('HTTP ' + res.status + ' · ' + (detail || '').slice(0, 600));
      }
      const doc = await res.json();
      // guardar como nueva creacion (miniatura = estado del dibujo, aun sin pintar)
      let thumb = '';
      try { thumb = await renderStateThumb(doc, []); } catch (_) { /* sin miniatura */ }
      this.creation = {
        id: Creations.newId(), createdAt: Date.now(), updatedAt: Date.now(),
        thumb, doc, paintedIds: [], total: doc.regions.length, progress: 0,
      };
      try { await Creations.put(this.creation); } catch (_) { /* cuota */ }
      Auth.pushCreation(this.creation);
      await adPromise;               // no abrir el juego con el anuncio a medias
      this.loadDoc(doc, []);
    } catch (e) {
      await adPromise;
      // error de red (no respondio el server) vs error devuelto por el server
      const isNetwork = (e instanceof TypeError);
      this.ui.err.textContent = isNetwork
        ? 'No hay conexión con el servidor. Inténtalo de nuevo en un momento.'
        : 'No se pudo generar: ' + e.message;
    } finally {
      this.ui.loading.style.display = 'none';
    }
  },

  // ---------- carga del documento y construccion del SVG ----------
  loadDoc(doc, paintedIds = []) {
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
    this.paintedSet = new Set();
    this.state.paintedCount = 0;
    this.state.totalRegions = doc.regions.length;

    this.buildSvg();
    this.generarPaletaUI();

    this.hideAllViews();
    this.ui.gameView.style.display = 'flex';
    this.fitCamera(doc.width, doc.height);
    this.resumePainted(paintedIds);   // retoma lo ya pintado de esta creacion
    // quita (sin animacion) los numeros ya completados al retomar
    this.colorRemaining.forEach((rem, i) => {
      if (this.colorTotal[i] > 0 && rem <= 0) {
        const b = document.getElementById('cbtn-' + i);
        if (b) b.remove();
      }
    });
    this.selectFirstAvailable();
    this.updateProgress();
    this.updateHintBadge();
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

    // Capa de DIBUJO (overlay de lineas VECTORIAL): nitido a cualquier zoom. Se ve
    // siempre, encima del color y debajo de los numeros. Hace que se distinga todo.
    if (this.doc.lineOverlayPath) {
      svg.classList.add('has-overlay');
      const ov = document.createElementNS(SVGNS, 'path');
      ov.setAttribute('d', this.doc.lineOverlayPath);
      ov.setAttribute('fill', '#191919');
      ov.setAttribute('fill-rule', 'evenodd');
      ov.setAttribute('pointer-events', 'none');
      svg.appendChild(ov);
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
      // el "completado de numero" lo gestiona updateColorBtn (robusto); aqui solo victoria
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
    if (this.paintedSet) this.paintedSet.add(r.id);
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
  // Pistas: 3 gratis; sin pistas -> ver un anuncio da 3 más. Plus: ilimitadas.
  async hint() {
    const i = this.state.selectedColor;
    if (i < 0) return;
    const id = (this.regionsByColor[i] || []).find(id => !this.pathEls[id].classList.contains('painted'));
    if (id === undefined) return;

    if (!Hints.unlimited()) {
      if (Hints.count() <= 0) {
        const watch = await this.offerHintAd();
        if (!watch) return;
        await Ads.show('hint');
        Hints.grant();
        toast(`+${Hints.PER_AD} pistas 💡`);
      }
      Hints.use();
    }

    const el = this.pathEls[id];
    this.centerOn(el);
    el.classList.add('hintpulse');
    setTimeout(() => el.classList.remove('hintpulse'), 2400);
  },

  // Modal "sin pistas": ver anuncio (true) o cerrar (false).
  offerHintAd() {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'paywall';
      wrap.innerHTML =
        `<div class="paywall-card" style="text-align:center">
          <button class="paywall-x" aria-label="Cerrar">✕</button>
          <h2>Te quedaste sin pistas</h2>
          <p class="paywall-sub">Mira un anuncio corto y consigue ${Hints.PER_AD} pistas más.</p>
          <button class="plan-cta" id="hintad-go" style="width:100%">Ver anuncio</button>
          <p class="paywall-note">¿Sin anuncios y pistas ilimitadas? <button type="button" class="linkbtn" id="hintad-plus" style="color:#764ba2;font-weight:700">Hazte Plus</button></p>
        </div>`;
      document.body.appendChild(wrap);
      const done = (v) => { wrap.remove(); resolve(v); };
      wrap.querySelector('.paywall-x').onclick = () => done(false);
      wrap.onclick = (e) => { if (e.target === wrap) done(false); };
      wrap.querySelector('#hintad-go').onclick = () => done(true);
      wrap.querySelector('#hintad-plus').onclick = () => { done(false); Membership.openPaywall('ads'); };
    });
  },

  updateHintBadge() {
    const b = this.ui.hintBadge;
    if (!b) return;
    if (Hints.unlimited()) { b.textContent = '∞'; }
    else { b.textContent = String(Hints.count()); }
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

  // Fuente UNICA de verdad del estado de un numero. Si su restante llega a <=0
  // (aunque sea por un camino que no detecto el cruce exacto), el boton se va.
  // Asi nunca se queda un numero "pillado" al 100% en la paleta.
  updateColorBtn(i) {
    const btn = document.getElementById('cbtn-' + i);
    if (!btn) return;
    const total = this.colorTotal[i] || 1;
    const rem = this.colorRemaining[i];
    if (rem > 0) {
      btn.style.setProperty('--progress', `${((total - rem) / total) * 100}%`);
      return;
    }
    // numero completado
    btn.style.setProperty('--progress', '100%');
    if (btn.classList.contains('completed')) return;   // ya gestionado
    btn.classList.add('completed');
    btn.classList.remove('selected');
    if (this._resuming) { btn.remove(); return; }       // sin animacion al retomar
    this.onColorCompleted(i);                           // vibra + vanish + avanza
  },

  selectColor(i) {
    this.state.selectedColor = i;
    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('selected'));
    const btn = document.getElementById('cbtn-' + i);
    if (btn) { btn.classList.add('selected'); btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); }
    this.highlightTargets(i);   // resalta donde hay que pintar
  },

  // ---------- guardar / retomar progreso (IndexedDB, por creacion) ----------
  // Guardado con debounce: pintar muchas regiones no machaca IndexedDB.
  saveProgress() {
    if (!this.creation) return;
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._persist(), 700);
  },

  async _persist() {
    if (!this.creation) return;
    const pct = this.state.totalRegions
      ? Math.round((this.state.paintedCount / this.state.totalRegions) * 100) : 0;
    this.creation.paintedIds = Array.from(this.paintedSet || []);
    this.creation.progress = pct;
    this.creation.updatedAt = Date.now();
    try { await Creations.put(this.creation); } catch (e) { /* cuota llena */ }
    Auth.pushCreation(this.creation);   // sincroniza con la cuenta (si hay sesión)
  },

  resumePainted(ids) {
    this._resuming = true;   // no animar la salida de numeros ya completados
    (ids || []).forEach(id => {
      const el = this.pathEls[id], r = this.regionsById[id];
      if (el && r) this.paint(r, el, { feedback: false });
    });
    this._resuming = false;
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

  // anima la salida del numero completado (pop + sube) y lo quita de la paleta
  vanishColorBtn(index) {
    const btn = document.getElementById('cbtn-' + index);
    if (!btn || btn.classList.contains('vanish')) return;
    const num = btn.querySelector('.color-number');
    if (num) num.textContent = '✓';           // satisfaccion: se convierte en check
    btn.classList.add('vanish');
    const done = () => { if (btn.parentNode) btn.remove(); };
    btn.addEventListener('animationend', done, { once: true });
    setTimeout(done, 750);                     // fallback si no llega animationend
  },

  updateProgress() {
    const pct = this.state.totalRegions
      ? Math.round((this.state.paintedCount / this.state.totalRegions) * 100) : 0;
    this.ui.progressBar.style.width = pct + '%';
    this.ui.progressPct.textContent = pct + '%';
    // el timelapse (🎬) solo aparece con el dibujo terminado
    const done = this.state.totalRegions > 0 && this.state.paintedCount === this.state.totalRegions;
    if (this.ui.toolFinale) this.ui.toolFinale.style.display = done ? 'flex' : 'none';
  },

  triggerVictory() {
    this.ui.svg.classList.add('revealed'); // funde lineas y numeros
    if (typeof confetti === 'function') {
      confetti({ particleCount: 120, spread: 80, origin: { y: .6 }, colors: ['#d63384', '#667eea', '#764ba2', '#f093fb', '#4facfe'] });
    }
    this.refreshThumb();   // miniatura final para la galeria
    setTimeout(() => this.openFinale(true), 900);
  },

  // ---------- pantalla final: timelapse + descargar + compartir ----------
  // Regiones en orden de pintado, como [{d, hex}] para el motor Finale.
  buildOrder() {
    const out = [];
    (this.paintedSet ? Array.from(this.paintedSet) : []).forEach(id => {
      const r = this.regionsById[id];
      if (r) out.push({ d: r.d, hex: r.fill || this.doc.palette[r.color].hex });
    });
    return out;
  },

  openFinale(completed) {
    this._order = this.buildOrder();
    if (!this._order.length) return;   // nada que mostrar
    document.getElementById('finale-title').textContent =
      completed ? '🎉 ¡Completado!' : '🎬 Tu progreso';
    this.ui.victory.style.display = 'flex';
    this.playFinale();
  },

  playFinale() {
    const gen = (this._playGen = (this._playGen || 0) + 1);
    const canvas = document.getElementById('finale-canvas');
    Finale.play(canvas, this.doc, this._order || [], { cancelled: () => gen !== this._playGen });
  },

  async withBusy(btn, label, fn) {
    const prev = btn.textContent;
    btn.disabled = true; btn.textContent = label;
    try { await fn(); } finally { btn.disabled = false; btn.textContent = prev; }
  },

  bindFinale() {
    const order = () => this._order || [];
    document.getElementById('fin-replay').onclick = () => this.playFinale();

    document.getElementById('fin-download').onclick = (e) =>
      this.withBusy(e.currentTarget, '…', async () => {
        const png = await Finale.toPng(this.doc, order());
        downloadBlob(png, 'mi-obra.png');
      });

    document.getElementById('fin-video').onclick = (e) =>
      this.withBusy(e.currentTarget, 'Grabando…', async () => {
        const vid = await Finale.toVideo(this.doc, order());
        if (vid) downloadBlob(vid, 'mi-timelapse.webm');
        else alert('Tu navegador no permite exportar vídeo.');
      });

    document.getElementById('fin-share').onclick = (e) =>
      this.withBusy(e.currentTarget, 'Preparando…', async () => {
        const png = await Finale.toPng(this.doc, order(), 1080);
        const ok = await shareFile(png, 'mi-obra.png', '¡Mira mi obra! 🎨');
        if (!ok) downloadBlob(png, 'mi-obra.png');   // fallback: descarga
      });
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
    document.getElementById('back-btn').onclick = () => this.backToGallery();
    document.getElementById('victory-close').onclick = () => { this.ui.victory.style.display = 'none'; this.backToGallery(); };
    // herramientas (zoom / centrar / pista)
    const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    bind('tool-zoom-in', () => this.zoomBy(1.4));
    bind('tool-zoom-out', () => this.zoomBy(0.72));
    bind('tool-fit', () => this.fit());
    bind('tool-hint', () => this.hint());
    bind('tool-finale', () => this.openFinale(this.state.paintedCount === this.state.totalRegions));
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

  async backToGallery() {
    this._playGen = (this._playGen || 0) + 1;  // detiene cualquier timelapse en curso
    clearTimeout(this._saveTimer);
    await this.refreshThumb();  // miniatura = estado pintado actual
    await this._persist();      // guarda el progreso antes de salir
    this.showGallery();
  },

  // Regenera la miniatura de la creacion con el estado pintado actual.
  async refreshThumb() {
    if (!this.creation || !this.doc) return;
    try {
      const thumb = await renderStateThumb(this.doc, Array.from(this.paintedSet || []));
      if (thumb) this.creation.thumb = thumb;
    } catch (e) { /* mantiene la miniatura anterior */ }
  },
};

document.addEventListener('DOMContentLoaded', () => SvgGame.init());
