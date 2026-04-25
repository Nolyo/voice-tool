# Runbook — Account deletion purge

## Vue d'ensemble

Cron Postgres `purge-account-deletions-daily` (03:00 UTC) appelle l'Edge Function `purge-account-deletions`, qui supprime les utilisateurs dont la demande date de plus de 30 jours.

## Vérifier l'état du cron

```sql
select * from cron.job where jobname = 'purge-account-deletions-daily';
select * from cron.job_run_details
  where jobid = (select jobid from cron.job where jobname = 'purge-account-deletions-daily')
  order by start_time desc limit 5;
```

## Lancer manuellement

```sql
select cron.run('purge-account-deletions-daily');
```

Ou directement via curl :

```bash
curl -X POST "$SUPABASE_URL/functions/v1/purge-account-deletions" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json"
```

Réponse attendue : `{ "purged": N, "errors": [], "duration_ms": ... }`.

## Investiguer un échec

1. Logs Edge Function : Supabase Studio → Logs → Edge Functions → `purge-account-deletions`.
2. Cas typique : `auth.admin.deleteUser` retourne une erreur (compte verrouillé Supabase, etc.) → `errors: [{ uid, message }]`.
3. Si la tombstone a déjà été supprimée par le DELETE RETURNING mais `deleteUser` a échoué, l'utilisateur reste orphelin dans `auth.users`. Action manuelle :

```sql
select id from auth.users where id = '<uid>';
-- si présent et confirmé orphelin :
delete from auth.users where id = '<uid>';
```

## Rollback

- Désactiver le cron : `select cron.unschedule('purge-account-deletions-daily');`
- Supprimer l'Edge Function : `pnpm exec supabase functions delete purge-account-deletions`
- Restaurer le RPC `request_account_deletion` à la version pré-AAL2 (script dans la migration v2 de la version précédente).

## Déploiement initial

1. `pnpm exec supabase db push` — applique les deux nouvelles migrations sur le projet distant.
2. `pnpm exec supabase functions deploy purge-account-deletions` — déploie l'Edge Function.
3. `pnpm exec supabase secrets set CRON_SECRET=$(openssl rand -hex 32)` — définit le secret partagé.
4. Dans Supabase Studio SQL editor :
   ```sql
   alter database postgres set app.settings.supabase_url = 'https://<project-ref>.supabase.co';
   alter database postgres set app.settings.cron_secret = '<la même valeur que ci-dessus>';
   ```
5. Vérifier : `select * from cron.job where jobname = 'purge-account-deletions-daily';`
6. Smoke test : `select cron.run('purge-account-deletions-daily');` — vérifier les logs Edge Function.
7. Tag release `v2.x.x` pour livrer le frontend via auto-update.
