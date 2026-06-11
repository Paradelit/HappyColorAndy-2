// ==========================================
// ✨ LANDING.JS — Animaciones de la landing (scroll + demo que se pinta sola)
// ==========================================
// Sin librerías: barra de progreso de scroll, reveal-on-scroll con
// IntersectionObserver (con fallback para que el contenido SIEMPRE se vea), y
// una mini demo de color-by-number que se pinta sola dentro del móvil del hero.

const Landing = {
  PAL: { 1: '#cfe8ff', 2: '#ffd9a3', 3: '#ffce4a', 4: '#7b6196', 5: '#574a72', 6: '#5fae57', 7: '#7cc36b' },

  // Número (color) de cada celda según una escena tipo "paisaje" (sol, montañas,
  // cielo, hierba): así la demo se lee como una foto convirtiéndose en cuadro.
  scene(u, v) {
    if (v > 0.63) return ((Math.floor(u * 11) + Math.floor(v * 22)) % 5 === 0) ? 7 : 6;   // hierba
    const m1 = 0.63 - 0.30 * Math.max(0, 1 - Math.abs(u - 0.34) / 0.26);
    const m2 = 0.63 - 0.25 * Math.max(0, 1 - Math.abs(u - 0.66) / 0.22);
    const mtop = Math.min(m1, m2);
    if (v > mtop) return (m2 <= m1 && Math.abs(u - 0.66) < 0.22) ? 5 : 4;                  // montañas
    if ((u - 0.74) ** 2 + (v - 0.26) ** 2 * 1.5 < 0.016) return 3;                          // sol
    return v > 0.42 ? 2 : 1;                                                                // cielo
  },

  build() {
    const host = document.getElementById('lp-demo');
    if (!host) return;
    const NS = 'http://www.w3.org/2000/svg';
    const COLS = 11, ROWS = 22;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${COLS} ${ROWS}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');

    const cells = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const num = this.scene((c + 0.5) / COLS, (r + 0.5) / ROWS);
        const rect = document.createElementNS(NS, 'rect');
        rect.setAttribute('x', c); rect.setAttribute('y', r);
        rect.setAttribute('width', 1); rect.setAttribute('height', 1);
        rect.setAttribute('fill', '#ffffff');
        rect.setAttribute('stroke', '#e3e7ef');
        rect.setAttribute('stroke-width', 0.045);
        rect.style.transition = 'fill .3s ease';
        svg.appendChild(rect);

        const t = document.createElementNS(NS, 'text');
        t.setAttribute('x', c + 0.5); t.setAttribute('y', r + 0.5);
        t.setAttribute('text-anchor', 'middle'); t.setAttribute('dominant-baseline', 'central');
        t.setAttribute('font-size', 0.5); t.setAttribute('fill', '#b9c0cc');
        t.style.transition = 'opacity .3s ease';
        t.textContent = num;
        svg.appendChild(t);

        cells.push({ rect, t, color: this.PAL[num] });
      }
    }
    host.appendChild(svg);
    this.cells = cells;
    this.animate();
  },

  animate() {
    const cells = this.cells;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const order = cells.map((_, i) => i).sort(() => Math.random() - 0.5);
    const paint = (i) => { const c = cells[order[i]]; c.rect.setAttribute('fill', c.color); c.rect.setAttribute('stroke', 'rgba(0,0,0,.06)'); c.t.style.opacity = 0; };
    const clear = (c) => { c.rect.setAttribute('fill', '#ffffff'); c.rect.setAttribute('stroke', '#e3e7ef'); c.t.style.opacity = 1; };

    if (reduce) { cells.forEach((_, i) => paint(i)); return; }

    const FILL = 2600, HOLD = 1500, FADE = 900;
    let phase = 'fill', t0 = performance.now(), done = 0;
    const loop = (now) => {
      // si la landing no está visible, espera sin gastar
      if (document.getElementById('landing-view').offsetParent === null) { t0 = now; requestAnimationFrame(loop); return; }
      const el = now - t0;
      if (phase === 'fill') {
        const target = Math.min(cells.length, Math.floor((el / FILL) * cells.length));
        while (done < target) paint(done++);
        if (el >= FILL) { phase = 'hold'; t0 = now; }
      } else if (phase === 'hold') {
        if (el >= HOLD) { phase = 'fade'; t0 = now; }
      } else {
        if (el >= FADE) { cells.forEach(clear); order.sort(() => Math.random() - 0.5); done = 0; phase = 'fill'; t0 = now; }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },

  initScroll() {
    const lv = document.getElementById('landing-view');
    const prog = document.getElementById('lp-progress');
    if (lv && prog) {
      lv.addEventListener('scroll', () => {
        const max = lv.scrollHeight - lv.clientHeight;
        prog.style.width = max > 0 ? (lv.scrollTop / max * 100) + '%' : '0';
      }, { passive: true });
    }

    // stagger: retrasa cada tarjeta dentro de su grupo
    ['.lp-steps', '.lp-feats', '.lp-prices'].forEach(sel => {
      const p = document.querySelector('#landing-view ' + sel);
      if (!p) return;
      [...p.children].forEach((c, i) => { if (c.classList.contains('reveal')) c.style.transitionDelay = (i * 80) + 'ms'; });
    });

    const els = document.querySelectorAll('#landing-view .reveal');
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
      }, { root: lv, threshold: 0.14 });
      els.forEach(el => io.observe(el));
      // seguridad: si algo no se reveló (observer no disparó), muéstralo igual
      setTimeout(() => els.forEach(el => el.classList.add('in')), 2600);
    } else {
      els.forEach(el => el.classList.add('in'));
    }
  },

  init() { this.build(); this.initScroll(); },
};

document.addEventListener('DOMContentLoaded', () => Landing.init());
