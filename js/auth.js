// ==========================================
// 👤 AUTH.JS — Cuentas + sincronización (Supabase o backend propio)
// ==========================================
// MODO DUAL:
//  - Si hay config de Supabase (js/config.js), usa Supabase Auth (Google +
//    email/contraseña) y guarda perfil/creaciones en Supabase (con RLS).
//  - Si no, usa el backend propio (/auth/*, /sync/*) como hasta ahora.
// El resto de la app no cambia: lee Auth.user = {email, plan, hints, tutorialDone}.

const Auth = {
  _TOKEN: 'andycolor_token',
  _GUEST: 'andycolor_guest',
  user: null,
  uid: null,
  _client: undefined,

  // Cliente de Supabase (o null si no está configurado/cargado).
  client() {
    if (this._client === undefined) {
      const cfg = window.CM_SUPABASE && window.CM_SUPABASE();
      this._client = (cfg && window.supabase && window.supabase.createClient)
        ? window.supabase.createClient(cfg.url, cfg.anonKey)
        : null;
    }
    return this._client;
  },
  usesSupabase() { return !!this.client(); },

  base() {
    const el = document.getElementById('backend-url');
    return el && el.value ? el.value.replace(/\/$/, '') : '';
  },
  token() { return localStorage.getItem(this._TOKEN) || ''; },
  isLogged() { return this.usesSupabase() ? !!this.user : (!!this.token() && !!this.user); },
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

  // ----------------------------- Supabase helpers -----------------------------
  async _loadProfile(sbUser) {
    this.uid = sbUser.id;
    let row = null;
    try {
      const { data } = await this.client()
        .from('profiles').select('plan,hints,tutorial_done').eq('id', sbUser.id).single();
      row = data;
    } catch (e) { /* sin perfil aún */ }
    if (!row) {
      try { await this.client().from('profiles').insert({ id: sbUser.id }); } catch (e) { /* trigger lo crea */ }
      row = { plan: 'free', hints: 3, tutorial_done: false };
    }
    this.user = {
      email: sbUser.email || '',
      plan: row.plan || 'free',
      hints: row.hints == null ? 3 : row.hints,
      tutorialDone: !!row.tutorial_done,
    };
    this.setGuest(false);
    return this.user;
  },

  // ----------------------------- registro / login -----------------------------
  async register(email, password) {
    if (this.usesSupabase()) {
      const { data, error } = await this.client().auth.signUp({ email, password });
      if (error) throw new Error(error.message);
      if (!data.session) throw new Error('Te hemos enviado un email para confirmar tu cuenta. Ábrelo y vuelve a entrar.');
      return this._loadProfile(data.user);
    }
    const d = await this.api('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) });
    localStorage.setItem(this._TOKEN, d.token);
    this.user = d.user; this.setGuest(false);
    return d.user;
  },

  async login(email, password) {
    if (this.usesSupabase()) {
      const { data, error } = await this.client().auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      return this._loadProfile(data.user);
    }
    const d = await this.api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    localStorage.setItem(this._TOKEN, d.token);
    this.user = d.user; this.setGuest(false);
    return d.user;
  },

  // Login con Google (redirige y vuelve; restore() recoge la sesión).
  async loginWithGoogle() {
    if (!this.usesSupabase()) return;
    this.setGuest(false);
    const { error } = await this.client().auth.signInWithOAuth({
      provider: 'google', options: { redirectTo: location.origin + location.pathname },
    });
    if (error) throw new Error(error.message);
  },

  // Recuperación de contraseña (envía email con enlace de vuelta a la app).
  async resetPassword(email) {
    if (!this.usesSupabase()) throw new Error('Disponible cuando actives el login en la nube.');
    const { error } = await this.client().auth.resetPasswordForEmail(email, {
      redirectTo: location.origin + location.pathname,
    });
    if (error) throw new Error(error.message);
  },

  // Fija la nueva contraseña (tras volver del enlace de recuperación).
  async updatePassword(password) {
    if (!this.usesSupabase()) throw new Error('No disponible.');
    const { error } = await this.client().auth.updateUser({ password });
    if (error) throw new Error(error.message);
  },

  // Token de acceso actual (para autorizar /generate en el backend).
  async getAccessToken() {
    if (this.usesSupabase()) {
      try {
        const { data: { session } } = await this.client().auth.getSession();
        return session ? session.access_token : '';
      } catch (e) { return ''; }
    }
    return this.token();
  },

  // Restaura la sesión al abrir la app. Devuelve el user o null.
  async restore() {
    if (this.usesSupabase()) {
      try {
        const { data: { session } } = await this.client().auth.getSession();
        if (!session) return null;
        return await this._loadProfile(session.user);
      } catch (e) { return null; }
    }
    if (!this.token()) return null;
    try {
      const d = await this.api('/auth/me');
      this.user = d.user;
      return d.user;
    } catch (e) {
      if (!(e instanceof TypeError)) localStorage.removeItem(this._TOKEN);
      return null;
    }
  },

  logout() {
    this.user = null; this.uid = null;
    if (this.usesSupabase()) { try { this.client().auth.signOut(); } catch (e) { /* noop */ } return; }
    localStorage.removeItem(this._TOKEN);
  },

  // Actualiza flags (tutorialDone, plan, hints).
  async saveFlags(flags) {
    if (!this.user) return;
    if (this.usesSupabase()) {
      const patch = {};
      if (flags.tutorialDone !== undefined) { patch.tutorial_done = flags.tutorialDone; this.user.tutorialDone = flags.tutorialDone; }
      if (flags.plan !== undefined) { patch.plan = flags.plan; this.user.plan = flags.plan; }
      if (flags.hints !== undefined) { patch.hints = flags.hints; this.user.hints = flags.hints; }
      try { await this.client().from('profiles').update(patch).eq('id', this.uid); } catch (e) { /* reintentará */ }
      return;
    }
    if (!this.isLogged()) return;
    try {
      const d = await this.api('/user/flags', { method: 'POST', body: JSON.stringify(flags) });
      this.user = d.user;
    } catch (e) { /* sin red */ }
  },

  // --------------------------- RGPD: exportar / borrar -------------------------
  async exportData() {
    if (this.usesSupabase()) {
      let creations = [];
      try { const { data } = await this.client().from('creations').select('id,updated_at,progress'); creations = data || []; } catch (e) { /* noop */ }
      return { account: Object.assign({}, this.user), creations };
    }
    return this.api('/user/export');
  },

  async deleteAccount() {
    if (this.usesSupabase()) {
      // borra los datos del usuario (RLS). NOTA: eliminar la cuenta de auth en sí
      // requiere una función admin (service_role) en el servidor; pendiente.
      try { await this.client().from('creations').delete().eq('user_id', this.uid); } catch (e) { /* noop */ }
      try { await this.client().from('profiles').delete().eq('id', this.uid); } catch (e) { /* noop */ }
      try { await this.client().auth.signOut(); } catch (e) { /* noop */ }
      this.user = null; this.uid = null;
      return;
    }
    await this.api('/user/account', { method: 'DELETE' });
  },

  // --------------------------- sincronización de creaciones --------------------
  // Fusiona servidor <-> local: gana la versión con updatedAt más reciente.
  async syncAll() {
    if (!this.user) return;
    if (this.usesSupabase()) {
      try {
        const { data: remote } = await this.client().from('creations').select('id,updated_at,progress,thumb,payload');
        const local = await Creations.list();
        const lmap = new Map(local.map(c => [c.id, c]));
        const rmap = new Map((remote || []).map(c => [c.id, c]));
        for (const r of (remote || [])) {
          const l = lmap.get(r.id);
          if (!l || (r.updated_at || 0) > (l.updatedAt || 0)) {
            try { await Creations.put(JSON.parse(r.payload)); } catch (e) { /* siguiente */ }
          }
        }
        for (const l of local) {
          const r = rmap.get(l.id);
          if (!r || (l.updatedAt || 0) > (r.updated_at || 0)) this.pushCreation(l);
        }
      } catch (e) { /* offline */ }
      return;
    }
    try {
      const remote = (await this.api('/sync/creations')).creations;
      const local = await Creations.list();
      const lmap = new Map(local.map(c => [c.id, c]));
      const rmap = new Map(remote.map(c => [c.id, c]));
      for (const r of remote) {
        const l = lmap.get(r.id);
        if (!l || (r.updatedAt || 0) > (l.updatedAt || 0)) {
          try { const full = await this.api('/sync/creations/' + r.id); await Creations.put(JSON.parse(full.payload)); } catch (e) { /* siguiente */ }
        }
      }
      for (const l of local) {
        const r = rmap.get(l.id);
        if (!r || (l.updatedAt || 0) > (r.updatedAt || 0)) this.pushCreation(l);
      }
    } catch (e) { /* offline */ }
  },

  _pushTimers: {},
  pushCreation(c) {
    if (!c || !this.user) return;
    // La foto ORIGINAL no se sube al servidor (privacidad): solo vive en local.
    const { original, ...c2 } = c;
    c = c2;
    clearTimeout(this._pushTimers[c.id]);
    this._pushTimers[c.id] = setTimeout(() => {
      if (this.usesSupabase()) {
        this.client().from('creations').upsert({
          id: c.id, user_id: this.uid, updated_at: c.updatedAt || Date.now(),
          progress: c.progress || 0, thumb: c.thumb || '', payload: JSON.stringify(c),
        }).then(() => {}, () => {});
      } else {
        this.api('/sync/creations/' + c.id, {
          method: 'PUT',
          body: JSON.stringify({ updatedAt: c.updatedAt || Date.now(), progress: c.progress || 0, thumb: c.thumb || '', payload: JSON.stringify(c) }),
        }).catch(() => {});
      }
    }, 1200);
  },

  deleteCreation(id) {
    if (!this.user) return;
    if (this.usesSupabase()) {
      this.client().from('creations').delete().eq('id', id).eq('user_id', this.uid).then(() => {}, () => {});
      return;
    }
    this.api('/sync/creations/' + id, { method: 'DELETE' }).catch(() => {});
  },
};
