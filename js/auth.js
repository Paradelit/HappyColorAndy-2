// ==========================================
// 👤 AUTH.JS — Cuentas + sincronización de progreso
// ==========================================
// Login con email+password contra el backend propio (/auth/*). Si hay sesión,
// las creaciones se sincronizan con el servidor (/sync/*) para no perder el
// progreso al cambiar de dispositivo o limpiar el navegador. Sin sesión
// ("probar sin cuenta") todo sigue funcionando solo en local (IndexedDB).

const Auth = {
  _TOKEN: 'andycolor_token',
  _GUEST: 'andycolor_guest',
  user: null,

  base() {
    const el = document.getElementById('backend-url');
    return el && el.value ? el.value.replace(/\/$/, '') : '';
  },
  token() { return localStorage.getItem(this._TOKEN) || ''; },
  isLogged() { return !!this.token() && !!this.user; },
  isGuest() { return localStorage.getItem(this._GUEST) === '1'; },
  setGuest(v) { localStorage.setItem(this._GUEST, v ? '1' : '0'); },

  async api(path, opts = {}) {
    const headers = Object.assign(
      { 'Content-Type': 'application/json' },
      this.token() ? { Authorization: 'Bearer ' + this.token() } : {},
      opts.headers || {}
    );
    const res = await fetch(this.base() + path, Object.assign({}, opts, { headers }));
    let data = {};
    try { data = await res.json(); } catch (e) { /* sin cuerpo */ }
    if (!res.ok) throw new Error(data.detail || ('Error ' + res.status));
    return data;
  },

  async register(email, password) {
    const d = await this.api('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) });
    localStorage.setItem(this._TOKEN, d.token);
    this.user = d.user;
    this.setGuest(false);
    return d.user;
  },

  async login(email, password) {
    const d = await this.api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    localStorage.setItem(this._TOKEN, d.token);
    this.user = d.user;
    this.setGuest(false);
    return d.user;
  },

  // Restaura la sesión al abrir la app. Devuelve el user o null.
  async restore() {
    if (!this.token()) return null;
    try {
      const d = await this.api('/auth/me');
      this.user = d.user;
      return d.user;
    } catch (e) {
      // token caducado/inválido u offline: si es error de red conserva el token
      if (!(e instanceof TypeError)) localStorage.removeItem(this._TOKEN);
      return null;
    }
  },

  logout() {
    localStorage.removeItem(this._TOKEN);
    this.user = null;
  },

  // Actualiza flags del usuario (tutorialDone, plan, hints) en el servidor.
  async saveFlags(flags) {
    if (!this.isLogged()) return;
    try {
      const d = await this.api('/user/flags', { method: 'POST', body: JSON.stringify(flags) });
      this.user = d.user;
    } catch (e) { /* sin red: se reintentará en la próxima acción */ }
  },

  // ---------------- sincronización de creaciones ----------------

  // Fusiona servidor <-> local: gana la versión con updatedAt más reciente.
  async syncAll() {
    if (!this.isLogged()) return;
    try {
      const remote = (await this.api('/sync/creations')).creations;
      const local = await Creations.list();
      const lmap = new Map(local.map(c => [c.id, c]));
      const rmap = new Map(remote.map(c => [c.id, c]));

      for (const r of remote) {                      // bajar lo nuevo del servidor
        const l = lmap.get(r.id);
        if (!l || (r.updatedAt || 0) > (l.updatedAt || 0)) {
          try {
            const full = await this.api('/sync/creations/' + r.id);
            await Creations.put(JSON.parse(full.payload));
          } catch (e) { /* siguiente */ }
        }
      }
      for (const l of local) {                       // subir lo nuevo local
        const r = rmap.get(l.id);
        if (!r || (l.updatedAt || 0) > (r.updatedAt || 0)) this.pushCreation(l);
      }
    } catch (e) { /* offline: la app sigue en local */ }
  },

  // Sube una creación (fire-and-forget con debounce por id).
  _pushTimers: {},
  pushCreation(c) {
    if (!this.isLogged() || !c) return;
    clearTimeout(this._pushTimers[c.id]);
    this._pushTimers[c.id] = setTimeout(() => {
      this.api('/sync/creations/' + c.id, {
        method: 'PUT',
        body: JSON.stringify({
          updatedAt: c.updatedAt || Date.now(),
          progress: c.progress || 0,
          thumb: c.thumb || '',
          payload: JSON.stringify(c),
        }),
      }).catch(() => { /* sin red: quedará para el próximo sync */ });
    }, 1200);
  },

  deleteCreation(id) {
    if (!this.isLogged()) return;
    this.api('/sync/creations/' + id, { method: 'DELETE' }).catch(() => {});
  },
};
