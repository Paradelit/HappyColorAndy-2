// ==========================================
// 💳 MEMBERSHIP.JS — Plan, paywall y economía de pistas
// ==========================================
// MVP v1: dos planes. Free = con anuncios; Plus (€5, pago único) = sin anuncios
// (y pistas ilimitadas, porque las pistas extra se ganan viendo anuncios).
// El modo IA de pago llegará más adelante.
//
// Si hay sesión, el plan y las pistas viven en la cuenta (servidor); sin sesión,
// en localStorage. startCheckout() es el punto de integración de Stripe: hoy
// simula la compra para poder probar la app entera.
//
//  >>> AJUSTA AQUÍ precios y textos <<<
const PLANS = {
  free: {
    id: 'free', name: 'Gratis', price: '€0',
    ads: true,
    perks: ['Crea y pinta sin límite', 'Anuncios al crear y en pistas extra'],
  },
  plus: {
    id: 'plus', name: 'Plus', price: '€5 · pago único',
    ads: false,
    perks: ['Sin anuncios', 'Pistas ilimitadas', 'Apoyas el desarrollo'],
  },
};

const Membership = {
  _KEY: 'andycolor_plan',
  plans: PLANS,

  tier() {
    if (typeof Auth !== 'undefined' && Auth.isLogged()) {
      return PLANS[Auth.user.plan] ? Auth.user.plan : 'free';
    }
    const t = localStorage.getItem(this._KEY);
    return PLANS[t] ? t : 'free';
  },
  plan() { return PLANS[this.tier()]; },
  setTier(t) {
    if (!PLANS[t]) return;
    if (typeof Auth !== 'undefined' && Auth.isLogged()) {
      Auth.user.plan = t;
      Auth.saveFlags({ plan: t });
    }
    localStorage.setItem(this._KEY, t);
    document.dispatchEvent(new CustomEvent('plan-changed'));
  },
  isMember() { return this.tier() !== 'free'; },
  adsEnabled() { return this.plan().ads; },

  // -------- Paywall --------
  openPaywall(context = 'manual') {
    const sub = {
      ads: 'Quita los anuncios para siempre y pinta sin interrupciones.',
      manual: 'Mejora a Plus para quitar los anuncios.',
    }[context] || '';

    const wrap = document.createElement('div');
    wrap.className = 'paywall';
    wrap.innerHTML =
      `<div class="paywall-card">
        <button class="paywall-x" aria-label="Cerrar">✕</button>
        <h2>Hazte Plus</h2>
        <p class="paywall-sub">${sub}</p>
        <div class="plans">
          ${['free', 'plus'].map(id => this._planCardHtml(id)).join('')}
        </div>
        <p class="paywall-note">Demo: la compra se simula localmente. Aquí se conectará Stripe Checkout.</p>
      </div>`;
    document.body.appendChild(wrap);

    const close = () => wrap.remove();
    wrap.querySelector('.paywall-x').onclick = close;
    wrap.onclick = (e) => { if (e.target === wrap) close(); };
    wrap.querySelectorAll('[data-buy]').forEach(btn => {
      btn.onclick = () => { startCheckout(btn.getAttribute('data-buy')); close(); };
    });
  },

  _planCardHtml(id) {
    const p = PLANS[id];
    const current = this.tier() === id;
    const cta = id === 'free'
      ? (current ? 'Tu plan' : 'Gratis')
      : (current ? 'Plan actual' : 'Quitar anuncios');
    return `<div class="plan ${id} ${current ? 'current' : ''}">
        <div class="plan-name">${p.name}</div>
        <div class="plan-price">${p.price}</div>
        <ul>${p.perks.map(x => `<li>${x}</li>`).join('')}</ul>
        <button class="plan-cta" ${current || id === 'free' ? 'disabled' : ''} data-buy="${id}">${cta}</button>
      </div>`;
  },
};

// PUNTO DE INTEGRACIÓN STRIPE -----------------------------------------------
// Hoy: simula la compra cambiando el plan (para probar la app entera).
// Mañana: pedir al backend una sesión de Stripe Checkout, redirigir, y al volver
// el webhook confirma el pago y fija plan=plus en la cuenta del usuario.
function startCheckout(tier) {
  Membership.setTier(tier);
  toast(`✓ Plan ${PLANS[tier].name} activado (demo)`);
}

// ==========================================
// 💡 HINTS — 3 pistas gratis; más viendo un anuncio (+3). Plus: ilimitadas.
// ==========================================
const Hints = {
  _KEY: 'andycolor_hints',
  START: 3,
  PER_AD: 3,

  unlimited() { return Membership.isMember(); },

  count() {
    if (typeof Auth !== 'undefined' && Auth.isLogged()) return Auth.user.hints ?? 0;
    const v = localStorage.getItem(this._KEY);
    return v === null ? this.START : Math.max(0, parseInt(v, 10) || 0);
  },

  set(n) {
    n = Math.max(0, n);
    if (typeof Auth !== 'undefined' && Auth.isLogged()) {
      Auth.user.hints = n;
      Auth.saveFlags({ hints: n });
    } else {
      localStorage.setItem(this._KEY, String(n));
    }
    document.dispatchEvent(new CustomEvent('hints-changed'));
  },

  use() { this.set(this.count() - 1); },
  grant() { this.set(this.count() + this.PER_AD); },
};

// Mini toast reutilizable.
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2200);
}
