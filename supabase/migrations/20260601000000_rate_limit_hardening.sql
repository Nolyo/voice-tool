-- Hardening of the rate-limit log:
--   1) Revoke check_rate_limit from anon (only authenticated/service_role may call it).
--   2) Schedule a daily purge of rows older than 24h.

revoke execute on function public.check_rate_limit(text, int, int) from anon;
grant execute on function public.check_rate_limit(text, int, int) to authenticated;

-- Schedule daily purge at 03:17 UTC. Idempotent.
do $$
begin
  if not exists (
    select 1 from cron.job where jobname = 'purge-rate-limit-log-daily'
  ) then
    perform cron.schedule(
      'purge-rate-limit-log-daily',
      '17 3 * * *',
      $cron$ select public.purge_rate_limit_log(); $cron$
    );
  end if;
end $$;
