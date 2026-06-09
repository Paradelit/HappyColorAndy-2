// ==========================================
// 🍪 CONSENT.JS — Banner de consentimiento (cookies / publicidad) RGPD
// ==========================================
// Banner de consentimiento propio: necesario (siempre), análisis y publicidad.
// Guarda la elección y la expone a la capa de anuncios. El usuario puede
// cambiarla cuando quiera (Cuenta → Privacidad y cookies).
//
// ⚠️ Para AdSense/AdMob reales en la UE, Google exige un CMP CERTIFICADO
// (IAB TCF v2.2). Este banner cubre el MVP y el flujo de UX; en producción se
// sustituye/!complementa con el CMP de Google (Funding Choices) o uno
// registrado (Cookiebot, Didomi…), alimentando Consent.set() con su resultado.

const Consent = {
  _KEY: 'andycolor_consent',
  _V: 1,

  decision() {
    try {
      const d = JSON.parse(localStorage.getItem(this._KEY) || 'null');
      return d && d.v === this._V ? d : null;
    } catch (e) { return null; }
  },

  has() { return !!this.decision(); },
  get(cat) {
    if (cat === 'necessary') return true;
    const d = this.decision();
    return !!(d && d[cat]);
  },

  set(prefs) {
    const d = { v: this._V, ts: Date.now(),
      analytics: !!prefs.analytics, ads: !!prefs.ads };
    localStorage.setItem(this._KEY, JSON.stringify(d));
    document.dispatchEvent(new CustomEvent('consent-changed', { detail: d }));
    // PUNTO DE INTEGRACIÓN: aquí se notifica al SDK real (Consent Mode de
    // Google, AdSense npa, etc.) el estado actualizado.
  },

  acceptAll() { this.set({ analytics: true, ads: true }); this._close(); },
  rejectAll() { this.set({ analytics: false, ads: false }); this._close(); },

  // Muestra el banner si aún no hay decisión.
  init() {
    if (!this.has()) this.showBanner();
  },

  showBanner() {
    if (document.getElementById('consent-banner')) return;
    const el = document.createElement('div');
    el.id = 'consent-banner';
    el.className = 'consent-banner';
    el.innerHTML =
      `<div class="consent-inner">
        <div class="consent-text">
          🍪 Usamos almacenamiento necesario para que la app funcione y, con tu
          permiso, cookies de análisis y publicidad. Lee nuestra
          <a href="/privacy" target="_blank">Política de Privacidad</a>.
        </div>
        <div class="consent-btns">
          <button class="c-ghost" id="consent-prefs">Preferencias</button>
          <button class="c-ghost" id="consent-reject">Rechazar</button>
          <button class="c-primary" id="consent-accept">Aceptar todo</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.querySelector('#consent-accept').onclick = () => this.acceptAll();
    el.querySelector('#consent-reject').onclick = () => this.rejectAll();
    el.querySelector('#consent-prefs').onclick = () => { this._close(); this.openPreferences(); };
  },

  // Panel de preferencias granulares (también accesible desde Cuenta).
  openPreferences() {
    const d = this.decision() || { analytics: false, ads: false };
    const wrap = document.createElement('div');
    wrap.className = 'paywall';
    wrap.innerHTML =
      `<div class="paywall-card">
        <button class="paywall-x" aria-label="Cerrar">✕</button>
        <h2>Privacidad y cookies</h2>
        <p class="paywall-sub">Elige qué permites. Puedes cambiarlo cuando quieras.</p>
        <label class="consent-row"><span><b>Necesarias</b><small>Imprescindibles para que la app funcione (sesión, tus cuadros).</small></span><input type="checkbox" checked disabled></label>
        <label class="consent-row"><span><b>Análisis</b><small>Nos ayuda a entender el uso para mejorar la app.</small></span><input type="checkbox" id="c-analytics" ${d.analytics ? 'checked' : ''}></label>
        <label class="consent-row"><span><b>Publicidad</b><small>Permite anuncios personalizados en la versión gratuita.</small></span><input type="checkbox" id="c-ads" ${d.ads ? 'checked' : ''}></label>
        <button class="plan-cta" id="c-save" style="width:100%;margin-top:8px">Guardar preferencias</button>
        <p class="paywall-note"><a href="/privacy" target="_blank" style="color:#764ba2">Política de Privacidad</a></p>
      </div>`;
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.querySelector('.paywall-x').onclick = close;
    wrap.onclick = (e) => { if (e.target === wrap) close(); };
    wrap.querySelector('#c-save').onclick = () => {
      this.set({
        analytics: wrap.querySelector('#c-analytics').checked,
        ads: wrap.querySelector('#c-ads').checked,
      });
      close();
      if (typeof toast === 'function') toast('Preferencias guardadas');
    };
  },

  _close() {
    const el = document.getElementById('consent-banner');
    if (el) el.remove();
  },
};

document.addEventListener('DOMContentLoaded', () => Consent.init());
