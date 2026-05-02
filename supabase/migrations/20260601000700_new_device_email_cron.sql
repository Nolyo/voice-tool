-- Cron toutes les 5 minutes pour envoyer les emails "nouveau device".
-- Lit les rows public.user_devices où notified_at IS NULL via l'Edge Function send-new-device-email.
--
-- Vault entries requises (créées out-of-band, voir runbook):
--   - cron_supabase_url         : 'https://<project-ref>.supabase.co' (déjà créé pour purge-account-deletions)
--   - cron_new_device_secret    : Bearer token partagé avec l'Edge Function (CRON_SECRET côté function)
--
-- pg_cron + pg_net déjà créées par 20260501000520_account_deletion_cron.sql.

select cron.schedule(
  'send-new-device-email-5min',
  '*/5 * * * *',
  $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'cron_supabase_url')
             || '/functions/v1/send-new-device-email',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_new_device_secret'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $cron$
);
