// ==========================================
// ⚙️ CONFIG.JS — Configuración pública del cliente
// ==========================================
// Rellena 'supabase' con los 2 valores PÚBLICOS de tu proyecto (Project URL y
// anon key) para activar el login con Google + sincronización en la nube.
// Mientras estén vacíos, la app usa el login propio (email + contraseña).
// Guía: docs/SUPABASE_SETUP.md
window.CM_CONFIG = {
  supabase: {
    url: "https://exnfpzhitmoyscrttfye.supabase.co",
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4bmZwemhpdG1veXNjcnR0ZnllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyODM4MDksImV4cCI6MjA5Njg1OTgwOX0.Q8jj-GTRZV1ffaUomoj59E9_93rMi_tbHbSgQcsq9ps",
  },
};

// Devuelve la config de Supabase si está completa; si no, null (queda desactivado).
window.CM_SUPABASE = function () {
  const s = (window.CM_CONFIG && window.CM_CONFIG.supabase) || {};
  return s.url && s.anonKey ? s : null;
};
