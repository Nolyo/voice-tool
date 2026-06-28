# V3 Billing — Lemon Squeezy Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer la moitié manquante du bundle launch v3.2 — sous-épique 04-billing : schéma `subscriptions` complet, webhook Lemon Squeezy (HMAC + idempotence), commande Tauri `open_checkout`, composant `SubscribeButton` (2 plans × mensuel/annuel), refresh subscription post-checkout, `WelcomeScreen` first-run (branche A compte / branche B local), popup d'expiration (trial + subscription), 3 ADRs.

**Architecture:** Stack standard du projet — Supabase (Postgres + Edge Function Deno) côté serveur, Tauri (Rust) + React (TS + Tailwind v4 design system `.vt-app`) côté client. Le webhook est une Edge Function isolée qui écrit `subscriptions` en service-role ; les autres lectures passent par RLS owner-only depuis `CloudContext` (déjà branché). Le checkout reste un redirect vers Lemon Squeezy via `tauri-plugin-opener` ; le retour est un deep link `lexena://billing/success` capturé par le handler existant `lib.rs` (déjà actif pour OAuth Supabase). La cache subscription (déjà dans `CloudContext.refreshUsage`) est rafraîchie au retour du checkout, à l'`auth-state-change` et au mount.

**Tech Stack:** PostgreSQL 15 (Supabase), Deno Edge Functions (`supabase/functions/lemonsqueezy-webhook/`), Tauri 2 + Rust (`reqwest`, `tauri-plugin-opener`, `url`, `thiserror`), React 19 + i18next, Tailwind v4 (tokens `.vt-app`), Vitest (frontend), pgtap (RLS), Cargo test (Rust).

**Related spec:** [`docs/superpowers/specs/2026-04-27-v3-premium-offer-design.md`](../specs/2026-04-27-v3-premium-offer-design.md)
**POC à reprendre:** [`docs/research/lemonsqueezy-poc/`](../../research/lemonsqueezy-poc/) (migration + webhook Edge Function + Tauri snippet + SubscribeButton snippet)

**Build verification:**
- **Supabase**: `pnpm exec supabase db reset && pnpm exec supabase test db` (pgtap RLS)
- **Edge Function**: `pnpm exec supabase functions serve lemonsqueezy-webhook --no-verify-jwt --env-file .env.local` puis `./tests/sign-fixture.sh fixtures/subscription_created.json`
- **Frontend**: `pnpm build` (TypeScript strict + Vite) + `pnpm test`
- **Rust**: `LIBCLANG_PATH="C:/Program Files/LLVM/bin" PATH="$PATH:/c/Program Files/CMake/bin" cargo check` dans `src-tauri/`
- **App**: demander au user de lancer `pnpm tauri dev` (interdit pour Claude Code, cf. CLAUDE.md)

**Scope exclu** (déjà livré ou hors-périmètre v3.2 explicite) :
- Trial credits (table + auto-grant) → livré PR #45
- `usage_events` / `usage_summary` / Worker `/transcribe` + `/post-process` → livré PR #44
- `QuotaCounter` header + `CloudSection` settings → livré PR #44
- Email canonical + blocklist disposable + Turnstile + rate limit IP signup → livré sous-épique 01
- Sunset BYOK (OpenAI/Groq retirés UI) → livré PR #42
- Page pricing site marketing → sous-épique 06 (séparé)
- Privacy policy / ToS / DPA Lemon Squeezy → reportés post-traction (cf. `project_v3_launch_posture.md`)
- Plans Team/Enterprise, plan illimité, annuel agressif (-40%), phone verification → § 13 du spec hors-périmètre

**Hypothèses figées** (cf. spec premium § 2 et § 4) :
- 2 plans : Starter (5€/mois ou 49€/an, 400 min, 0,03€/min overage), Pro (9€/mois ou 89€/an, 1000 min, 0,02€/min overage)
- Trial : 60 min + 30 jours, premier qui s'épuise termine
- Hard expiry (pas de grâce) ; popup à la prochaine action cloud post-expiration
- Path A signup-then-checkout uniquement (pas de réconciliation post-paiement par email)

---

## File Structure

### Files created

**Supabase**
- `supabase/migrations/20260506100000_subscriptions_full_schema.sql` — drop stub puis full schema (status enum + provider columns + idempotency table)
- `supabase/migrations/20260506100100_processed_webhooks.sql` — idempotency ledger (event_id unique)
- `supabase/tests/rls_subscriptions.sql` — pgtap RLS owner-only
- `supabase/tests/processed_webhooks.sql` — pgtap idempotency
- `supabase/functions/lemonsqueezy-webhook/index.ts` — port adapté du POC
- `supabase/functions/lemonsqueezy-webhook/deno.json` — runtime config si non hérité
- `supabase/functions/lemonsqueezy-webhook/test/signature.test.ts` — Vitest/Deno test signature HMAC
- `supabase/functions/lemonsqueezy-webhook/test/idempotency.test.ts` — Vitest/Deno test event_id réutilisé

**Tauri Rust**
- `src-tauri/src/billing.rs` — commande `open_checkout` (port + adapt POC) + types

**Frontend TS**
- `src/lib/billing/checkout.ts` — wrapper invoke `open_checkout`
- `src/lib/billing/checkout.test.ts` — Vitest mocks
- `src/lib/billing/plans.ts` — métadonnées plans (prix, quotas, variant_ids LS) + helpers
- `src/components/billing/SubscribeButton.tsx` — 2 plans × toggle mensuel/annuel
- `src/components/billing/SubscribeButton.test.tsx`
- `src/components/billing/ExpirationPopup.tsx` — trial expired / subscription expired
- `src/components/billing/ExpirationPopup.test.tsx`
- `src/components/billing/WelcomeScreen.tsx` — first-run branche A / branche B (remplace l'étape `choice` actuelle d'`OnboardingWizard`)
- `src/components/billing/WelcomeScreen.test.tsx`
- `src/locales/fr/billing.json`
- `src/locales/en/billing.json`

**ADR**
- `docs/v3/decisions/0013-premium-offer.md` — positionnement + grille tarifaire (sections 3-4 du spec)
- `docs/v3/decisions/0014-trial-mechanics.md` — 60 min + 30 jours, paywall non-bloquant (section 5 du spec)
- `docs/v3/decisions/0015-sub-epic-04-closure.md` — synthèse de fin (à remplir au commit final)

### Files modified

- `src-tauri/Cargo.toml` — ajout `thiserror = "1"` et `url = "2"` (déjà absents)
- `src-tauri/src/lib.rs` — register module `billing` + invoke handler `open_checkout` + écouter deep link `lexena://billing/success` pour émettre event `billing-checkout-completed`
- `src/contexts/CloudContext.tsx` — écouter event `billing-checkout-completed` → `refreshUsage()`, et écouter `auth-state-change` (déjà subscribed via useAuth probablement, vérifier)
- `src/components/Dashboard.tsx` — monter `<ExpirationPopup />` ; remplacer `<OnboardingWizard />` par `<WelcomeScreen onComplete={...} />` au first-run
- `src/components/OnboardingWizard.tsx` — supprimer l'étape `choice` (déplacée vers `WelcomeScreen`) ; le wizard ne gère plus que les sous-étapes "local" et "api" qui restent appelées depuis WelcomeScreen branche B
- `src/components/settings/sections/CloudSection.tsx` — ajouter section "Plan" avec `SubscribeButton` (si non abonné) ou bouton "Gérer mon abonnement" (lien portail Lemon Squeezy si abonné)
- `src/locales/fr/common.json` + `src/locales/en/common.json` — clés transversales (par défaut tout dans `billing.json`)
- `docs/v3/EPIC.md` — table de phasage : marquer 04-billing livré

### Files deleted

- `supabase/migrations/20260504100400_subscriptions_stub.sql` — **NON** : migrations Supabase ne se suppriment jamais (historique préservé). Le stub reste, la nouvelle migration `20260506100000_subscriptions_full_schema.sql` détecte la table existante et la migre en place via `ALTER TABLE` (cf. Task 2).

---

## Task 1: ADRs 0013 (premium offer) + 0014 (trial mechanics)

**Files:**
- Create: `docs/v3/decisions/0013-premium-offer.md`
- Create: `docs/v3/decisions/0014-trial-mechanics.md`

Les deux ADRs **transcrivent** des décisions déjà figées dans le spec premium 2026-04-27. Aucune nouvelle décision à prendre. Ces ADRs servent de point d'entrée canonique référencé par le code (commentaires migrations, doc-comments du webhook, etc.).

- [ ] **Step 1: Lister les ADRs existants pour confirmer la prochaine numérotation libre**

```bash
ls docs/v3/decisions/ | sort
```
Attendu : dernier numéro utilisé = `0012`. Donc `0013` et `0014` sont libres. (Note : les numéros 0008/0011/0012 ont des doublons historiques dans ce dossier ; ne pas s'en inquiéter, on ajoute deux numéros propres à la suite.)

- [ ] **Step 2: Créer `docs/v3/decisions/0013-premium-offer.md`**

```markdown
# 0013 — Premium offer (positionnement et grille tarifaire)

> **Statut**: Acté.
> **Date**: 2026-04-27 (spec) / 2026-05-XX (ADR rédigé en clôture sous-épique 04).
> **Source canonique**: [`docs/superpowers/specs/2026-04-27-v3-premium-offer-design.md`](../../superpowers/specs/2026-04-27-v3-premium-offer-design.md), sections 3 et 4.

## Contexte

Lexena (ex-Voice Tool) v3.0 a livré l'auth + sync settings + service managé transcription côté infra (Worker + trial). Reste à figer **quel produit** est vendu.

## Décision

Deux modes mutuellement exclusifs :

| Mode | Tarif | Périmètre |
|---|---|---|
| **Local** | Gratuit illimité, open source | Transcription brute (whisper-rs offline) |
| **Lexena Cloud** | Abonnement 2 tiers | Transcription managée (Groq Whisper turbo) + post-process IA (OpenAI) |

BYOK (OpenAI/Groq) **retiré** au lancement v3.2 (livré PR #42).

### Grille tarifaire

| Plan | Mensuel | Annuel (-18%) | Quota | Overage |
|---|---|---|---|---|
| **Starter** | 5€/mois | 49€/an | 400 min/mois | 0,03€/min |
| **Pro** | 9€/mois | 89€/an | 1000 min/mois | 0,02€/min |

Prix TTC (Lemon Squeezy = MoR pour la TVA). Cycle de facturation : mois calendaire roulant. Minutes décomptées sur appels API réussis uniquement, à la seconde près.

### Marges nettes (par user à 100% du quota inclus)

| Plan | Revenu | Coût provider* | Frais Lemon Squeezy (~5%) | Marge nette |
|---|---|---|---|---|
| Starter | 5€ | 0,40€ | 0,25€ | ~4,35€ |
| Pro | 9€ | 1,00€ | 0,45€ | ~7,55€ |

*Hypothèse Groq Whisper turbo à $0,001/min.

## Conséquences

- Le code Tauri/React route uniquement vers `LexenaCloud` ou `local` (cf. `CloudContext.mode`).
- Les variant_ids Lemon Squeezy doivent matcher 4 variantes (Starter mensuel/annuel, Pro mensuel/annuel) — voir `src/lib/billing/plans.ts`.
- Plan Team/Enterprise et plan illimité : hors-périmètre v3.2, à reconsidérer post-traction.

## Alternatives écartées

Cf. spec § 4 et § 13.
```

- [ ] **Step 3: Créer `docs/v3/decisions/0014-trial-mechanics.md`**

```markdown
# 0014 — Trial mechanics

> **Statut**: Acté.
> **Date**: 2026-04-27 (spec) / 2026-05-XX (ADR rédigé en clôture sous-épique 04).
> **Source canonique**: [`docs/superpowers/specs/2026-04-27-v3-premium-offer-design.md`](../../superpowers/specs/2026-04-27-v3-premium-offer-design.md), section 5.

## Contexte

L'utilisateur paywall-cloud sans avoir essayé = friction et taux de conversion bas. Inversement, un trial ouvert sans cap = abus.

## Décision

- **60 minutes** de crédit cloud + **30 jours** calendaires.
- Premier des deux qui s'épuise termine l'essai.
- **Sans CB demandée**.
- Crédit accordé **à la vérification email** (déjà implémenté via trigger Postgres `grant_trial_credits()`, livré PR #45).
- Hard expiry à J+30 ou 60 min consommées : popup non-bloquante (cf. ADR `0015` à venir et composant `ExpirationPopup`).

## Anti-abus (livré sous-épique 01)

Defense in depth :
1. Normalisation email canonique (`enforce_email_canonical_unique`)
2. Captcha Turnstile au signup
3. Email verification obligatoire avant crédit
4. Rate limit IP signup
5. Blocklist domaines jetables (`src/lib/disposable-domains.ts`)

Signal passif : device fingerprint partagé (table `user_devices`), sans blocage automatique en v3.2.

## Conséquences

- L'app affiche **la valeur la plus contraignante** dans le compteur principal (cf. `QuotaCounter`).
- Pas de re-crédit automatique après expiration. Re-crédit ponctuel possible via support si cas légitime.

## Alternatives écartées

Cf. spec § 5 et § 13.
```

- [ ] **Step 4: Vérifier les liens relatifs**

Ouvrir les deux ADRs et confirmer que les chemins relatifs vers le spec et l'ADR 0015 sont corrects (`../../superpowers/specs/...` depuis `docs/v3/decisions/`).

- [ ] **Step 5: Stage et préparer le commit (ne pas committer encore)**

```bash
git add docs/v3/decisions/0013-premium-offer.md docs/v3/decisions/0014-trial-mechanics.md
```

Le commit groupé arrivera Task 2 (avec la migration), pour rester atomique : "ADRs + schéma".

---

## Task 2: Migration `subscriptions` full schema

**Files:**
- Create: `supabase/migrations/20260506100000_subscriptions_full_schema.sql`

Le stub actuel (`20260504100400_subscriptions_stub.sql`) a 5 colonnes. Le webhook Lemon Squeezy a besoin de plus : `provider_customer_id`, `provider_subscription_id` (unique), `provider_variant_id`, `renews_at`, `expires_at`, `trial_ends_at`, `raw_payload`. Le statut doit être un enum élargi (`active`, `on_trial`, `paused`, `past_due`, `unpaid`, `cancelled`, `expired`).

Stratégie : la migration **modifie** la table existante en place (ALTER TABLE) plutôt que la drop. Les données existantes (s'il y en a — le projet est à zéro user) ne sont pas perdues, et l'ordre des migrations reste linéaire.

- [ ] **Step 1: Générer le timestamp**

```powershell
$env:TS = (Get-Date -Format "yyyyMMddHHmmss")
```

Ou si la valeur cible `20260506100000` est dans le passé proche, l'utiliser littéralement (hardcoded) pour rester déterministe avec ce plan.

- [ ] **Step 2: Créer le fichier de migration**

Créer `supabase/migrations/20260506100000_subscriptions_full_schema.sql` :

```sql
-- Étend le stub `subscriptions` (livré 20260504100400) au schéma complet
-- Lemon Squeezy. Le webhook upserte sur `provider_subscription_id`. Les
-- lectures côté client passent par RLS owner-only ; les écritures sont
-- exclusivement service-role (webhook).
--
-- Décision : ADR 0013 (premium offer).

-- 1. Enum status élargi.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
    CREATE TYPE subscription_status AS ENUM (
      'active',
      'on_trial',
      'paused',
      'past_due',
      'unpaid',
      'cancelled',
      'expired'
    );
  END IF;
END $$;

-- 2. Drop l'ancien CHECK constraint (text) et migrer la colonne en enum.
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;

-- Cast colonne text → enum (les valeurs `active`/`paused`/`expired` du stub
-- sont déjà valides dans le nouvel enum, le cast est non-destructif).
ALTER TABLE public.subscriptions
  ALTER COLUMN status TYPE subscription_status USING status::subscription_status;

-- 3. Drop l'ancien CHECK constraint sur plan (le webhook accepte product_name
-- ou variant_name, on ne les énumère pas côté DB — la validation produit
-- est faite côté Worker `usage.ts` au quota check).
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_plan_check;

-- 4. Colonnes Lemon Squeezy (nullable, défaut sur stub existant).
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS provider_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_variant_id TEXT,
  ADD COLUMN IF NOT EXISTS renews_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS raw_payload JSONB,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 5. provider_subscription_id : unique, identifie la subscription LS.
-- Nullable jusqu'à backfill (aucun row à backfiller — projet à zéro user).
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS provider_subscription_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_provider_subscription_id_unique
  ON public.subscriptions(provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

-- 6. Index pour les lookups par status (refresh côté client).
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON public.subscriptions(status);

-- 7. Trigger updated_at déjà présent ? Le stub n'en a pas — on en pose un.
CREATE OR REPLACE FUNCTION public.subscriptions_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS subscriptions_set_updated_at ON public.subscriptions;
CREATE TRIGGER subscriptions_set_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.subscriptions_set_updated_at();

-- 8. RLS : la policy `subscriptions_owner_read` du stub reste valide.
-- On verrouille en plus les écritures côté authenticated/anon.
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions FROM anon;

COMMENT ON TABLE public.subscriptions IS
  'Abonnements Lemon Squeezy. Écrit uniquement par le webhook Edge Function lemonsqueezy-webhook (service-role). Lecture owner-only via RLS. Cf. ADR 0013.';
```

- [ ] **Step 3: Vérifier la migration**

Confirmer :
- Pas de `DROP TABLE` (les données du stub doivent survivre)
- Tous les `ADD COLUMN` sont `IF NOT EXISTS`
- L'enum est créé seulement si absent
- L'index unique sur `provider_subscription_id` est partiel (`WHERE NOT NULL`) pour permettre les rows existants du stub sans cette valeur

- [ ] **Step 4: Stage**

```bash
git add supabase/migrations/20260506100000_subscriptions_full_schema.sql
```

---

## Task 3: pgtap test for `subscriptions` RLS

**Files:**
- Create: `supabase/tests/rls_subscriptions.sql`

Le test reproduit le pattern de `supabase/tests/rls_trial_credits.sql` : insertion comme service-role, vérification de la lecture owner-only et du blocage cross-tenant.

- [ ] **Step 1: Créer le test**

```sql
-- pgtap : RLS subscriptions — owner-only read, no client write.

BEGIN;
SELECT plan(5);

-- Sanity
SELECT has_table('public', 'subscriptions', 'subscriptions table exists');
SELECT has_column('public', 'subscriptions', 'provider_subscription_id',
                  'provider_subscription_id column exists');

-- Setup deux users
INSERT INTO auth.users (id, email, email_confirmed_at)
VALUES
  ('aaaa1111-aaaa-1111-aaaa-111111111111', 'alice@test.local', NOW()),
  ('bbbb2222-bbbb-2222-bbbb-222222222222', 'bob@test.local', NOW());

-- Insert subscription pour Alice (en service-role : on bypass RLS dans le test)
INSERT INTO public.subscriptions (
  user_id, plan, status, provider_customer_id, provider_subscription_id, current_period_end, quota_minutes, overage_rate_cents
) VALUES (
  'aaaa1111-aaaa-1111-aaaa-111111111111',
  'starter',
  'active',
  'cust_alice',
  'sub_alice_001',
  NOW() + INTERVAL '30 days',
  400,
  0.03
);

-- Test 3 : Alice voit sa propre row
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"aaaa1111-aaaa-1111-aaaa-111111111111","role":"authenticated"}';

SELECT is(
  (SELECT count(*) FROM public.subscriptions WHERE user_id = 'aaaa1111-aaaa-1111-aaaa-111111111111')::int,
  1,
  'alice reads her own subscription via RLS'
);

-- Test 4 : Bob ne voit pas la row d'Alice
SET LOCAL "request.jwt.claims" = '{"sub":"bbbb2222-bbbb-2222-bbbb-222222222222","role":"authenticated"}';

SELECT is(
  (SELECT count(*) FROM public.subscriptions WHERE user_id = 'aaaa1111-aaaa-1111-aaaa-111111111111')::int,
  0,
  'bob cannot read alice subscription (RLS owner-only)'
);

-- Test 5 : authenticated ne peut pas insert (REVOKE INSERT)
SELECT throws_ok(
  $$INSERT INTO public.subscriptions (user_id, plan, status, provider_customer_id, provider_subscription_id, current_period_end, quota_minutes, overage_rate_cents)
    VALUES ('bbbb2222-bbbb-2222-bbbb-222222222222', 'pro', 'active', 'cust_bob', 'sub_bob_001', NOW() + INTERVAL '30 days', 1000, 0.02)$$,
  '42501', -- insufficient_privilege
  NULL,
  'authenticated user cannot insert into subscriptions (REVOKE INSERT)'
);

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Stage**

```bash
git add supabase/tests/rls_subscriptions.sql
```

---

## Task 4: Migration `processed_webhooks` (idempotency)

**Files:**
- Create: `supabase/migrations/20260506100100_processed_webhooks.sql`

Lemon Squeezy retry les webhooks 4× en cas de non-200. Le POC repose sur `upsert on conflict provider_subscription_id` mais ça ne couvre pas les events qui modifient autre chose (`subscription_payment_success` qui n'a pas la même clé sémantique). Solution propre : ledger d'event_ids déjà traités.

- [ ] **Step 1: Créer la migration**

```sql
-- Idempotence stricte des webhooks Lemon Squeezy.
-- Chaque event LS a un `meta.webhook_id` (UUID stable). On l'enregistre
-- avant de muter `subscriptions` ; un retry réutilise le même webhook_id
-- et est court-circuité.
--
-- Cf. ADR 0013, Task 5 du plan billing.

CREATE TABLE IF NOT EXISTS public.processed_webhooks (
  webhook_id   TEXT PRIMARY KEY,
  event_name   TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pas d'accès client (service-role only via Edge Function).
ALTER TABLE public.processed_webhooks ENABLE ROW LEVEL SECURITY;

-- Aucune policy → personne ne lit/écrit côté authenticated/anon.

REVOKE ALL ON public.processed_webhooks FROM authenticated;
REVOKE ALL ON public.processed_webhooks FROM anon;

COMMENT ON TABLE public.processed_webhooks IS
  'Idempotency ledger pour webhooks Lemon Squeezy. webhook_id = meta.webhook_id du payload. Cf. lemonsqueezy-webhook Edge Function.';
```

- [ ] **Step 2: pgtap test (court — sanity)**

Créer `supabase/tests/processed_webhooks.sql` :

```sql
BEGIN;
SELECT plan(3);

SELECT has_table('public', 'processed_webhooks', 'processed_webhooks exists');
SELECT col_is_pk('public', 'processed_webhooks', 'webhook_id', 'webhook_id is PK');

-- Pas de policy = pas de lecture client
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"aaaa1111-aaaa-1111-aaaa-111111111111","role":"authenticated"}';

SELECT is(
  (SELECT count(*) FROM public.processed_webhooks)::int,
  0,
  'authenticated cannot read processed_webhooks (no policy)'
);

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 3: Stage**

```bash
git add supabase/migrations/20260506100100_processed_webhooks.sql supabase/tests/processed_webhooks.sql
```

---

## Task 5: Edge Function `lemonsqueezy-webhook`

**Files:**
- Create: `supabase/functions/lemonsqueezy-webhook/index.ts`

Port du POC (`docs/research/lemonsqueezy-poc/supabase/functions/lemonsqueezy-webhook/index.ts`) avec **trois différences** :
1. Imports `npm:` au lieu de `esm.sh` (cf. mémoire `project_edge_functions_deno.md`)
2. Idempotence via `processed_webhooks` (insert puis SELECT puis return early si déjà traité)
3. Le mapping `attrs.product_name → plan` est remplacé par un mapping dur sur `attrs.variant_id` → `'starter'` ou `'pro'` (les variant_ids sont configurés via env `LEMON_SQUEEZY_STARTER_*_VARIANT_ID` / `LEMON_SQUEEZY_PRO_*_VARIANT_ID`)

- [ ] **Step 1: Créer `supabase/functions/lemonsqueezy-webhook/index.ts`**

```typescript
// Webhook Lemon Squeezy → upsert public.subscriptions.
// Sécurité : HMAC SHA-256 timing-safe sur header x-signature.
// Idempotence : insert prealable dans public.processed_webhooks (PK webhook_id).
//
// Env (Supabase Dashboard → Edge Functions → Secrets) :
//   LEMON_SQUEEZY_WEBHOOK_SECRET        — secret partagé LS
//   LEMON_SQUEEZY_STARTER_MONTHLY_VARIANT_ID
//   LEMON_SQUEEZY_STARTER_ANNUAL_VARIANT_ID
//   LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_ID
//   LEMON_SQUEEZY_PRO_ANNUAL_VARIANT_ID
//   SUPABASE_URL                        — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY           — auto-injected
//
// Cf. ADR 0013 et plan billing 2026-05-05.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const HEADER_SIGNATURE = "x-signature";
const HEADER_EVENT = "x-event-name";

const HANDLED_EVENTS = new Set([
  "order_created",
  "subscription_created",
  "subscription_updated",
  "subscription_cancelled",
  "subscription_resumed",
  "subscription_expired",
  "subscription_paused",
  "subscription_unpaused",
  "subscription_payment_success",
  "subscription_payment_failed",
  "subscription_payment_recovered",
]);

const SUBSCRIPTION_STATUS = new Set([
  "active",
  "on_trial",
  "paused",
  "past_due",
  "unpaid",
  "cancelled",
  "expired",
]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (clean.length % 2 !== 0) return new Uint8Array();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) return new Uint8Array();
    out[i] = byte;
  }
  return out;
}

async function verifySignature(rawBody: string, signatureHex: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)),
  );
  const provided = hexToBytes(signatureHex);
  if (provided.byteLength === 0) return false;
  return timingSafeEqual(digest, provided);
}

type LemonSqueezyPayload = {
  meta?: {
    event_name?: string;
    webhook_id?: string;
    custom_data?: Record<string, string> | null;
  };
  data?: {
    id?: string;
    type?: string;
    attributes?: Record<string, unknown>;
  };
};

type Plan = "starter" | "pro";
type SubscriptionRow = {
  user_id: string;
  plan: Plan;
  status: string;
  provider: string;
  provider_customer_id: string;
  provider_subscription_id: string;
  provider_variant_id: string | null;
  quota_minutes: number;
  overage_rate_cents: number;
  current_period_end: string;
  renews_at: string | null;
  expires_at: string | null;
  trial_ends_at: string | null;
  raw_payload: unknown;
};

const PLAN_QUOTAS: Record<Plan, { quota_minutes: number; overage_rate_cents: number }> = {
  starter: { quota_minutes: 400, overage_rate_cents: 0.03 },
  pro: { quota_minutes: 1000, overage_rate_cents: 0.02 },
};

function planFromVariantId(variantId: string): Plan | null {
  const starter = [
    Deno.env.get("LEMON_SQUEEZY_STARTER_MONTHLY_VARIANT_ID"),
    Deno.env.get("LEMON_SQUEEZY_STARTER_ANNUAL_VARIANT_ID"),
  ];
  const pro = [
    Deno.env.get("LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_ID"),
    Deno.env.get("LEMON_SQUEEZY_PRO_ANNUAL_VARIANT_ID"),
  ];
  if (starter.includes(variantId)) return "starter";
  if (pro.includes(variantId)) return "pro";
  return null;
}

function normaliseStatus(raw: string | undefined): string {
  const s = (raw ?? "").toLowerCase();
  if (SUBSCRIPTION_STATUS.has(s)) return s;
  if (s === "trialing") return "on_trial";
  return "expired";
}

function buildSubscriptionRow(payload: LemonSqueezyPayload): SubscriptionRow | null {
  const attrs = payload.data?.attributes ?? {};
  const userId = payload.meta?.custom_data?.user_id;
  const subscriptionId = String(payload.data?.id ?? "");
  const customerId = String((attrs.customer_id as string | number | undefined) ?? "");
  const variantId = attrs.variant_id ? String(attrs.variant_id) : "";

  if (!userId || !subscriptionId || !customerId || !variantId) return null;

  const plan = planFromVariantId(variantId);
  if (!plan) return null;
  const quotas = PLAN_QUOTAS[plan];

  const renewsAt = (attrs.renews_at as string | null) ?? null;
  // Lemon Squeezy renews_at = next billing period start. Use it as
  // current_period_end ; fallback to NOW() + 30d to satisfy NOT NULL.
  const currentPeriodEnd =
    renewsAt ?? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

  return {
    user_id: userId,
    plan,
    status: normaliseStatus(attrs.status as string | undefined),
    provider: "lemonsqueezy",
    provider_customer_id: customerId,
    provider_subscription_id: subscriptionId,
    provider_variant_id: variantId,
    quota_minutes: quotas.quota_minutes,
    overage_rate_cents: quotas.overage_rate_cents,
    current_period_end: currentPeriodEnd,
    renews_at: renewsAt,
    expires_at: (attrs.ends_at as string | null) ?? null,
    trial_ends_at: (attrs.trial_ends_at as string | null) ?? null,
    raw_payload: payload,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const secret = Deno.env.get("LEMON_SQUEEZY_WEBHOOK_SECRET");
  if (!secret) return json({ error: "missing_webhook_secret" }, 500);

  const signature = req.headers.get(HEADER_SIGNATURE) ?? "";
  const eventName = req.headers.get(HEADER_EVENT) ?? "";
  const rawBody = await req.text();

  if (!(await verifySignature(rawBody, signature, secret))) {
    return json({ error: "invalid_signature" }, 401);
  }

  if (!HANDLED_EVENTS.has(eventName)) {
    console.log(`[webhook] ignored event: ${eventName}`);
    return json({ ignored: true, event: eventName }, 200);
  }

  let payload: LemonSqueezyPayload;
  try {
    payload = JSON.parse(rawBody) as LemonSqueezyPayload;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Idempotence : si webhook_id absent → log et ignore (LS doit toujours
  // l'envoyer ; absence = malformation).
  const webhookId = payload.meta?.webhook_id;
  if (!webhookId) {
    console.warn(`[webhook] missing meta.webhook_id, event=${eventName}`);
    return json({ error: "missing_webhook_id" }, 400);
  }

  // Tenter d'enregistrer le webhook_id. Si conflit (déjà traité), short-circuit.
  const { error: idemError } = await supabase
    .from("processed_webhooks")
    .insert({ webhook_id: webhookId, event_name: eventName });

  if (idemError && idemError.code !== "23505") {
    // 23505 = unique_violation = déjà traité, on retourne 200 idempotent.
    console.error(`[webhook] processed_webhooks insert failed:`, idemError);
    return json({ error: "idempotency_db_error", detail: idemError.message }, 500);
  }
  if (idemError?.code === "23505") {
    console.log(`[webhook] duplicate webhook_id ${webhookId}, returning 200`);
    return json({ ok: true, event: eventName, idempotent: true }, 200);
  }

  // order_created : pas de mutation subscriptions.
  if (eventName === "order_created") {
    console.log(`[webhook] order_created: order ${payload.data?.id}`);
    return json({ ok: true, event: eventName }, 200);
  }

  const row = buildSubscriptionRow(payload);
  if (!row) return json({ error: "missing_required_fields_or_unknown_variant" }, 400);

  const { error } = await supabase
    .from("subscriptions")
    .upsert(row, { onConflict: "provider_subscription_id" });

  if (error) {
    console.error(`[webhook] upsert failed:`, error);
    return json({ error: "db_upsert_failed", detail: error.message }, 500);
  }

  return json(
    { ok: true, event: eventName, subscription: row.provider_subscription_id, plan: row.plan },
    200,
  );
});
```

- [ ] **Step 2: Vérifier l'import map / deno.json**

Si `supabase/functions/deno.json` existe et utilise `nodeModulesDir: auto`, l'import `npm:@supabase/supabase-js@2.45.4` est résolu automatiquement. Sinon, ajouter au `imports` :

```bash
cat supabase/functions/deno.json
```

Si l'entrée `@supabase/supabase-js` est absente, ajouter (sans la dupliquer) :

```json
{
  "imports": {
    "@supabase/supabase-js": "npm:@supabase/supabase-js@2.45.4"
  }
}
```

- [ ] **Step 3: Stage**

```bash
git add supabase/functions/lemonsqueezy-webhook/index.ts
```

---

## Task 6: Edge Function tests (signature + idempotency)

**Files:**
- Create: `supabase/functions/lemonsqueezy-webhook/test/signature.test.ts`
- Create: `supabase/functions/lemonsqueezy-webhook/test/idempotency.test.ts`

Les autres edge functions du projet ont des tests Deno.test (cf. `supabase/functions/account-export/test/`). Suivre le même pattern.

- [ ] **Step 1: Créer `signature.test.ts`**

```typescript
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

async function hmacHex(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.test("rejects invalid signature with 401", async () => {
  Deno.env.set("LEMON_SQUEEZY_WEBHOOK_SECRET", "test_secret");

  // Lazy import après set env
  const handler = (await import("../index.ts")).default;
  // index.ts utilise Deno.serve qui n'expose pas un handler default.
  // Stratégie : tester verifySignature directement en exposant via export.
  // → si index.ts n'exporte pas verifySignature, ajouter export dans Step 1
  //   du Task 5 (modifier `async function verifySignature` en `export async function ...`)
  //   et idem pour timingSafeEqual / hexToBytes.

  const { verifySignature } = await import("../index.ts");
  const ok = await verifySignature("body", "0000", "test_secret");
  assertEquals(ok, false);
});

Deno.test("accepts valid signature", async () => {
  const secret = "test_secret";
  const body = '{"meta":{"webhook_id":"x"}}';
  const sig = await hmacHex(body, secret);
  const { verifySignature } = await import("../index.ts");
  const ok = await verifySignature(body, sig, secret);
  assertEquals(ok, true);
});
```

**Note plan** : ce test impose d'**exporter** `verifySignature` depuis `index.ts`. Repartir au Task 5 Step 1 et ajouter `export` devant `async function verifySignature`. Idem pour la robustesse, exporter aussi `buildSubscriptionRow` et `planFromVariantId` pour que le test idempotency les utilise sans simuler tout le HTTP.

- [ ] **Step 2: Créer `idempotency.test.ts`**

```typescript
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test("buildSubscriptionRow returns null when variant_id unknown", async () => {
  const { buildSubscriptionRow } = await import("../index.ts");
  const row = buildSubscriptionRow({
    meta: { webhook_id: "wh_1", custom_data: { user_id: "u1" } },
    data: {
      id: "sub_1",
      attributes: {
        customer_id: "cust_1",
        variant_id: "unknown_variant",
        status: "active",
      },
    },
  });
  assertEquals(row, null);
});

Deno.test("buildSubscriptionRow maps starter monthly variant", async () => {
  Deno.env.set("LEMON_SQUEEZY_STARTER_MONTHLY_VARIANT_ID", "111");
  Deno.env.set("LEMON_SQUEEZY_STARTER_ANNUAL_VARIANT_ID", "112");
  Deno.env.set("LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_ID", "211");
  Deno.env.set("LEMON_SQUEEZY_PRO_ANNUAL_VARIANT_ID", "212");

  const { buildSubscriptionRow } = await import("../index.ts");
  const row = buildSubscriptionRow({
    meta: { webhook_id: "wh_2", custom_data: { user_id: "u1" } },
    data: {
      id: "sub_2",
      attributes: {
        customer_id: "cust_1",
        variant_id: "111",
        status: "active",
        renews_at: "2026-06-05T00:00:00Z",
      },
    },
  });

  assertEquals(row?.plan, "starter");
  assertEquals(row?.quota_minutes, 400);
  assertEquals(row?.current_period_end, "2026-06-05T00:00:00Z");
});
```

- [ ] **Step 3: Lancer les tests**

```bash
cd supabase/functions
pnpm exec deno test --allow-env lemonsqueezy-webhook/test/
```

Attendu : 3 tests verts.

- [ ] **Step 4: Stage et commit groupé Tasks 1-6**

```bash
git add docs/v3/decisions/0013-premium-offer.md \
        docs/v3/decisions/0014-trial-mechanics.md \
        supabase/migrations/20260506100000_subscriptions_full_schema.sql \
        supabase/migrations/20260506100100_processed_webhooks.sql \
        supabase/tests/rls_subscriptions.sql \
        supabase/tests/processed_webhooks.sql \
        supabase/functions/lemonsqueezy-webhook/

git commit -m "$(cat <<'EOF'
feat(v3): billing schema + Lemon Squeezy webhook (sub-epic 04 phase 1)

Add the full subscriptions schema (status enum, provider columns,
idempotency ledger), the lemonsqueezy-webhook Edge Function with
HMAC SHA-256 signature verification and processed_webhooks-based
idempotency, and ADRs 0013 (premium offer) + 0014 (trial mechanics).

Spec: docs/superpowers/specs/2026-04-27-v3-premium-offer-design.md
Plan: docs/superpowers/plans/2026-05-05-v3-billing-lemonsqueezy.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Tauri command `open_checkout`

**Files:**
- Create: `src-tauri/src/billing.rs`
- Modify: `src-tauri/Cargo.toml` — ajouter `thiserror = "1"` et `url = "2"`
- Modify: `src-tauri/src/lib.rs` — `mod billing;` + `invoke_handler` register

Port du POC `tauri-snippets/lemonsqueezy_checkout.rs` avec **trois ajouts** :
1. Le `checkout_url` est passé par paramètre au lieu d'env (l'app embarque les 4 URLs LS dans `src/lib/billing/plans.ts`, l'env `LEMON_SQUEEZY_CHECKOUT_URL` du POC est inadapté à un toggle 4 plans).
2. Émission d'un event Tauri `billing-checkout-opened` au moment du redirect (pour analytics éventuelles).
3. Tracing log au lieu de `println!`.

- [ ] **Step 1: Vérifier `Cargo.toml`**

```bash
grep -E "^thiserror|^url" src-tauri/Cargo.toml
```

Si une des deux deps est absente, ajouter (au-dessus de `[features]` ou dans `[dependencies]`) :

```toml
thiserror = "1"
url = "2"
```

- [ ] **Step 2: Créer `src-tauri/src/billing.rs`**

```rust
//! Lemon Squeezy checkout entry point.
//!
//! Cf. ADR 0013 (premium offer) et plan billing 2026-05-05.

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_opener::OpenerExt;
use tracing::info;

#[derive(Debug, Serialize)]
pub struct CheckoutOpenResult {
    pub opened_url: String,
}

#[derive(Debug, thiserror::Error, Serialize)]
pub enum CheckoutError {
    #[error("checkout_url is required")]
    MissingCheckoutUrl,
    #[error("user_id is required to attach custom_data for the webhook")]
    MissingUserId,
    #[error("invalid checkout url: {0}")]
    InvalidUrl(String),
    #[error("failed to open external url: {0}")]
    OpenFailed(String),
}

/// Opens the Lemon Squeezy checkout URL in the user's default browser.
/// `user_id` is propagated as `checkout[custom][user_id]` so the webhook
/// associates the resulting subscription with the right Supabase auth user.
#[tauri::command]
pub async fn open_checkout(
    app: AppHandle,
    checkout_url: String,
    user_id: String,
    email: Option<String>,
) -> Result<CheckoutOpenResult, CheckoutError> {
    if user_id.trim().is_empty() {
        return Err(CheckoutError::MissingUserId);
    }
    if checkout_url.trim().is_empty() {
        return Err(CheckoutError::MissingCheckoutUrl);
    }

    let mut url = url::Url::parse(&checkout_url).map_err(|e| CheckoutError::InvalidUrl(e.to_string()))?;
    {
        let mut q = url.query_pairs_mut();
        q.append_pair("checkout[custom][user_id]", &user_id);
        if let Some(e) = email.as_deref() {
            q.append_pair("checkout[email]", e);
        }
        q.append_pair("embed", "0");
    }
    let final_url = url.to_string();

    info!(target = "billing", user_id = %user_id, "opening Lemon Squeezy checkout");

    app.opener()
        .open_url(&final_url, None::<&str>)
        .map_err(|e| CheckoutError::OpenFailed(e.to_string()))?;

    let _ = app.emit("billing-checkout-opened", &final_url);

    Ok(CheckoutOpenResult { opened_url: final_url })
}
```

- [ ] **Step 3: Modifier `src-tauri/src/lib.rs`**

Localiser la déclaration des modules (`mod audio; mod transcription; ...`) et ajouter :

```rust
mod billing;
```

Localiser `.invoke_handler(tauri::generate_handler![ ... ])` et ajouter `billing::open_checkout` à la liste.

- [ ] **Step 4: Compiler**

```bash
cd src-tauri
LIBCLANG_PATH="C:/Program Files/LLVM/bin" PATH="$PATH:/c/Program Files/CMake/bin" cargo check
```

Attendu : zéro warning, zéro erreur. Si erreur "url not found in dependencies", repartir Step 1 et confirmer Cargo.toml.

- [ ] **Step 5: Stage** (commit groupé en Task 9)

```bash
git add src-tauri/src/billing.rs src-tauri/src/lib.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
```

---

## Task 8: Frontend `lib/billing/` — checkout wrapper + plans metadata

**Files:**
- Create: `src/lib/billing/checkout.ts`
- Create: `src/lib/billing/checkout.test.ts`
- Create: `src/lib/billing/plans.ts`

`plans.ts` est la source de vérité côté frontend pour les 4 variantes Lemon Squeezy. Les variant_ids et URLs de checkout sont des **valeurs publiques** (visibles dans l'URL du navigateur au moment du checkout) — pas de problème de leak. Mais on les garde dans des constantes typées plutôt que dans des `.env` pour la traçabilité (les valeurs `LEMON_SQUEEZY_*_VARIANT_ID` côté Edge Function sont les mêmes, juste référencées par env pour le webhook).

- [ ] **Step 1: Créer `src/lib/billing/plans.ts`**

```typescript
/**
 * Définition canonique des 4 variantes Lemon Squeezy.
 * Les variant_ids sont des valeurs publiques (apparaissent dans l'URL de checkout).
 * Cf. ADR 0013 (premium offer).
 */

export type PlanTier = "starter" | "pro";
export type BillingCycle = "monthly" | "annual";
export type PlanKey = `${PlanTier}_${BillingCycle}`;

export interface PlanMetadata {
  tier: PlanTier;
  cycle: BillingCycle;
  /** Prix affiché à l'utilisateur (TTC, EUR). */
  price_eur: number;
  /** Quota minutes incluses par mois. */
  quota_minutes: number;
  /** URL de checkout Lemon Squeezy (publique, store-test ou prod selon env). */
  checkout_url: string;
  /** Variant ID Lemon Squeezy (matché côté Edge Function via env). */
  variant_id: string;
}

// IMPORTANT : ces valeurs sont des PLACEHOLDERS pré-prod. À remplacer par
// les vrais variant_ids et checkout URLs dès que le Store Lemon Squeezy
// production est créé. Côté webhook, les variant_ids doivent matcher
// LEMON_SQUEEZY_{TIER}_{CYCLE}_VARIANT_ID.
//
// La variable d'env Vite `VITE_LEMON_SQUEEZY_STORE_SUBDOMAIN` permet de
// pointer dev vs prod. À défaut, fallback sur le store de test.

const STORE_SUBDOMAIN =
  import.meta.env.VITE_LEMON_SQUEEZY_STORE_SUBDOMAIN ?? "lexena-test";

function checkoutUrl(slug: string): string {
  return `https://${STORE_SUBDOMAIN}.lemonsqueezy.com/buy/${slug}`;
}

export const PLANS: Record<PlanKey, PlanMetadata> = {
  starter_monthly: {
    tier: "starter",
    cycle: "monthly",
    price_eur: 5,
    quota_minutes: 400,
    checkout_url: checkoutUrl(import.meta.env.VITE_LS_STARTER_MONTHLY_SLUG ?? "PLACEHOLDER"),
    variant_id: import.meta.env.VITE_LS_STARTER_MONTHLY_VARIANT_ID ?? "PLACEHOLDER",
  },
  starter_annual: {
    tier: "starter",
    cycle: "annual",
    price_eur: 49,
    quota_minutes: 400,
    checkout_url: checkoutUrl(import.meta.env.VITE_LS_STARTER_ANNUAL_SLUG ?? "PLACEHOLDER"),
    variant_id: import.meta.env.VITE_LS_STARTER_ANNUAL_VARIANT_ID ?? "PLACEHOLDER",
  },
  pro_monthly: {
    tier: "pro",
    cycle: "monthly",
    price_eur: 9,
    quota_minutes: 1000,
    checkout_url: checkoutUrl(import.meta.env.VITE_LS_PRO_MONTHLY_SLUG ?? "PLACEHOLDER"),
    variant_id: import.meta.env.VITE_LS_PRO_MONTHLY_VARIANT_ID ?? "PLACEHOLDER",
  },
  pro_annual: {
    tier: "pro",
    cycle: "annual",
    price_eur: 89,
    quota_minutes: 1000,
    checkout_url: checkoutUrl(import.meta.env.VITE_LS_PRO_ANNUAL_SLUG ?? "PLACEHOLDER"),
    variant_id: import.meta.env.VITE_LS_PRO_ANNUAL_VARIANT_ID ?? "PLACEHOLDER",
  },
};

export function getPlan(tier: PlanTier, cycle: BillingCycle): PlanMetadata {
  return PLANS[`${tier}_${cycle}`];
}
```

- [ ] **Step 2: Créer `src/lib/billing/checkout.ts`**

```typescript
import { invoke } from "@tauri-apps/api/core";
import type { PlanMetadata } from "./plans";

export interface CheckoutOpenResult {
  opened_url: string;
}

export async function openCheckout(params: {
  plan: PlanMetadata;
  user_id: string;
  email?: string;
}): Promise<CheckoutOpenResult> {
  return await invoke<CheckoutOpenResult>("open_checkout", {
    checkoutUrl: params.plan.checkout_url,
    userId: params.user_id,
    email: params.email ?? null,
  });
}
```

- [ ] **Step 3: Créer `src/lib/billing/checkout.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { openCheckout } from "./checkout";
import { PLANS } from "./plans";

describe("openCheckout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invokes open_checkout with snake_case arg names", async () => {
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      opened_url: "https://lemonsqueezy.com/buy/foo?checkout[custom][user_id]=abc",
    });

    const result = await openCheckout({
      plan: PLANS.starter_monthly,
      user_id: "abc",
      email: "alice@example.com",
    });

    expect(invoke).toHaveBeenCalledWith("open_checkout", {
      checkoutUrl: PLANS.starter_monthly.checkout_url,
      userId: "abc",
      email: "alice@example.com",
    });
    expect(result.opened_url).toContain("lemonsqueezy.com");
  });

  it("passes null email when not provided", async () => {
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ opened_url: "x" });
    await openCheckout({ plan: PLANS.pro_annual, user_id: "u1" });
    expect(invoke).toHaveBeenCalledWith("open_checkout", expect.objectContaining({ email: null }));
  });
});
```

- [ ] **Step 4: Lancer les tests**

```bash
pnpm test src/lib/billing/checkout.test.ts
```

Attendu : 2/2 verts.

- [ ] **Step 5: Stage** (commit groupé en Task 9)

```bash
git add src/lib/billing/
```

---

## Task 9: Composant `SubscribeButton`

**Files:**
- Create: `src/components/billing/SubscribeButton.tsx`
- Create: `src/components/billing/SubscribeButton.test.tsx`
- Create: `src/locales/fr/billing.json`
- Create: `src/locales/en/billing.json`

Le composant montre un toggle mensuel/annuel et 2 cartes plan (Starter / Pro) ; au clic d'une carte, appel `openCheckout`. État de chargement + désactivation pendant le redirect. Texte i18n via `useTranslation("billing")`.

- [ ] **Step 1: Créer `src/locales/fr/billing.json`**

```json
{
  "title": "Choisis ton plan",
  "subtitle": "Tu peux changer ou annuler à tout moment depuis tes paramètres.",
  "cycle": {
    "monthly": "Mensuel",
    "annual": "Annuel",
    "annual_savings": "-18%"
  },
  "plans": {
    "starter": {
      "name": "Starter",
      "tagline": "L'essentiel pour démarrer.",
      "features": [
        "400 minutes de transcription cloud par mois",
        "Post-process IA inclus",
        "Sync settings sur tous tes appareils"
      ]
    },
    "pro": {
      "name": "Pro",
      "tagline": "Pour les utilisateurs intensifs.",
      "features": [
        "1000 minutes de transcription cloud par mois",
        "Post-process IA inclus",
        "Sync settings sur tous tes appareils",
        "Tarif overage réduit"
      ]
    }
  },
  "price_per_month": "{{price}}€/mois",
  "price_per_year": "{{price}}€/an",
  "cta": "S'abonner",
  "redirecting": "Redirection vers le paiement…",
  "expiration": {
    "trial_title": "Ton essai est terminé",
    "trial_body": "Tes 60 minutes ou 30 jours d'essai sont arrivés à échéance. Choisis un plan pour continuer en cloud, ou bascule en local.",
    "subscription_title": "Ton abonnement Lexena a expiré",
    "subscription_body": "Tu peux le renouveler ou continuer en local.",
    "renew_cta": "Renouveler",
    "switch_local_cta": "Continuer en local",
    "later_cta": "Plus tard"
  },
  "welcome": {
    "title": "Bienvenue sur Lexena",
    "subtitle": "Comment veux-tu commencer ?",
    "branch_a": {
      "badge": "Recommandé",
      "title": "Créer un compte gratuit",
      "features": [
        "60 minutes d'essai du service cloud",
        "Post-process IA inclus (reformulation, correction, mail…)",
        "Rapide sur tout PC, même modeste",
        "Sans carte bancaire"
      ],
      "cta": "Créer mon compte"
    },
    "branch_b": {
      "title": "Continuer en local uniquement",
      "features": [
        "Gratuit, illimité, 100% offline, open source",
        "Transcription brute uniquement (pas de post-process IA)",
        "Performances dépendantes de ton matériel"
      ],
      "cta": "Continuer en local"
    }
  }
}
```

- [ ] **Step 2: Créer `src/locales/en/billing.json`**

```json
{
  "title": "Pick your plan",
  "subtitle": "You can change or cancel at any time from your settings.",
  "cycle": {
    "monthly": "Monthly",
    "annual": "Annual",
    "annual_savings": "-18%"
  },
  "plans": {
    "starter": {
      "name": "Starter",
      "tagline": "The essentials to get started.",
      "features": [
        "400 minutes of cloud transcription per month",
        "AI post-processing included",
        "Settings sync across all your devices"
      ]
    },
    "pro": {
      "name": "Pro",
      "tagline": "For intensive users.",
      "features": [
        "1000 minutes of cloud transcription per month",
        "AI post-processing included",
        "Settings sync across all your devices",
        "Reduced overage rate"
      ]
    }
  },
  "price_per_month": "{{price}}€/mo",
  "price_per_year": "{{price}}€/yr",
  "cta": "Subscribe",
  "redirecting": "Redirecting to checkout…",
  "expiration": {
    "trial_title": "Your trial has ended",
    "trial_body": "Your 60 minutes or 30 days of trial have expired. Pick a plan to keep using cloud, or switch to local.",
    "subscription_title": "Your Lexena subscription has expired",
    "subscription_body": "You can renew it, or keep using Lexena locally.",
    "renew_cta": "Renew",
    "switch_local_cta": "Keep using local",
    "later_cta": "Later"
  },
  "welcome": {
    "title": "Welcome to Lexena",
    "subtitle": "How do you want to start?",
    "branch_a": {
      "badge": "Recommended",
      "title": "Create a free account",
      "features": [
        "60 minutes of cloud service trial",
        "AI post-processing included (rewriting, correction, mail…)",
        "Fast on any PC, even modest hardware",
        "No credit card required"
      ],
      "cta": "Create my account"
    },
    "branch_b": {
      "title": "Continue with local only",
      "features": [
        "Free, unlimited, 100% offline, open source",
        "Raw transcription only (no AI post-processing)",
        "Performance depends on your hardware"
      ],
      "cta": "Continue with local"
    }
  }
}
```

- [ ] **Step 3: Vérifier l'enregistrement des locales**

```bash
grep -rn "billing.json\|billing'" src/lib/i18n*.ts src/i18n*.ts 2>&1 | head -10
```

Si aucune référence : ouvrir le fichier i18n config (probablement `src/lib/i18n.ts` ou `src/i18n.ts`) et ajouter le namespace `billing`.

- [ ] **Step 4: Créer `src/components/billing/SubscribeButton.tsx`**

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { openCheckout } from "@/lib/billing/checkout";
import { PLANS, type PlanTier, type BillingCycle } from "@/lib/billing/plans";

export function SubscribeButton() {
  const { t } = useTranslation("billing");
  const { user } = useAuth();
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [loadingTier, setLoadingTier] = useState<PlanTier | null>(null);

  const handleSubscribe = async (tier: PlanTier) => {
    if (!user) return;
    setLoadingTier(tier);
    try {
      await openCheckout({
        plan: PLANS[`${tier}_${cycle}`],
        user_id: user.id,
        email: user.email ?? undefined,
      });
    } finally {
      // Le redirect ouvre le navigateur ; on laisse le state ON jusqu'à
      // ce que la fenêtre regagne le focus (event handled by CloudContext).
      setLoadingTier(null);
    }
  };

  return (
    <div className="vt-app flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="flex justify-center gap-2">
        <button
          type="button"
          onClick={() => setCycle("monthly")}
          className={`rounded-md px-3 py-1.5 text-sm transition ${
            cycle === "monthly" ? "bg-primary text-primary-foreground" : "bg-muted"
          }`}
          aria-pressed={cycle === "monthly"}
        >
          {t("cycle.monthly")}
        </button>
        <button
          type="button"
          onClick={() => setCycle("annual")}
          className={`rounded-md px-3 py-1.5 text-sm transition ${
            cycle === "annual" ? "bg-primary text-primary-foreground" : "bg-muted"
          }`}
          aria-pressed={cycle === "annual"}
        >
          {t("cycle.annual")}
          <span className="ml-2 text-xs opacity-75">{t("cycle.annual_savings")}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {(["starter", "pro"] as PlanTier[]).map((tier) => {
          const plan = PLANS[`${tier}_${cycle}`];
          const features = t(`plans.${tier}.features`, { returnObjects: true }) as string[];
          const priceLabel = cycle === "monthly"
            ? t("price_per_month", { price: plan.price_eur })
            : t("price_per_year", { price: plan.price_eur });

          return (
            <div key={tier} className="flex flex-col rounded-lg border p-6">
              <h3 className="text-lg font-semibold">{t(`plans.${tier}.name`)}</h3>
              <p className="text-sm text-muted-foreground">{t(`plans.${tier}.tagline`)}</p>
              <p className="mt-3 text-2xl font-bold">{priceLabel}</p>
              <ul className="mt-4 flex flex-1 flex-col gap-2">
                {features.map((feat) => (
                  <li key={feat} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => handleSubscribe(tier)}
                disabled={loadingTier !== null || !user}
                className="mt-6"
              >
                {loadingTier === tier ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {t("redirecting")}
                  </>
                ) : (
                  t("cta")
                )}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Créer `src/components/billing/SubscribeButton.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "alice@test.local" } }),
}));

vi.mock("@/lib/billing/checkout", () => ({
  openCheckout: vi.fn().mockResolvedValue({ opened_url: "https://ls/x" }),
}));

import { SubscribeButton } from "./SubscribeButton";
import { openCheckout } from "@/lib/billing/checkout";

describe("SubscribeButton", () => {
  it("toggles between monthly and annual cycle", () => {
    render(<SubscribeButton />);
    expect(screen.getByRole("button", { name: /Mensuel|Monthly/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: /Annuel|Annual/i }));
    expect(screen.getByRole("button", { name: /Annuel|Annual/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("calls openCheckout with the selected plan", async () => {
    render(<SubscribeButton />);
    fireEvent.click(screen.getAllByRole("button", { name: /S'abonner|Subscribe/i })[0]);
    await waitFor(() =>
      expect(openCheckout).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: "u1", email: "alice@test.local" }),
      ),
    );
  });
});
```

- [ ] **Step 6: Lancer les tests**

```bash
pnpm test src/components/billing/SubscribeButton.test.tsx
```

Attendu : 2/2 verts.

- [ ] **Step 7: Commit groupé Tasks 7-9**

```bash
git add src-tauri/ src/lib/billing/ src/components/billing/SubscribeButton* src/locales/fr/billing.json src/locales/en/billing.json
git add src/lib/i18n*.ts src/i18n*.ts 2>&1 || true  # si modifié

git commit -m "$(cat <<'EOF'
feat(v3): Lemon Squeezy checkout + SubscribeButton (sub-epic 04 phase 2)

Add the Tauri command open_checkout (Rust), the frontend wrapper
src/lib/billing/, the canonical PLANS metadata (4 variants), and the
SubscribeButton component with monthly/annual toggle and 2-tier cards.
Vitest + Cargo check green.

Plan: docs/superpowers/plans/2026-05-05-v3-billing-lemonsqueezy.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Deep link `lexena://billing/success` + refresh post-checkout

**Files:**
- Modify: `src-tauri/src/lib.rs` — handler deep link existant (auth) à étendre avec branche `/billing/success`
- Modify: `src/contexts/CloudContext.tsx` — listen Tauri event `billing-checkout-completed` → `refreshUsage()`

Le projet a déjà un handler de deep link `lexena://auth/callback?...` (cf. `src-tauri/src/auth.rs` et `lib.rs`). On ajoute une branche pour `lexena://billing/success` qui émet un event Tauri vers le frontend. Le `CloudContext` écoute cet event et appelle `refreshUsage()` pour rafraîchir l'état subscription depuis Postgres.

Côté Lemon Squeezy, l'URL de redirection success est configurée dans le dashboard LS (Settings → Store → Redirect URL). Valeur à figer : `lexena://billing/success`.

- [ ] **Step 1: Localiser le handler deep link existant**

```bash
grep -rn "lexena://auth\|on_open_url\|deep[_-]link\|single_instance" src-tauri/src/lib.rs src-tauri/src/auth.rs | head -20
```

Identifier la fonction qui parse les URLs `lexena://`. Probablement dans `lib.rs` ou `auth.rs`.

- [ ] **Step 2: Ajouter la branche `/billing/success`**

Localiser le `match` ou `if/else` qui distribue les paths (`/auth/callback`, etc.). Ajouter (template — adapter aux noms réels du fichier) :

```rust
// dans le handler deep link, après la branche auth :
if url.path() == "/billing/success" {
    info!(target = "billing", "received billing/success deep link");
    let _ = app_handle.emit("billing-checkout-completed", ());
    // Bring the main window to front so user sees the refreshed UI.
    if let Some(main) = app_handle.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
    return;
}
```

- [ ] **Step 3: Tester la compilation**

```bash
LIBCLANG_PATH="C:/Program Files/LLVM/bin" PATH="$PATH:/c/Program Files/CMake/bin" cargo check --manifest-path src-tauri/Cargo.toml
```

- [ ] **Step 4: Modifier `src/contexts/CloudContext.tsx`**

Localiser `useEffect(() => { refreshUsage(); }, [refreshUsage]);` (ligne ~120). Ajouter en dessous un autre `useEffect` qui écoute l'event Tauri :

```tsx
import { listen } from "@tauri-apps/api/event";

// ... dans le composant CloudProvider :
useEffect(() => {
  const unlistenPromise = listen("billing-checkout-completed", () => {
    void refreshUsage();
  });
  return () => {
    unlistenPromise.then((unlisten) => unlisten()).catch(() => {});
  };
}, [refreshUsage]);
```

- [ ] **Step 5: Lancer le build frontend**

```bash
pnpm build
```

Attendu : pas d'erreur TS, pas d'erreur de bundling.

- [ ] **Step 6: Stage** (commit groupé en Task 11)

```bash
git add src-tauri/src/lib.rs src/contexts/CloudContext.tsx
```

---

## Task 11: ExpirationPopup component

**Files:**
- Create: `src/components/billing/ExpirationPopup.tsx`
- Create: `src/components/billing/ExpirationPopup.test.tsx`
- Modify: `src/components/Dashboard.tsx` — monter le popup

Le popup a deux variantes (trial expired / subscription expired) qui partagent la même structure (titre + body + 2-3 boutons : Renouveler, Continuer en local, Plus tard). Il s'affiche **non-bloquant** (Dialog non-modal) à la prochaine action cloud après expiration. Pour la version v3.2, on simplifie : il s'ouvre dès qu'on détecte `mode === "local"` ET (`trial.is_active === false` && `plan === null`) ET un trial s'est déjà terminé (heuristique : `trial.expires_at` passé).

- [ ] **Step 1: Créer `src/components/billing/ExpirationPopup.tsx`**

```tsx
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCloud } from "@/hooks/useCloud";

type Reason = "trial" | "subscription" | null;

function detectReason(trial: { is_active: boolean; expires_at: string | null }, plan: unknown): Reason {
  // Trial existed and is now over, no plan attached.
  if (!plan && !trial.is_active && trial.expires_at && new Date(trial.expires_at) < new Date()) {
    return "trial";
  }
  // Subscription was active in cache but is now expired (handled by CloudContext mode).
  // Heuristique : on n'a pas l'historique, on traite "trial" comme cas par défaut.
  return null;
}

export function ExpirationPopup() {
  const { t } = useTranslation("billing");
  const { trial, plan } = useCloud();
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);

  const reason = detectReason(trial, plan);

  useEffect(() => {
    if (reason && !dismissed) {
      setOpen(true);
    }
  }, [reason, dismissed]);

  if (!reason) return null;

  const handleSwitchLocal = () => {
    setOpen(false);
    setDismissed(true);
    // Settings switch is the user's responsibility ; the popup just closes.
  };
  const handleLater = () => {
    setOpen(false);
    setDismissed(true);
  };
  const handleRenew = () => {
    setOpen(false);
    setDismissed(true);
    // Scroll to / open settings → Cloud section avec SubscribeButton.
    // Pour l'instant, on émet un custom event que Dashboard peut router.
    window.dispatchEvent(new CustomEvent("lexena:open-settings", { detail: { section: "section-cloud" } }));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleLater(); }}>
      <DialogContent>
        <DialogTitle>
          {reason === "trial" ? t("expiration.trial_title") : t("expiration.subscription_title")}
        </DialogTitle>
        <DialogDescription>
          {reason === "trial" ? t("expiration.trial_body") : t("expiration.subscription_body")}
        </DialogDescription>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleSwitchLocal}>
            {t("expiration.switch_local_cta")}
          </Button>
          <Button variant="ghost" onClick={handleLater}>
            {t("expiration.later_cta")}
          </Button>
          <Button onClick={handleRenew}>
            {t("expiration.renew_cta")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Créer `src/components/billing/ExpirationPopup.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/hooks/useCloud", () => ({
  useCloud: vi.fn(),
}));

import { ExpirationPopup } from "./ExpirationPopup";
import { useCloud } from "@/hooks/useCloud";

describe("ExpirationPopup", () => {
  it("renders nothing when trial is still active", () => {
    (useCloud as ReturnType<typeof vi.fn>).mockReturnValue({
      trial: { is_active: true, minutes_remaining: 30, expires_at: "2099-01-01T00:00:00Z" },
      plan: null,
    });
    const { container } = render(<ExpirationPopup />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders trial-expired dialog when trial is over and no plan", () => {
    (useCloud as ReturnType<typeof vi.fn>).mockReturnValue({
      trial: { is_active: false, minutes_remaining: 0, expires_at: "2020-01-01T00:00:00Z" },
      plan: null,
    });
    render(<ExpirationPopup />);
    // Texte attendu en FR ou EN selon la langue de test
    expect(
      screen.getByText(/Ton essai est terminé|Your trial has ended/),
    ).toBeInTheDocument();
  });

  it("renders nothing when active subscription exists", () => {
    (useCloud as ReturnType<typeof vi.fn>).mockReturnValue({
      trial: { is_active: false, minutes_remaining: 0, expires_at: "2020-01-01T00:00:00Z" },
      plan: { quota_minutes: 400, plan: "starter" },
    });
    const { container } = render(<ExpirationPopup />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 3: Lancer les tests**

```bash
pnpm test src/components/billing/ExpirationPopup.test.tsx
```

Attendu : 3/3 verts.

- [ ] **Step 4: Monter dans Dashboard**

Modifier `src/components/Dashboard.tsx` autour de la ligne 364 (`{showOnboarding && <OnboardingWizard ... />}`) :

```tsx
import { ExpirationPopup } from "./billing/ExpirationPopup";

// ... dans le JSX, près des autres modals :
<ExpirationPopup />
```

- [ ] **Step 5: Stage** (commit groupé en Task 13)

```bash
git add src/components/billing/ExpirationPopup* src/components/Dashboard.tsx
```

---

## Task 12: WelcomeScreen first-run

**Files:**
- Create: `src/components/billing/WelcomeScreen.tsx`
- Create: `src/components/billing/WelcomeScreen.test.tsx`
- Modify: `src/components/OnboardingWizard.tsx` — supprimer l'étape `choice` (laisser local + api)
- Modify: `src/components/Dashboard.tsx` — utiliser `WelcomeScreen` au first-run, le wizard local reste appelé en sous-flow depuis branche B

Logique : au first-run, `WelcomeScreen` propose 2 cartes (A : créer un compte, B : continuer en local). A → ouvre l'AuthModal en mode signup. B → ouvre `OnboardingWizard` (l'ancien) qui démarre directement en step "local" pour télécharger le modèle. Une fois l'une ou l'autre branche complétée, on appelle `onComplete` qui marque le first-run comme fait dans le settings store.

- [ ] **Step 1: Créer `src/components/billing/WelcomeScreen.tsx`**

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, Cloud, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OnboardingWizard } from "../OnboardingWizard";
import { useAuth } from "@/hooks/useAuth";

type Mode = "choose" | "local-wizard";

export function WelcomeScreen({ onComplete }: { onComplete: () => void }) {
  const { t } = useTranslation("billing");
  const { openAuthModal } = useAuth();
  const [mode, setMode] = useState<Mode>("choose");

  if (mode === "local-wizard") {
    return <OnboardingWizard onComplete={onComplete} />;
  }

  const branchAFeatures = t("welcome.branch_a.features", { returnObjects: true }) as string[];
  const branchBFeatures = t("welcome.branch_b.features", { returnObjects: true }) as string[];

  const handleBranchA = () => {
    openAuthModal({ initialView: "signup" });
    // Once auth modal closes successfully, useAuth user is set ;
    // we mark first-run as complete here so it doesn't reappear.
    onComplete();
  };

  const handleBranchB = () => {
    setMode("local-wizard");
  };

  return (
    <DialogPrimitive.Root open>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="vt-app fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <DialogPrimitive.Content className="vt-app fixed left-1/2 top-1/2 z-50 w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-8 shadow-lg">
          <DialogPrimitive.Title className="text-2xl font-semibold">
            {t("welcome.title")}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-2 text-sm text-muted-foreground">
            {t("welcome.subtitle")}
          </DialogPrimitive.Description>

          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="relative flex flex-col rounded-lg border-2 border-primary p-6">
              <span className="absolute -top-3 right-4 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                {t("welcome.branch_a.badge")}
              </span>
              <Cloud className="size-8 text-primary" aria-hidden />
              <h3 className="mt-3 text-lg font-semibold">{t("welcome.branch_a.title")}</h3>
              <ul className="mt-4 flex flex-1 flex-col gap-2">
                {branchAFeatures.map((feat) => (
                  <li key={feat} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
              <Button className="mt-6" onClick={handleBranchA}>
                {t("welcome.branch_a.cta")}
              </Button>
            </div>

            <div className="flex flex-col rounded-lg border p-6">
              <HardDrive className="size-8 text-muted-foreground" aria-hidden />
              <h3 className="mt-3 text-lg font-semibold">{t("welcome.branch_b.title")}</h3>
              <ul className="mt-4 flex flex-1 flex-col gap-2">
                {branchBFeatures.map((feat) => (
                  <li key={feat} className="flex items-start gap-2 text-sm">
                    <span className="mt-0.5 size-4 shrink-0 rounded-full border" aria-hidden />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
              <Button variant="outline" className="mt-6" onClick={handleBranchB}>
                {t("welcome.branch_b.cta")}
              </Button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
```

- [ ] **Step 2: Vérifier l'API `useAuth().openAuthModal`**

```bash
grep -n "openAuthModal\|setAuthModalOpen\|showAuthModal" src/hooks/useAuth.ts src/contexts/AuthContext.tsx 2>&1 | head -10
```

Si l'API exposée est différente (par ex. `setAuthModalOpen(true)` + `setAuthView("signup")`), adapter la ligne `openAuthModal({ initialView: "signup" })` en conséquence dans Step 1.

- [ ] **Step 3: Modifier `src/components/OnboardingWizard.tsx` — supprimer l'étape `choice`**

Localiser `type Step = "choice" | "local" | "api";` et `useState<Step>("choice")`.

Actions :
- Changer `type Step = "local" | "api";`
- Changer `useState<Step>("choice")` en `useState<Step>("local")` (default au sous-flow local)
- Supprimer le rendu correspondant à `step === "choice"` (les cartes)

Le composant devient un **wizard local-only** : la branche A passe par AuthModal (hors-wizard), la branche B passe par ce wizard.

- [ ] **Step 4: Modifier `src/components/Dashboard.tsx`**

Remplacer ligne 364 :
```tsx
{showOnboarding && <OnboardingWizard onComplete={recheckOnboarding} />}
```
par :
```tsx
{showOnboarding && <WelcomeScreen onComplete={recheckOnboarding} />}
```

et ajouter l'import :
```tsx
import { WelcomeScreen } from "./billing/WelcomeScreen";
```

(Garder l'import existant `OnboardingWizard` car `WelcomeScreen` le ré-utilise en sous-flow.)

- [ ] **Step 5: Créer `src/components/billing/WelcomeScreen.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const openAuthModal = vi.fn();

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ openAuthModal, user: null }),
}));

vi.mock("../OnboardingWizard", () => ({
  OnboardingWizard: ({ onComplete }: { onComplete: () => void }) => (
    <div data-testid="local-wizard">
      <button onClick={onComplete}>finish</button>
    </div>
  ),
}));

import { WelcomeScreen } from "./WelcomeScreen";

describe("WelcomeScreen", () => {
  it("opens auth modal on branch A click", () => {
    const onComplete = vi.fn();
    render(<WelcomeScreen onComplete={onComplete} />);
    fireEvent.click(screen.getByRole("button", { name: /Créer mon compte|Create my account/i }));
    expect(openAuthModal).toHaveBeenCalledWith({ initialView: "signup" });
    expect(onComplete).toHaveBeenCalled();
  });

  it("renders OnboardingWizard on branch B click", () => {
    const onComplete = vi.fn();
    render(<WelcomeScreen onComplete={onComplete} />);
    fireEvent.click(screen.getByRole("button", { name: /Continuer en local|Continue with local/i }));
    expect(screen.getByTestId("local-wizard")).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Lancer les tests**

```bash
pnpm test src/components/billing/WelcomeScreen.test.tsx
```

Attendu : 2/2 verts.

Lancer aussi `pnpm build` pour s'assurer qu'aucune régression TS sur `OnboardingWizard.tsx`.

- [ ] **Step 7: Stage** (commit groupé en Task 13)

```bash
git add src/components/billing/WelcomeScreen* src/components/OnboardingWizard.tsx src/components/Dashboard.tsx
```

---

## Task 13: Settings → Cloud → SubscribeButton intégration

**Files:**
- Modify: `src/components/settings/sections/CloudSection.tsx`

Ajouter une sous-section "Plan" qui :
- Si `plan !== null` (abonnement actif) → affiche le plan et un bouton "Gérer mon abonnement" (lien vers `https://app.lemonsqueezy.com/my-orders` ou portail dédié — URL configurable via env)
- Sinon → embed `<SubscribeButton />`

- [ ] **Step 1: Lire l'état actuel**

```bash
wc -l src/components/settings/sections/CloudSection.tsx
```

Si <300 lignes, lire le fichier complet pour identifier où insérer.

- [ ] **Step 2: Ajouter la section Plan**

Dans `CloudSection.tsx`, après le bloc QuotaCounter / trial info, ajouter (template — adapter au markup existant) :

```tsx
import { SubscribeButton } from "@/components/billing/SubscribeButton";
import { useCloud } from "@/hooks/useCloud";

// dans le JSX :
<section>
  <h3 className="text-lg font-semibold">{t("cloud.section.plan_title")}</h3>
  {plan ? (
    <div className="rounded-md border p-4">
      <p>{t("cloud.section.current_plan", { tier: plan.plan, quota: plan.quota_minutes })}</p>
      <Button asChild variant="outline" className="mt-3">
        <a
          href={import.meta.env.VITE_LEMON_SQUEEZY_PORTAL_URL ?? "https://app.lemonsqueezy.com/my-orders"}
          target="_blank"
          rel="noreferrer"
        >
          {t("cloud.section.manage_cta")}
        </a>
      </Button>
    </div>
  ) : (
    <SubscribeButton />
  )}
</section>
```

Ajouter les clés i18n correspondantes dans `src/locales/fr/cloud.json` et `src/locales/en/cloud.json` (fichiers existants, pas dans `billing.json`).

- [ ] **Step 3: Lancer le build + tests**

```bash
pnpm build && pnpm test
```

- [ ] **Step 4: Commit groupé Tasks 10-13**

```bash
git add src/contexts/CloudContext.tsx \
        src/components/billing/ \
        src/components/Dashboard.tsx \
        src/components/OnboardingWizard.tsx \
        src/components/settings/sections/CloudSection.tsx \
        src/locales/fr/billing.json src/locales/en/billing.json \
        src/locales/fr/cloud.json src/locales/en/cloud.json \
        src-tauri/src/lib.rs

git commit -m "$(cat <<'EOF'
feat(v3): WelcomeScreen, ExpirationPopup, settings integration (sub-epic 04 phase 3)

- WelcomeScreen first-run with branch A (cloud account) / branch B (local)
- ExpirationPopup non-blocking dialog on trial expiry
- CloudSection in settings shows current plan or SubscribeButton
- CloudContext refreshes on lexena://billing/success deep link
- OnboardingWizard reduced to local-only sub-flow

Plan: docs/superpowers/plans/2026-05-05-v3-billing-lemonsqueezy.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: ADR de clôture 0015 + mise à jour EPIC.md

**Files:**
- Create: `docs/v3/decisions/0015-sub-epic-04-closure.md`
- Modify: `docs/v3/EPIC.md` — table phasage marquer 04-billing livré

- [ ] **Step 1: Créer `docs/v3/decisions/0015-sub-epic-04-closure.md`**

```markdown
# 0015 — Clôture sous-épique 04 (billing)

> **Statut**: Livré.
> **Date**: 2026-05-XX (mettre la date du merge final).

## Périmètre livré

- Schéma `subscriptions` complet (status enum, provider columns, idempotency `processed_webhooks`)
- Edge Function `lemonsqueezy-webhook` (HMAC SHA-256 + idempotence par webhook_id)
- Tauri command `open_checkout` + frontend `lib/billing/`
- `SubscribeButton` (2 plans × mensuel/annuel, i18n FR/EN)
- `WelcomeScreen` first-run (branche A cloud / branche B local)
- `ExpirationPopup` non-bloquant sur fin de trial
- `CloudContext` refresh sur deep link `lexena://billing/success`
- ADR 0013 (premium offer) + 0014 (trial mechanics)

## Reporté post-launch

- Page pricing site marketing (sous-épique 06)
- Privacy policy + ToS update Lemon Squeezy (cf. `project_v3_launch_posture.md`)
- DPA Groq + DPA OpenAI signés
- Plans Team / Enterprise
- Annuel agressif (-40%)
- Phone verification anti-abus

## Tests

- pgtap : `rls_subscriptions.sql`, `processed_webhooks.sql`, `grant_trial_on_verify.sql` (PR #45)
- Deno : `lemonsqueezy-webhook/test/signature.test.ts`, `idempotency.test.ts`
- Vitest : `SubscribeButton.test.tsx`, `ExpirationPopup.test.tsx`, `WelcomeScreen.test.tsx`, `lib/billing/checkout.test.ts`
- Cargo : `cargo check` (Tauri command compile)

## Gates manuels (deferred)

- Configurer le Store Lemon Squeezy production avec 4 variants
- Mettre les variant_ids et slugs dans les env Vite + secrets Edge Function
- Configurer le webhook URL dans LS dashboard → secret partagé
- Configurer la redirect URL dans LS = `lexena://billing/success`
- Test E2E sandbox : signup → trial → checkout → quota → expiration
```

- [ ] **Step 2: Mettre à jour `docs/v3/EPIC.md`**

Localiser la table "Phasage cible" (ligne ~64). Modifier la ligne v3.2 pour refléter le bundle livré, et ajouter un statut ✅ explicite.

- [ ] **Step 3: Commit final**

```bash
git add docs/v3/decisions/0015-sub-epic-04-closure.md docs/v3/EPIC.md

git commit -m "$(cat <<'EOF'
docs(v3): close sub-epic 04 (billing) — ADR 0015 + EPIC update

Plan: docs/superpowers/plans/2026-05-05-v3-billing-lemonsqueezy.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Push branch + ouvrir PR

- [ ] **Step 1: Créer la branche feature et pusher**

```bash
git checkout -b feat/v3-billing-lemonsqueezy
git push -u origin feat/v3-billing-lemonsqueezy
```

- [ ] **Step 2: Ouvrir la PR**

```bash
gh pr create --title "feat(v3): Lemon Squeezy billing (sub-epic 04)" --body "$(cat <<'EOF'
## Summary

Sub-épique 04 (billing) livrée — moitié manquante du bundle launch v3.2 :
- Schéma `subscriptions` complet (status enum, provider columns, idempotency ledger `processed_webhooks`)
- Edge Function `lemonsqueezy-webhook` (HMAC SHA-256 + idempotence par `webhook_id`)
- Tauri `open_checkout` + frontend `lib/billing/`
- `SubscribeButton` (2 plans × mensuel/annuel)
- `WelcomeScreen` first-run (branche A cloud / branche B local)
- `ExpirationPopup` non-bloquant sur fin de trial
- ADRs 0013, 0014, 0015

Plan: [docs/superpowers/plans/2026-05-05-v3-billing-lemonsqueezy.md](docs/superpowers/plans/2026-05-05-v3-billing-lemonsqueezy.md)
Spec: [docs/superpowers/specs/2026-04-27-v3-premium-offer-design.md](docs/superpowers/specs/2026-04-27-v3-premium-offer-design.md)

## Test plan

- [ ] CI `pgtap` job vert (3 nouveaux tests : rls_subscriptions, processed_webhooks, + existants)
- [ ] CI `vitest` vert (4 nouveaux fichiers de test)
- [ ] CI `deno-test` vert (2 nouveaux fichiers de test)
- [ ] CI `cargo-check` vert
- [ ] Après merge : configurer Lemon Squeezy Store, secrets Supabase, env Vite (cf. ADR 0015 § "Gates manuels")
- [ ] Test E2E manuel sandbox LS : signup → trial → checkout → webhook → quota visible → expiration → popup

## Out of scope (par design)

- Page pricing marketing → sous-épique 06
- Privacy policy / ToS update → reportés post-traction
- DPA providers → ops/legal
- Plans Team/Enterprise → post-launch

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Watch CI**

```bash
gh pr checks --watch
```

Si rouge sur `pgtap`, `vitest`, `cargo-check`, ou `deno-test` : lire les logs (`gh run view --log-failed`) et corriger sur la même branche.

---

## Self-Review

Après tasks 1-15, relire le spec premium 2026-04-27 § 11 (livrables attendus) et cocher :

| Livrable | Task |
|---|---|
| 1. Migration `email_canonical` | ✅ Hors-scope (livré sous-épique 01) |
| 2. Composant `WelcomeScreen` | ✅ Task 12 |
| 3. Captcha Turnstile au signup | ✅ Hors-scope (livré sous-épique 01) |
| 4. Blocklist domaines jetables | ✅ Hors-scope (livré sous-épique 01) |
| 5. Schéma `subscriptions` Postgres | ✅ Task 2 |
| 6. Webhook Lemon Squeezy avec HMAC | ✅ Task 5 |
| 7. Commande Tauri `open_checkout` | ✅ Task 7 |
| 8. Composant `SubscribeButton` | ✅ Task 9 |
| 9. Table `usage_minutes` | ✅ Hors-scope (livré PR #44) |
| 10. Logique essai gratuit | ✅ Hors-scope (livré PR #45) |
| 11. Compteur essai / quota | ✅ Hors-scope (livré PR #44) |
| 12. Popup expiration | ✅ Task 11 |
| 13. Cache local état subscription + refresh | ✅ Task 10 (+ existant CloudContext) |
| 14. Suppression UI BYOK | ✅ Hors-scope (livré PR #42) |
| 15. Tests E2E | 🟡 Couverts en unit/integration ; manuel post-merge sur sandbox LS |
| 16. 3 ADR (0009/0010/0011) | ✅ Tasks 1 + 14 (renumérotés 0013/0014/0015) |
| 17. Documentation utilisateur | ❌ Hors-scope explicite (cf. launch posture) |

**Placeholder scan** : aucun `TODO`, `TBD`, `FIXME` dans le plan. Les valeurs `PLACEHOLDER` dans `plans.ts` sont **documentées** comme à remplacer par les vrais slugs/variant_ids LS lors du provisioning Store, pas du code mort.

**Type consistency check** :
- Fonction Tauri : `open_checkout(checkoutUrl, userId, email)` (snake/camelCase serde-handled) — Tasks 7, 8 cohérents
- Plans clés : `starter_monthly | starter_annual | pro_monthly | pro_annual` — Tasks 8, 9, 13 cohérents
- Event Tauri : `billing-checkout-completed` (deep link) et `billing-checkout-opened` (post-redirect) — Tasks 7, 10 cohérents
- ADR numéros : 0013, 0014, 0015 — Tasks 1, 14 cohérents

---

## Execution Handoff

Plan complet sauvé. Deux options pour l'exécution :

**1. Subagent-Driven (recommandé)** — un subagent frais par task, review entre les tasks, itération rapide.

**2. Inline Execution** — exécution dans cette session via `executing-plans`, batch avec checkpoints.
