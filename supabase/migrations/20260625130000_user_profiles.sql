-- user_profiles — registre des profils utilisateur synchronisés (multi-profil cloud).
-- Spec 2026-06-25. Modèle LWW par item + soft-delete, calqué sur user_folders.
-- Chaque profil local stocke ce `id` (UUID client-generated) dans son sync-meta (cloud_profile_id).
-- Les 5 tables sync portent une FK profile_id -> user_profiles(id).
create table if not exists public.user_profiles (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists user_profiles_user_active_idx
  on public.user_profiles (user_id) where deleted_at is null;

create index if not exists user_profiles_user_updated_idx
  on public.user_profiles (user_id, updated_at);

alter table public.user_profiles enable row level security;

create policy "user_profiles_select_own" on public.user_profiles
  for select using (auth.uid() = user_id);

create policy "user_profiles_insert_own" on public.user_profiles
  for insert with check (auth.uid() = user_id);

create policy "user_profiles_update_own" on public.user_profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user_profiles_delete_own" on public.user_profiles
  for delete using (auth.uid() = user_id);

-- Trigger updated_at auto.
create or replace function public.tg_user_profiles_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_profiles_updated_at on public.user_profiles;
create trigger user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.tg_user_profiles_updated_at();

comment on table public.user_profiles is
  'v3 sync multi-profil: registre des profils. UUID client-generated + LWW + soft-delete.';
