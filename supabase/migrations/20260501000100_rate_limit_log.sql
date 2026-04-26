-- Rate limiting via Postgres table (ADR 0008).
-- One row per rate-limited event; a helper function checks the count in a sliding window.

create table if not exists public.rate_limit_log (
  id bigserial primary key,
  key text not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_log_key_created_idx
  on public.rate_limit_log (key, created_at desc);

-- RLS: nobody reads this table directly. Only the helper function (security definer) has access.
alter table public.rate_limit_log enable row level security;
create policy "rate_limit_log_deny_all" on public.rate_limit_log for all using (false);

-- Returns true if the key has exceeded max_count in the last window_seconds.
-- Always inserts a new row for audit, then returns the count.
create or replace function public.check_rate_limit(
  p_key text,
  p_window_seconds int,
  p_max_count int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count int;
begin
  insert into public.rate_limit_log (key) values (p_key);
  select count(*) into current_count
  from public.rate_limit_log
  where key = p_key
    and created_at > now() - make_interval(secs => p_window_seconds);
  return current_count > p_max_count;
end;
$$;

grant execute on function public.check_rate_limit to anon, authenticated;

-- Purge entries older than 24h (cron recommended but optional at this stage).
create or replace function public.purge_rate_limit_log() returns void
language sql
security definer
as $$
  delete from public.rate_limit_log where created_at < now() - interval '24 hours';
$$;

comment on table public.rate_limit_log is 'Sliding-window rate limit log. See ADR 0008.';
comment on function public.check_rate_limit is 'Inserts one row + returns true if the key has exceeded max_count in the last window_seconds.';
