// ==========================================
// ⚙️ CONFIG.JS — Configuración pública del cliente
// ==========================================
// Rellena 'supabase' con los 2 valores PÚBLICOS de tu proyecto (Project URL y
// anon key) para activar el login con Google + sincronización en la nube.
// Mientras estén vacíos, la app usa el login propio (email + contraseña).
// Guía: docs/SUPABASE_SETUP.md
window.CM_CONFIG = {
  supabase: {
    url: "",       // p.ej. "https://xxxxx.supabase.co"
    anonKey: "",   // la clave "anon public" (NO la service_role)
  },
};

// Devuelve la config de Supabase si está completa; si no, null (queda desactivado).
window.CM_SUPABASE = function () {
  const s = (window.CM_CONFIG && window.CM_CONFIG.supabase) || {};
  return s.url && s.anonKey ? s : null;
};
