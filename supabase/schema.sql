-- ==========================================================================
-- Color Memories — Esquema de Supabase
-- Pega y ejecuta TODO esto en: Supabase → SQL Editor → New query → Run.
-- Crea el perfil de usuario y la tabla de creaciones, con Row Level Security
-- (cada usuario solo ve/edita SUS datos). Es idempotente: se puede re-ejecutar.
-- ==========================================================================

-- ---------- PERFIL (plan, pistas, tutorial) — 1:1 con auth.users ----------
create table if not exists public.profiles (
  id            uuid primary key references auth.users on delete cascade,
  plan          text    not null default 'free',
  hints         int     not null default 3,
  tutorial_done boolean not null default false,
  created_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "perfil propio - select" on public.profiles;
create policy "perfil propio - select" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "perfil propio - update" on public.profiles;
create policy "perfil propio - update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "perfil propio - insert" on public.profiles;
create policy "perfil propio - insert" on public.profiles
  for insert with check (auth.uid() = id);

-- crea el perfil automáticamente cuando alguien se registra
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- CREACIONES (cuadros + progreso) ----------
create table if not exists public.creations (
  id         text   not null,                 -- id de la creación (cliente)
  user_id    uuid   not null references auth.users on delete cascade,
  updated_at bigint not null default 0,        -- epoch ms (para resolver conflictos)
  progress   int    not null default 0,        -- 0..100
  thumb      text   not null default '',        -- miniatura (dataURI)
  payload    text   not null default '',        -- JSON de la creación (doc + paintedIds…)
  primary key (user_id, id)
);

alter table public.creations enable row level security;

drop policy if exists "creaciones propias" on public.creations;
create policy "creaciones propias" on public.creations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists creations_user_updated_idx
  on public.creations (user_id, updated_at desc);
