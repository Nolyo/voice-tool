-- Demo transcription attempts log (anonymous, pre-signup).
-- Used by the `demo-transcribe` Edge Function to:
--   1) rate-limit per IP (3 successful demos / hour)
--   2) cap per device (2 successful demos lifetime)
--   3) audit failed calls for abuse detection
--
-- ip_hash + device_id_hash are sha256(salt + raw) — see DEMO_HASH_PEPPER env.
-- No PII (raw IP, raw device id, transcription text) is stored.

create table if not exists public.demo_attempts (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  ip_hash text not null,
  device_id_hash text not null,
  duration_seconds numeric(5, 2),
  success boolean not null,
  error_code text,
  text_length int
);

create index if not exists demo_attempts_ip_created_idx
  on public.demo_attempts (ip_hash, created_at desc);

create index if not exists demo_attempts_device_created_idx
  on public.demo_attempts (device_id_hash, created_at desc);

-- Service role bypasses RLS; no other role should be able to query this table.
alter table public.demo_attempts enable row level security;
create policy "demo_attempts_deny_all" on public.demo_attempts for all using (false);

comment on table public.demo_attempts is
  'Anonymous demo transcription attempts. Used for rate-limiting + abuse detection. '
  'See supabase/functions/demo-transcribe/.';

-- Purge rows older than 30 days. Lifetime device quota uses success=true rows so
-- pruning failures is fine; we keep successes 30 days which still bounds
-- reasonable abuse without growing the table indefinitely.
create or replace function public.purge_demo_attempts() returns void
language sql
security definer
as $$
  delete from public.demo_attempts where created_at < now() - interval '30 days';
$$;
