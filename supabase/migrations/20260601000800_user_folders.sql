-- user_folders — dossiers de notes (organisation arbo Lexena).
-- Sub-épique 03 sync-notes. ADR 0016 : tables séparées + LWW par item + soft-delete + purge 30j.
create table if not exists public.user_folders (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  "order" int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Index "actifs" (non soft-deleted) — queries courantes.
create index if not exists user_folders_user_active_idx
  on public.user_folders (user_id) where deleted_at is null;

-- Index pull incremental.
create index if not exists user_folders_user_updated_idx
  on public.user_folders (user_id, updated_at);

alter table public.user_folders enable row level security;

create policy "user_folders_select_own" on public.user_folders
  for select using (auth.uid() = user_id);

create policy "user_folders_insert_own" on public.user_folders
  for insert with check (auth.uid() = user_id);

create policy "user_folders_update_own" on public.user_folders
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user_folders_delete_own" on public.user_folders
  for delete using (auth.uid() = user_id);

-- Trigger updated_at auto.
create or replace function public.tg_user_folders_updated_at()
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

drop trigger if exists user_folders_updated_at on public.user_folders;
create trigger user_folders_updated_at
  before update on public.user_folders
  for each row execute function public.tg_user_folders_updated_at();

comment on table public.user_folders is
  'v3 sync: dossiers de notes. UUID client-generated + soft-delete pour LWW par item.';
