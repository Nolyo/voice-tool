-- user_settings — blob jsonb scalaires sync (ui, hotkeys, features, transcription)
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  schema_version int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by_device text,
  created_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "user_settings_select_own" on public.user_settings
  for select using (auth.uid() = user_id);

create policy "user_settings_insert_own" on public.user_settings
  for insert with check (auth.uid() = user_id);

create policy "user_settings_update_own" on public.user_settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user_settings_delete_own" on public.user_settings
  for delete using (auth.uid() = user_id);

-- Trigger updated_at auto
create or replace function public.tg_user_settings_updated_at()
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

drop trigger if exists user_settings_updated_at on public.user_settings;
create trigger user_settings_updated_at
  before update on public.user_settings
  for each row execute function public.tg_user_settings_updated_at();

comment on table public.user_settings is
  'v3 sync: scalaires syncables (UI, hotkeys, features, transcription). 1 row par user.';
