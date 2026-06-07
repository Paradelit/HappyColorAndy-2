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
