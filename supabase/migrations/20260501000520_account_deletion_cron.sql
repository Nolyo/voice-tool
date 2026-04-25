-- Daily cron at 03:00 UTC. URL and secret are stored as Postgres GUC settings
-- (set out-of-band via `alter database postgres set app.settings.* = ...`).

create extension if not exists pg_cron with schema extensions;

select cron.schedule(
  'purge-account-deletions-daily',
  '0 3 * * *',
  $cron$
    select net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/purge-account-deletions',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $cron$
);
