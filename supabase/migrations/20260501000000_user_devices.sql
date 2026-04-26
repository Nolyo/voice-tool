-- Note: RLS cross-tenant tests deferred to sub-epic 02 (pgtap setup).
-- For v3.0 we rely on declarative RLS audit + E2E tests (see docs/v3/01-auth-e2e-checklist.md).

-- Tracks every device (browser / OS install) a user has logged in from.
-- Used to power the "devices list" in settings and to detect new devices for email notifications.

create table if not exists public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_fingerprint text not null,
  os_name text,
  os_version text,
  app_version text,
  last_ip_hash text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  label text,
  unique (user_id, device_fingerprint)
);

create index if not exists user_devices_user_id_idx on public.user_devices (user_id);
create index if not exists user_devices_last_seen_idx on public.user_devices (user_id, last_seen_at desc);

alter table public.user_devices enable row level security;

-- RLS: user can SELECT/UPDATE/DELETE their own devices; never anyone else's.
create policy "user_devices_select_own" on public.user_devices
  for select using (auth.uid() = user_id);

create policy "user_devices_insert_own" on public.user_devices
  for insert with check (auth.uid() = user_id);

create policy "user_devices_update_own" on public.user_devices
  for update using (auth.uid() = user_id);

create policy "user_devices_delete_own" on public.user_devices
  for delete using (auth.uid() = user_id);

comment on table public.user_devices is 'Devices (installs) a user has logged in from. Feeds settings device list + new-device email notifications.';
comment on column public.user_devices.device_fingerprint is 'App-generated UUID v4 stored in the OS keyring, stable per install.';
comment on column public.user_devices.last_ip_hash is 'SHA-256 of the IP at last login — used to detect new geo only, never logged raw.';
