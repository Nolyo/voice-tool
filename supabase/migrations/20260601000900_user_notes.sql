-- user_notes — notes texte (TipTap HTML brut, organisation par folder optionnel).
-- Sub-épique 03 sync-notes. ADR 0016 : LWW par item, soft-delete, hard cap 1 MB par note.
-- FK folder_id ON DELETE SET NULL : suppression dossier orphelinise les notes (cohérence avec orphan_notes_in_folder côté Rust).
create table if not exists public.user_notes (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '' check (char_length(title) <= 500),
  content_html text not null default '',
  folder_id uuid references public.user_folders(id) on delete set null,
  favorite boolean not null default false,
  "order" int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint user_notes_content_size_check check (octet_length(content_html) <= 1048576)
);

-- Index "actifs" (non soft-deleted) — listing des notes user.
create index if not exists user_notes_user_active_idx
  on public.user_notes (user_id) where deleted_at is null;

-- Index pour le filtrage par folder (vues "dans le dossier X").
create index if not exists user_notes_user_folder_idx
  on public.user_notes (user_id, folder_id) where deleted_at is null;

-- Index pull incremental.
create index if not exists user_notes_user_updated_idx
  on public.user_notes (user_id, updated_at);

alter table public.user_notes enable row level security;

create policy "user_notes_select_own" on public.user_notes
  for select using (auth.uid() = user_id);

create policy "user_notes_insert_own" on public.user_notes
  for insert with check (auth.uid() = user_id);

create policy "user_notes_update_own" on public.user_notes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user_notes_delete_own" on public.user_notes
  for delete using (auth.uid() = user_id);

-- Trigger updated_at auto.
create or replace function public.tg_user_notes_updated_at()
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

drop trigger if exists user_notes_updated_at on public.user_notes;
create trigger user_notes_updated_at
  before update on public.user_notes
  for each row execute function public.tg_user_notes_updated_at();

comment on table public.user_notes is
  'v3 sync: notes texte (TipTap HTML brut). UUID client-generated + LWW + soft-delete + hard cap 1 MB content_html.';
