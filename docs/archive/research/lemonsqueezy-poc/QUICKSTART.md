# Quick-start — POC LemonSqueezy (NOL-32)

Valide bout-en-bout : bouton Tauri → checkout LemonSqueezy sandbox → webhook → row `subscriptions` Supabase.

## Prérequis

- Compte LemonSqueezy en mode **Test** (sandbox) avec :
  - un **Store** test
  - un **Product** + **Variant** (ex. abonnement mensuel)
  - un **Webhook** ciblant l'URL de l'Edge Function, secret partagé
- Projet Supabase **EU (Frankfurt)** — dépend de [NOL-30](/NOL/issues/NOL-30). Pour tester isolément, un projet Supabase local via CLI suffit.
- `supabase` CLI ≥ 1.180
- `ngrok` (ou `cloudflared tunnel`) pour exposer l'Edge Function locale aux webhooks LS sandbox

## 1. Appliquer la migration

```bash
cd docs/research/lemonsqueezy-poc
supabase db push --db-url "$SUPABASE_DB_URL" \
  --include-all \
  --file supabase/migrations/0001_subscriptions.sql
```

Ou, en local :

```bash
supabase start
psql "$SUPABASE_DB_URL" -f supabase/migrations/0001_subscriptions.sql
```

## 2. Déployer l'Edge Function

```bash
supabase functions deploy lemonsqueezy-webhook --no-verify-jwt \
  --project-ref <your-project-ref>
supabase secrets set LEMON_SQUEEZY_WEBHOOK_SECRET=<lemon-webhook-secret> \
  --project-ref <your-project-ref>
```

Pour lancer en local :

```bash
supabase functions serve lemonsqueezy-webhook --no-verify-jwt \
  --env-file .env.local
# Expose via ngrok :
ngrok http 54321
```

Enregistrer l'URL publique (`https://<id>.ngrok.app/functions/v1/lemonsqueezy-webhook`) côté LemonSqueezy → Settings → Webhooks.

## 3. Test unitaire de signature (sans achat réel)

```bash
export LEMON_SQUEEZY_WEBHOOK_SECRET=<shared-secret>
export WEBHOOK_URL=http://localhost:54321/functions/v1/lemonsqueezy-webhook
./tests/sign-fixture.sh tests/fixtures/subscription_created.json
```

Attendu : `HTTP 200 { "ok": true, "event": "subscription_created", ... }` + row visible :

```sql
select user_id, status, plan, provider_subscription_id from subscriptions;
```

Mauvaise signature → `HTTP 401 { "error": "invalid_signature" }`.

## 4. Branchement Tauri (v3)

1. Copier `tauri-snippets/lemonsqueezy_checkout.rs` dans `src-tauri/src/commands/`.
2. Ajouter les crates :
   ```toml
   thiserror = "1"
   url = "2"
   ```
   (`tauri-plugin-opener` est déjà dans `src-tauri/Cargo.toml`).
3. Enregistrer la commande : `.invoke_handler(tauri::generate_handler![open_checkout])`.
4. Copier `frontend-snippets/SubscribeButton.tsx` dans `src/components/`.
5. Exporter la variable :
   ```bash
   export LEMON_SQUEEZY_CHECKOUT_URL=https://<store>.lemonsqueezy.com/buy/<variant-uuid>
   ```

## 5. Test bout-en-bout (achat sandbox)

1. Lancer l'app v3 (`pnpm tauri dev`).
2. Se connecter via OAuth Supabase (cf. NOL-31), noter son `auth.user.id`.
3. Cliquer **S'abonner** → navigateur ouvre le checkout LS.
4. Payer avec la carte test `4242 4242 4242 4242`, code CVC `123`, date `12/34`.
5. LS émet `order_created` puis `subscription_created` → webhook frappé.
6. Vérifier dans Supabase :
   ```sql
   select * from subscriptions where user_id = '<votre-user-id>';
   ```
7. Annuler depuis le portail client LS → `subscription_updated` (status `cancelled`) → row mise à jour.

## Événements LemonSqueezy gérés

| Event | Action côté webhook |
|---|---|
| `order_created` | log uniquement (pas de mutation — la row arrive avec `subscription_created`) |
| `subscription_created` | upsert row `active` / `on_trial` |
| `subscription_updated` | upsert (plan, renews_at, status) |
| `subscription_cancelled` | status → `cancelled` |
| `subscription_resumed` | status → `active` |
| `subscription_expired` | status → `expired` |
| `subscription_paused` | status → `paused` |
| `subscription_unpaused` | status → `active` |
| `subscription_payment_success` | met à jour `renews_at` |
| `subscription_payment_failed` | status → `past_due` (via LS attributes) |
| `subscription_payment_recovered` | status → `active` |

Autres events (`license_key_*`, `affiliate_*`) retournent `{ ignored: true }` sans 4xx.

## Checklist Go/No-Go POC

- [ ] Migration appliquée, `subscriptions` visible avec RLS `select own`
- [ ] Edge Function déployée, secret configuré
- [ ] Signature HMAC vérifiée (fixture OK, signature invalide → 401)
- [ ] Bouton Tauri ouvre bien le checkout LS sandbox
- [ ] Achat test complet → `subscription_created` upsertée correctement
- [ ] Annulation → `subscription_cancelled` met à jour la row
- [ ] `user_id` correctement propagé via `custom_data`

Un `NO` sur l'un de ces points = blocker à signaler sur [NOL-32](/NOL/issues/NOL-32).

## Blockers connus & questions ouvertes

- **`user_id` lors du checkout** : requiert que l'utilisateur soit déjà authentifié Supabase au moment de cliquer. Si le flow v3 autorise un achat avant login, il faudra un mécanisme de réconciliation (rattacher la subscription post-login via `provider_customer_id` + email).
- **Retries webhook** : LS retry 4 fois en cas de non-200. Idempotence garantie par `upsert on conflict provider_subscription_id`.
- **Refund / chargeback** : non couvert par le POC ; décider en v3 si on marque la subscription `expired` immédiatement ou si on attend `subscription_expired`.
- **Multi-seat / team plans** : hors scope POC. Une subscription = un `user_id`.
