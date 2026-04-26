-- Daily cron at 03:00 UTC.
--
-- URL and bearer secret are stored in supabase_vault (NOT GUC settings — on
-- Supabase hosted the `postgres` role cannot ALTER DATABASE for `app.settings.*`).
-- Two vault entries must exist before this cron can fire:
--   - cron_supabase_url    : 'https://<project-ref>.supabase.co'
--   - cron_purge_secret    : the Bearer token shared with the Edge Function
-- These are created out-of-band (see docs/v3/runbooks/account-deletion-purge.md).
--
-- Extensions: pg_cron schedules the job, pg_net performs the HTTP call.
-- pg_net auto-creates its own `net` schema regardless of the `with schema` clause.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

select cron.schedule(
  'purge-account-deletions-daily',
  '0 3 * * *',
  $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'cron_supabase_url')
             || '/functions/v1/purge-account-deletions',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_purge_secret'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $cron$
);
