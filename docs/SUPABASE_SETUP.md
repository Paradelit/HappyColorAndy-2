# Conectar Color Memories con Supabase (login Google + progreso en la nube)

Esto te lleva ~15 min. Al final me pasas **2 valores públicos** y yo cableo el
código (login con Google + email, y sincronización del progreso) y lo pruebo.

> Arquitectura final: **Supabase** gestiona cuentas (incl. Google) y guarda el
> progreso; tu **FastAPI** se queda solo para *generar* el cuadro de pintar por
> números. Mis endpoints de cuentas/sync (`accounts.py`) dejan de usarse.

---

## 1) Crea el proyecto
1. Entra en [supabase.com](https://supabase.com) → **New project**.
2. Nombre: `color-memories`. Región: **EU (Frankfurt/Ireland)** (RGPD).
3. Pon una contraseña de base de datos (guárdala) y crea el proyecto.

## 2) Crea las tablas
1. Menú lateral → **SQL Editor** → **New query**.
2. Pega **todo** el contenido de [`supabase/schema.sql`](../supabase/schema.sql) y pulsa **Run**.
3. Debe decir *Success*. (Crea `profiles`, `creations` y la seguridad por usuario.)

## 3) Activa el login con Email y con Google
1. Menú → **Authentication → Providers**.
2. **Email**: ya viene activado. (Opcional: desactiva "Confirm email" para probar
   sin verificar; en producción déjalo activado.)
3. **Google**: ábrelo y actívalo. Te pedirá un **Client ID** y **Client Secret**:
   - Ve a [Google Cloud Console](https://console.cloud.google.com) → crea (o usa)
     un proyecto → **APIs & Services → Credentials → Create credentials →
     OAuth client ID → Web application**.
   - En **Authorized redirect URIs** pega la URL que te muestra Supabase en esa
     misma pantalla (algo como `https://<tu-proyecto>.supabase.co/auth/v1/callback`).
   - Para la **pantalla de consentimiento** de Google usa el nombre *Color
     Memories* y los enlaces de **Privacidad** (`/privacy`) y **Términos** (`/terms`)
     —ya los tenemos.
   - Copia el **Client ID** y **Client Secret** a Supabase y guarda.

## 4) Dile a Supabase a dónde volver tras el login
1. Menú → **Authentication → URL Configuration**.
2. **Site URL**: la URL donde correrá la app (de momento, la de tu despliegue;
   para probar en local, `http://localhost:8000`).
3. **Redirect URLs**: añade tu URL de despliegue y `http://localhost:8000` (y la
   que use tu móvil si pruebas en red local).

## 5) Pásame estos 2 valores (son PÚBLICOS, no secretos)
Menú → **Project Settings → API**:
- **Project URL** → `https://xxxx.supabase.co`
- **anon public key** → `eyJ...` (la clave "anon", NO la "service_role")

> La `anon key` está pensada para ir en el frontend: la seguridad la da el Row
> Level Security del paso 2. **No** me pases la `service_role` (esa sí es secreta).

---

## Qué hago yo cuando me los des
- Cargo el SDK de Supabase y reescribo `js/auth.js` para usar Supabase Auth
  (botón **"Continuar con Google"** + email/contraseña + recuperar contraseña).
- Cambio la sincronización de creaciones para que vaya directa a Supabase (con
  RLS), conservando el resto de la app igual (galería, juego, tutorial, plan…).
- Pruebo el alta por email contra tu proyecto real y dejo el flujo de Google
  listo para que lo verifiques en tu móvil.
- (Opcional) Hago que `/generate` valide el token de Supabase para evitar abuso.

## Coste
Plan **Free** de Supabase: 50.000 usuarios activos/mes, 500 MB de base de datos
y 1 GB de Storage — de sobra para empezar. Sin tarjeta.
