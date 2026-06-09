// ==========================================
// 📺 ADS.JS — Anuncios para usuarios free (mock)
// ==========================================
// Muestra un anuncio antes de una acción (crear un CBN, usar la bombilla) para
// usuarios del plan gratuito. Ahora es un MOCK con cuenta atrás; el SDK real
// (AdSense / AdMob / Rewarded ads) se enchufa dentro de Ads.show().

const Ads = {
  SECONDS: 4,   // duración del anuncio mock

  // Muestra un anuncio y resuelve cuando termina. reason: 'create' | 'hint'.
  // Devuelve una Promesa<void>. (Si en el futuro fuera "rewarded", podría
  // resolver con true/false según si se vio entero.)
  show(reason = 'create') {
    // >>> INTEGRACIÓN SDK REAL: aquí se cargaría/mostraría el anuncio y se
    //     resolvería la promesa en su callback de cierre/recompensa. <<<
    const label = reason === 'hint' ? 'Anuncio para tu pista' : 'Anuncio';
    return new Promise((resolve) => {
      let left = this.SECONDS;
      const ov = document.createElement('div');
      ov.className = 'ad-overlay';
      ov.innerHTML =
        `<div class="ad-box">
          <div class="ad-tag">PUBLICIDAD</div>
          <div class="ad-art">📺</div>
          <div class="ad-label">${label}</div>
          <div class="ad-count"><span id="ad-left">${left}</span>s</div>
          <button class="ad-skip" disabled>Saltar</button>
          <div class="ad-foot">Sin anuncios con Plus (€5, pago único)</div>
        </div>`;
      document.body.appendChild(ov);

      const leftEl = ov.querySelector('#ad-left');
      const skip = ov.querySelector('.ad-skip');
      const done = () => { clearInterval(timer); ov.remove(); resolve(); };
      skip.onclick = () => { if (!skip.disabled) done(); };

      const timer = setInterval(() => {
        left -= 1;
        if (left <= 0) {
          skip.disabled = false;
          skip.textContent = 'Continuar';
          leftEl.parentElement.style.visibility = 'hidden';
          clearInterval(timer);
          // auto-continúa poco después si no pulsa
          setTimeout(() => { if (document.body.contains(ov)) done(); }, 1200);
        } else {
          leftEl.textContent = left;
        }
      }, 1000);
    });
  },

  // Conveniencia: muestra el anuncio solo si el plan actual lleva anuncios.
  async gate(reason) {
    if (typeof Membership !== 'undefined' && Membership.adsEnabled()) {
      await this.show(reason);
    }
  },
};
