-- note_shares — public live-share links for notes. One active share per note.
-- Public read is NOT via RLS; it goes through the share-view Edge Function (service role).
create table if not exists public.note_shares (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  note_id uuid not null references public.user_notes(id) on delete cascade,
  title_snapshot text not null default '',
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index if not exists note_shares_one_active_per_note
  on public.note_shares (note_id) where revoked_at is null;

create index if not exists note_shares_user_active_idx
  on public.note_shares (user_id) where revoked_at is null;

create index if not exists note_shares_slug_active_idx
  on public.note_shares (slug) where revoked_at is null;

alter table public.note_shares enable row level security;

create policy "note_shares_select_own" on public.note_shares
  for select using (auth.uid() = user_id);
create policy "note_shares_insert_own" on public.note_shares
  for insert with check (auth.uid() = user_id);
create policy "note_shares_update_own" on public.note_shares
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "note_shares_delete_own" on public.note_shares
  for delete using (auth.uid() = user_id);

comment on table public.note_shares is
  'v3 sharing: public live-share link mapping slug -> user_notes. Content served live via share-view Edge Function.';
