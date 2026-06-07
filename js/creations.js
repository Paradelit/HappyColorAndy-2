// ==========================================
// 💾 CREATIONS.JS — Almacen de "Mis creaciones" (IndexedDB)
// ==========================================
// Guarda cada puzzle generado (el doc JSON + miniatura + progreso) para poder
// dejar uno a medias y retomarlo. Persiste entre sesiones en el dispositivo.

const Creations = {
  _db: null,

  open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((res, rej) => {
      const req = indexedDB.open('cbn-creations', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('creations')) {
          db.createObjectStore('creations', { keyPath: 'id' });
        }
      };
      req.onsuccess = () => { this._db = req.result; res(this._db); };
      req.onerror = () => rej(req.error);
    });
  },

  async _store(mode) {
    const db = await this.open();
    return db.transaction('creations', mode).objectStore('creations');
  },

  async put(creation) {
    const s = await this._store('readwrite');
    return new Promise((res, rej) => {
      const r = s.put(creation);
      r.onsuccess = () => res(creation);
      r.onerror = () => rej(r.error);
    });
  },

  async get(id) {
    const s = await this._store('readonly');
    return new Promise((res, rej) => {
      const r = s.get(id);
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => rej(r.error);
    });
  },

  async list() {
    const s = await this._store('readonly');
    return new Promise((res, rej) => {
      const r = s.getAll();
      r.onsuccess = () => res((r.result || []).sort((a, b) => b.updatedAt - a.updatedAt));
      r.onerror = () => rej(r.error);
    });
  },

  async remove(id) {
    const s = await this._store('readwrite');
    return new Promise((res, rej) => {
      const r = s.delete(id);
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    });
  },

  // genera un id corto y unico
  newId() {
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  },
};

// Miniatura (dataURI JPEG) a partir de un File de imagen, para la galeria.
async function makeThumb(file, size = 280) {
  const img = await createImageBitmap(file);
  const scale = size / Math.max(img.width, img.height);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, 0, 0, w, h);
  try { img.close(); } catch (e) { /* noop */ }
  return c.toDataURL('image/jpeg', 0.72);
}

// Miniatura que refleja el ESTADO PINTADO actual: fondo blanco + las regiones ya
// pintadas con su color real + el overlay de lineas negro encima. Si no hay nada
// pintado, se ve solo el dibujo de lineas (como un color-by-number sin empezar).
function renderStateThumb(doc, paintedIds, size = 280) {
  const W = doc.width, H = doc.height;
  const painted = new Set(paintedIds || []);
  let body = `<rect width="${W}" height="${H}" fill="#ffffff"/>`;
  for (const r of doc.regions) {
    if (painted.has(r.id)) {
      const hex = r.fill || (doc.palette[r.color] && doc.palette[r.color].hex) || '#ffffff';
      body += `<path d="${r.d}" fill="${hex}"/>`;
    }
  }
  if (doc.lineOverlayPath) body += `<path d="${doc.lineOverlayPath}" fill="#191919"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${body}</svg>`;
  return rasterizeSvg(svg, W, H, size);
}

// Convierte una cadena SVG en un dataURI JPEG escalado a `size` (lado mayor).
function rasterizeSvg(svgStr, W, H, size) {
  return new Promise((resolve) => {
    const scale = size / Math.max(W, H);
    const tw = Math.max(1, Math.round(W * scale));
    const th = Math.max(1, Math.round(H * scale));
    const url = URL.createObjectURL(new Blob([svgStr], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = tw; c.height = th;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, tw, th);
      ctx.drawImage(img, 0, 0, tw, th);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(''); };
    img.src = url;
  });
}
