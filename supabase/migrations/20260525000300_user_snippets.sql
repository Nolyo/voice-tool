-- user_snippets — raccourcis de dictée (snippet trigger → texte à insérer)
create table if not exists public.user_snippets (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 200),
  content text not null check (char_length(content) between 1 and 10000),
  shortcut text check (shortcut is null or char_length(shortcut) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Index "actifs" (non soft-deleted) — queries courantes
create index if not exists user_snippets_user_active_idx
  on public.user_snippets (user_id) where deleted_at is null;

-- Index pull incremental
create index if not exists user_snippets_user_updated_idx
  on public.user_snippets (user_id, updated_at);

alter table public.user_snippets enable row level security;

create policy "user_snippets_select_own" on public.user_snippets
  for select using (auth.uid() = user_id);

create policy "user_snippets_insert_own" on public.user_snippets
  for insert with check (auth.uid() = user_id);

create policy "user_snippets_update_own" on public.user_snippets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user_snippets_delete_own" on public.user_snippets
  for delete using (auth.uid() = user_id);

-- Trigger updated_at auto
create or replace function public.tg_user_snippets_updated_at()
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

drop trigger if exists user_snippets_updated_at on public.user_snippets;
create trigger user_snippets_updated_at
  before update on public.user_snippets
  for each row execute function public.tg_user_snippets_updated_at();

comment on table public.user_snippets is
  'v3 sync: snippets de dictée. UUID client-generated + soft-delete pour LWW par item.';
