# Runbook — Account deletion purge

## Vue d'ensemble

Cron Postgres `purge-account-deletions-daily` (03:00 UTC) appelle l'Edge Function `purge-account-deletions`, qui supprime les utilisateurs dont la demande date de plus de 30 jours.

L'URL de l'API et le bearer secret sont stockés dans `supabase_vault` (PAS dans des GUCs `app.settings.*` — sur Supabase hosted le rôle `postgres` ne peut pas faire `alter database … set` pour des paramètres custom). L'Edge Function est déployée avec `verify_jwt = false` (auth interne via `Bearer CRON_SECRET`).

## Vérifier l'état du cron

```sql
select * from cron.job where jobname = 'purge-account-deletions-daily';
select * from cron.job_run_details
  where jobid = (select jobid from cron.job where jobname = 'purge-account-deletions-daily')
  order by start_time desc limit 5;
```

Pour vérifier les secrets vault :
```sql
select name, length(decrypted_secret) from vault.decrypted_secrets
  where name in ('cron_supabase_url', 'cron_purge_secret');
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

4. Si le cron renvoie 401 dans `net._http_response` :
   - Vérifier que les vault secrets `cron_supabase_url` et `cron_purge_secret` existent et sont à jour.
   - Vérifier que la valeur de `cron_purge_secret` correspond exactement à ce qui est côté Functions (`pnpm exec supabase secrets list` liste les noms ; pour la valeur il faut comparer manuellement).
   - Vérifier que la fonction est déployée avec `--no-verify-jwt` (sinon le gateway Supabase rejette avec un 401 JWT avant même d'atteindre le code de la fonction).

## Rollback

- Désactiver le cron : `select cron.unschedule('purge-account-deletions-daily');`
- Supprimer l'Edge Function : `pnpm exec supabase functions delete purge-account-deletions`
- Restaurer le RPC `request_account_deletion` à la version pré-AAL2 (script dans la migration v2 de la version précédente).

## Déploiement initial

1. `pnpm exec supabase db push` — applique les deux nouvelles migrations sur le projet distant. La migration `…520_account_deletion_cron.sql` active `pg_cron` + `pg_net` et planifie le job.
2. `pnpm exec supabase functions deploy purge-account-deletions --no-verify-jwt` — déploie l'Edge Function en mode public-gateway (auth interne via Bearer). Le flag `--no-verify-jwt` est aussi persisté dans `supabase/config.toml` sous `[functions.purge-account-deletions]`.
3. Générer le secret partagé et le déposer côté Functions :
   ```bash
   SECRET=$(openssl rand -hex 32)
   pnpm exec supabase secrets set CRON_SECRET="$SECRET"
   ```
4. Déposer **les mêmes valeurs** côté DB dans `supabase_vault` (pour que pg_cron y accède au moment de l'invocation) :
   ```sql
   -- Studio SQL editor (qui exécute en supabase_admin)
   select vault.create_secret(
     'https://<project-ref>.supabase.co',
     'cron_supabase_url',
     'Supabase project URL for pg_cron purge-account-deletions HTTP call'
   );
   select vault.create_secret(
     '<la même valeur que $SECRET>',
     'cron_purge_secret',
     'Bearer secret for the daily account-deletion purge cron'
   );
   ```
   Si tu dois rotater plus tard, utilise `vault.update_secret(id, new_value, name)`.
5. Vérifier que le job cron est planifié : `select * from cron.job where jobname = 'purge-account-deletions-daily';`
6. Smoke test : `select cron.run('purge-account-deletions-daily');` — puis vérifier dans Supabase Studio → Logs → Edge Functions qu'on voit `event=purge_run, purged=0`.
7. Tag release `v2.x.x` pour livrer le frontend via auto-update.

## Rotation du secret

Pour rotater `CRON_SECRET` :

```bash
NEW=$(openssl rand -hex 32)
pnpm exec supabase secrets set CRON_SECRET="$NEW"
```

Puis dans Studio SQL editor :
```sql
select id from vault.secrets where name = 'cron_purge_secret';
-- copier l'id, puis :
select vault.update_secret('<id>', '<NEW>', 'cron_purge_secret');
```

**Important** : la mise à jour côté Functions et côté vault doit être quasi-simultanée. Sinon le cron suivant entre les deux retournera 401. Fenêtre acceptable car un cron daily à 03:00 UTC ne se déclenche qu'une fois par jour.
