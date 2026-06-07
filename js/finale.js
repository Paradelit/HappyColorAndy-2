// ==========================================
// 🎬 FINALE.JS — Timelapse, descargar (PNG), vídeo (webm) y compartir
// ==========================================
// Reproduce un "fast-forward" de cómo se pintó la foto rellenando las regiones
// en el mismo orden en que se pintaron, y permite exportar imagen/vídeo y
// compartir con la Web Share API.
//
// API mínima:
//   doc            = { width, height, lineOverlayPath }
//   orderedRegions = [ { d: <path>, hex: <color> }, ... ]  (en orden de pintado)

const Finale = {
  MAX_SIDE: 720,        // lado mayor del lienzo de render
  DURATION: 4500,       // ms del timelapse

  // dimensiones del lienzo que encajan el doc dentro de MAX_SIDE
  _fit(doc) {
    const scale = this.MAX_SIDE / Math.max(doc.width, doc.height);
    return {
      w: Math.max(1, Math.round(doc.width * scale)),
      h: Math.max(1, Math.round(doc.height * scale)),
      scale,
    };
  },

  // dibuja el estado COMPLETO (fondo + todas las regiones dadas + líneas)
  _drawFull(ctx, doc, orderedRegions, scale) {
    ctx.save();
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, doc.width, doc.height);
    for (const r of orderedRegions) {
      ctx.fillStyle = r.hex;
      ctx.fill(new Path2D(r.d));
    }
    if (doc.lineOverlayPath) {
      ctx.fillStyle = '#191919';
      ctx.fill(new Path2D(doc.lineOverlayPath));
    }
    ctx.restore();
  },

  // Reproduce el timelapse en un <canvas> visible. Devuelve una Promesa que
  // resuelve al terminar. opts.onProgress(frac) opcional.
  play(canvas, doc, orderedRegions, opts = {}) {
    const { w, h, scale } = this._fit(doc);
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    const overlay = doc.lineOverlayPath ? new Path2D(doc.lineOverlayPath) : null;
    const paths = orderedRegions.map(r => ({ p: new Path2D(r.d), hex: r.hex }));
    const N = paths.length;
    const D = opts.duration || this.DURATION;

    // fondo blanco + líneas de partida
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.scale(scale, scale);
    if (overlay) { ctx.fillStyle = '#191919'; ctx.fill(overlay); }

    return new Promise((resolve) => {
      let drawn = 0;
      const t0 = performance.now();
      const step = (now) => {
        if (opts.cancelled && opts.cancelled()) return resolve();
        const frac = N ? Math.min(1, (now - t0) / D) : 1;
        const target = Math.floor(frac * N);
        for (; drawn < target; drawn++) {
          ctx.fillStyle = paths[drawn].hex;
          ctx.fill(paths[drawn].p);
        }
        if (overlay) { ctx.fillStyle = '#191919'; ctx.fill(overlay); }
        if (opts.onProgress) opts.onProgress(frac);
        if (frac < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  },

  // PNG final (Blob) a alta resolución (lado mayor = size).
  toPng(doc, orderedRegions, size = 1280) {
    const scale = size / Math.max(doc.width, doc.height);
    const w = Math.max(1, Math.round(doc.width * scale));
    const h = Math.max(1, Math.round(doc.height * scale));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    this._drawFull(c.getContext('2d'), doc, orderedRegions, scale);
    return new Promise((res) => c.toBlob(res, 'image/png'));
  },

  // Vídeo webm (Blob) del timelapse, grabado con MediaRecorder sobre un lienzo
  // fuera de pantalla. Devuelve null si el navegador no lo soporta.
  async toVideo(doc, orderedRegions, opts = {}) {
    if (typeof MediaRecorder === 'undefined') return null;
    const { w, h } = this._fit(doc);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const stream = canvas.captureStream(30);
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
      .find(m => MediaRecorder.isTypeSupported(m)) || '';
    if (!mime) return null;
    const rec = new MediaRecorder(stream, { mimeType: mime });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise(r => { rec.onstop = r; });
    rec.start();
    await this.play(canvas, doc, orderedRegions, opts);
    await new Promise(r => setTimeout(r, 700));  // congela el frame final
    rec.stop();
    await stopped;
    return new Blob(chunks, { type: 'video/webm' });
  },
};

// Descarga un Blob como fichero.
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// Comparte un fichero con la Web Share API. Devuelve true si se compartió,
// false si el navegador no lo soporta (para hacer fallback a descarga).
async function shareFile(blob, filename, text) {
  try {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Mi obra', text });
      return true;
    }
  } catch (e) { /* el usuario canceló o no soporta */ }
  return false;
}
