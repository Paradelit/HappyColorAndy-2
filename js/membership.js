// ==========================================
// 💳 MEMBERSHIP.JS — Planes, límites y paywall (capa local)
// ==========================================
// Estado de membresía LOCAL (localStorage) para poder construir y probar todo
// el gating sin backend. Cuando haya Stripe + cuentas, este estado se sustituye
// por el que devuelva el servidor (ver startCheckout más abajo).
//
//  >>> AJUSTA AQUÍ precios y límites de cada plan <<<
const PLANS = {
  free: {
    id: 'free', name: 'Gratis', price: '€0',
    ai: false, ads: true, limit: 5,
    perks: ['Crear con anuncios', 'Pista con anuncio', 'Hasta 5 creaciones'],
  },
  plus: {
    id: 'plus', name: 'Plus', price: '€5/mes',
    ai: true, ads: false, limit: 50,
    perks: ['Sin anuncios', 'Modo IA (mejores dibujos)', 'Hasta 50 creaciones'],
  },
  pro: {
    id: 'pro', name: 'Pro', price: '€20/mes',
    ai: true, ads: false, limit: Infinity,
    perks: ['Sin anuncios', 'Modo IA (mejores dibujos)', 'Creaciones ilimitadas'],
  },
};

const Membership = {
  _KEY: 'andycolor_plan',
  plans: PLANS,

  tier() {
    const t = localStorage.getItem(this._KEY);
    return PLANS[t] ? t : 'free';
  },
  plan() { return PLANS[this.tier()]; },
  setTier(t) {
    if (!PLANS[t]) return;
    localStorage.setItem(this._KEY, t);
    document.dispatchEvent(new CustomEvent('plan-changed'));
  },
  isMember() { return this.tier() !== 'free'; },
  hasAI() { return this.plan().ai; },
  adsEnabled() { return this.plan().ads; },
  creationLimit() { return this.plan().limit; },

  // -------- Paywall (pantalla de planes) --------
  // context: 'ai' | 'limit' | 'manual' -> personaliza el subtítulo.
  openPaywall(context = 'manual') {
    const sub = {
      ai: 'El modo IA (dibujos más limpios) está en Plus y Pro.',
      limit: 'Has alcanzado el límite de creaciones de tu plan.',
      manual: 'Mejora tu plan para quitar anuncios y desbloquear la IA.',
    }[context] || '';

    const wrap = document.createElement('div');
    wrap.className = 'paywall';
    wrap.innerHTML =
      `<div class="paywall-card">
        <button class="paywall-x" aria-label="Cerrar">✕</button>
        <h2>Mejora tu plan</h2>
        <p class="paywall-sub">${sub}</p>
        <div class="plans">
          ${['free', 'plus', 'pro'].map(id => this._planCardHtml(id)).join('')}
        </div>
        <p class="paywall-note">Demo: la suscripción se simula localmente. Aquí se conectará Stripe Checkout.</p>
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
      : (current ? 'Plan actual' : `Elegir ${p.name}`);
    return `<div class="plan ${id} ${current ? 'current' : ''}">
        <div class="plan-name">${p.name}</div>
        <div class="plan-price">${p.price}</div>
        <ul>${p.perks.map(x => `<li>${x}</li>`).join('')}</ul>
        <button class="plan-cta" ${current || id === 'free' ? 'disabled' : ''} data-buy="${id}">${cta}</button>
      </div>`;
  },
};

// PUNTO DE INTEGRACIÓN STRIPE -----------------------------------------------
// Hoy: simula la suscripción cambiando el plan local (para probar la app).
// Mañana: llamar al backend para crear una sesión de Stripe Checkout y redirigir;
// al volver, el backend confirma el pago (webhook) y la app lee el plan real.
function startCheckout(tier) {
  Membership.setTier(tier);
  toast(`✓ Plan ${PLANS[tier].name} activado (demo)`);
}

// Mini toast reutilizable.
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2200);
}
