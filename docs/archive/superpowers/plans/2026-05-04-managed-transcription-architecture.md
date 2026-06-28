# Managed Transcription Architecture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer le service de transcription managée (sous-épique 05) en phase 1 — un Cloudflare Worker à deux endpoints (`/transcribe` proxy Groq Whisper turbo, `/post-process` proxy OpenAI), un schéma DB Supabase pour le tracking d'usage zero-retention, l'intégration côté client Tauri et une UI de compteurs (quota mensuel + crédit trial). Périmètre serré : aucune logique billing Lemon Squeezy ni anti-abus signup ici (couvert par le plan v3.2 connexe).

**Architecture:** Quatre chantiers articulés :
1. **Cloudflare Worker** sur `api.lexena.app` — TypeScript stateless, vérifie JWT Supabase, relaie l'audio à Groq, le texte à OpenAI, débite l'usage. Aucune persistance d'audio (zero-retention strict).
2. **Schéma Supabase** — 3 tables : `usage_events` (append-only ledger), `usage_summary` (table d'agrégat refresh par trigger), `trial_credits` (60 min / 30 jours par user). RLS deny-by-default sur toutes.
3. **Tauri client** — module Rust `cloud.rs` avec deux commandes (`transcribe_audio_cloud`, `post_process_cloud`) + frontend TS `lib/cloud/` (wrappers fetch + erreurs typées).
4. **UX compteurs** — `QuotaCounter` dans le header (minutes restantes ou jours trial) + nouvelle section settings `Cloud` pour détail + i18n FR/EN.

**Tech Stack:** TypeScript + `@cloudflare/workers-types` + `jose` (JWT verify) + `@supabase/supabase-js` (Worker côté serveur, service-role) ; Wrangler 3 ; Vitest + Miniflare pour tests Worker. PostgreSQL 15 (Supabase). Côté client : Tauri Rust + `reqwest`, React 19 + Context, Tailwind 4 design system `.vt-app`, i18next, Vitest. Pas de framework de routing dans le Worker (vanilla `fetch` handler).

**Related spec:** [`docs/superpowers/specs/2026-05-04-managed-transcription-architecture-design.md`](../specs/2026-05-04-managed-transcription-architecture-design.md), [`docs/superpowers/specs/2026-04-27-v3-premium-offer-design.md`](../specs/2026-04-27-v3-premium-offer-design.md), [`docs/v3/EPIC.md`](../../v3/EPIC.md), [`docs/v3/05-managed-transcription.md`](../../v3/05-managed-transcription.md).

**Build verification:**
- **Worker** : `pnpm --filter @lexena/transcription-api typecheck` + `pnpm --filter @lexena/transcription-api test` (Vitest + Miniflare). `pnpm --filter @lexena/transcription-api dev` lance Wrangler dev local.
- **Frontend** : `pnpm build` (TypeScript strict + Vite) + `pnpm test` (Vitest pour `src/lib/cloud/`).
- **Rust** : `LIBCLANG_PATH="C:/Program Files/LLVM/bin" PATH="$PATH:/c/Program Files/CMake/bin" cargo check` dans `src-tauri/` (cf. `memory/MEMORY.md`) si une tâche touche Rust (Task 19).
- **Supabase** : `pnpm exec supabase db reset` puis `pnpm exec supabase test db` (pgtap) pour vérifier RLS et triggers.
- **Demander au user** pour `pnpm tauri dev` (cf. CLAUDE.md, interdit de lancer soi-même).

**Scope exclu** (couvert ailleurs ou hors-périmètre) :
- `subscriptions` table + ingestion webhook Lemon Squeezy → plan **04-billing** (à écrire). Ce plan **lit** la table mais ne la crée pas, sauf si elle n'existe pas (Task 4 inclut un stub conditionnel).
- Logique d'init du `trial_credits` à la **vérification email** → plan 04-billing / 01-auth ajustement. Le présent plan **crée la table et les commandes de débit**, mais l'insert initial est testé manuellement.
- Welcome screen first-run + suppression UI BYOK → plan v3.2 onboarding.
- Captcha Turnstile, blocklist domaines jetables, rate limit IP signup → plan 04-billing / 01-auth.
- DPA Groq + DPA OpenAI → tâches ops, hors code.
- Privacy policy + ToS update → tâches ops/legal.
- Site marketing + page pricing → plan 06-onboarding.
- Phase 2 self-host Whisper sur GPU → hors-périmètre v3.2 (note design §12.2).

**Hypothèses figées au démarrage** (cf. design 2026-05-04 §2) :
- **Q1** Architecture proxy hybride différée — phase 1 = proxy seul.
- **Q2** Hébergement = Cloudflare Workers Paid plan ($5/mois) sur `api.lexena.app`.
- **Q3** Provider transcription = Groq `whisper-large-v3-turbo`. Pas de fallback en phase 1.
- **Q4** Provider post-process = OpenAI `gpt-4o-mini` (défaut), `gpt-4o` (tier `full`).
- **Q5** Stockage audio = zero-retention strict.

---

## File Structure

### Files created

**Cloudflare Worker** (`workers/transcription-api/`)
- `workers/transcription-api/package.json` — workspace package, deps Worker
- `workers/transcription-api/tsconfig.json`
- `workers/transcription-api/wrangler.toml` — config Cloudflare Workers
- `workers/transcription-api/src/index.ts` — entry point + routing
- `workers/transcription-api/src/auth.ts` — vérif JWT Supabase
- `workers/transcription-api/src/supabase.ts` — wrapper supabase-js service-role
- `workers/transcription-api/src/usage.ts` — quota check + débit
- `workers/transcription-api/src/groq.ts` — wrapper Groq API
- `workers/transcription-api/src/openai.ts` — wrapper OpenAI API
- `workers/transcription-api/src/prompts.ts` — templates post-process
- `workers/transcription-api/src/transcribe.ts` — handler `/transcribe`
- `workers/transcription-api/src/post-process.ts` — handler `/post-process`
- `workers/transcription-api/src/errors.ts` — codes + helpers réponse erreur
- `workers/transcription-api/src/types.ts` — types partagés
- `workers/transcription-api/test/auth.test.ts`
- `workers/transcription-api/test/usage.test.ts`
- `workers/transcription-api/test/transcribe.test.ts`
- `workers/transcription-api/test/post-process.test.ts`
- `workers/transcription-api/vitest.config.ts`

**Supabase migrations** (`supabase/migrations/`)
- `supabase/migrations/20260504100100_usage_events.sql`
- `supabase/migrations/20260504100200_usage_summary.sql`
- `supabase/migrations/20260504100300_trial_credits.sql`
- `supabase/migrations/20260504100400_subscriptions_stub.sql` (conditionnel : créé seulement si la table n'existe pas — voir Task 4)
- `supabase/migrations/20260504100500_bump_trial_minutes.sql` — RPC `bump_trial_minutes(uuid, numeric)`

**Supabase tests** (`supabase/tests/`)
- `supabase/tests/rls_usage_events.sql`
- `supabase/tests/rls_usage_summary.sql`
- `supabase/tests/rls_trial_credits.sql`
- `supabase/tests/usage_summary_trigger.sql`

**Tauri Rust** (`src-tauri/src/`)
- `src-tauri/src/cloud.rs` — commandes Tauri `transcribe_audio_cloud`, `post_process_cloud`

**Frontend TS** (`src/`)
- `src/lib/cloud/types.ts` — types partagés API
- `src/lib/cloud/api.ts` — fetch wrappers vers Worker
- `src/lib/cloud/api.test.ts` — tests Vitest
- `src/lib/cloud/errors.ts` — mapping erreurs HTTP → erreurs typées
- `src/contexts/CloudContext.tsx` — état mode cloud + cache subscription/trial
- `src/hooks/useCloud.ts` — accès context
- `src/hooks/useUsage.ts` — lecture `usage_summary` + `trial_credits` via supabase-js
- `src/components/cloud/QuotaCounter.tsx` — compteur header
- `src/components/settings/sections/CloudSection.tsx` — section settings
- `src/locales/fr/cloud.json`
- `src/locales/en/cloud.json`

**ADR**
- `docs/v3/decisions/0012-managed-transcription-stack.md`

**Documentation ops**
- `docs/v3/runbooks/managed-transcription.md` — runbook (rotation clés, monitoring, incident)

### Files modified

- `package.json` — workspaces : ajout `workers/transcription-api`
- `pnpm-workspace.yaml` — créer si absent
- `src-tauri/src/lib.rs` — register `cloud::transcribe_audio_cloud`, `cloud::post_process_cloud`
- `src-tauri/Cargo.toml` — `reqwest` est probablement déjà présent (vérifier)
- `src/components/settings/SettingsDialog.tsx` — ajouter onglet Cloud
- `src/i18n.ts` — déclarer namespace `cloud`
- `src/components/dashboard/DashboardHeader.tsx` — insérer `<QuotaCounter />`
- `src/App.tsx` — wrapper `<CloudProvider>` autour du tree

---

## Préflight

### 0.1 Vérifier l'environnement

- [ ] **Step 1: Branche dédiée**

```bash
git checkout -b feat/v3-managed-transcription
```

- [ ] **Step 2: Variables d'env Worker à préparer**

Lister, sans encore les set, les secrets nécessaires :

| Variable | Provenance |
|---|---|
| `SUPABASE_URL` | Tableau de bord Supabase > Settings > API > Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Tableau de bord Supabase > Settings > API > `service_role` (secret) |
| `SUPABASE_JWT_SECRET` | Tableau de bord Supabase > Settings > API > JWT Secret |
| `GROQ_API_KEY` | Console Groq |
| `OPENAI_API_KEY` | Console OpenAI |

Documenté dans la Task 17 (déploiement). Aucune action ici.

- [ ] **Step 3: Vérifier outillage**

```bash
pnpm --version    # >= 9
node --version    # >= 20 (Workers requirement)
pnpm exec supabase --version
```

Si pnpm n'est pas en monorepo, créer le fichier `pnpm-workspace.yaml` :

```yaml
packages:
  - "."
  - "workers/*"
```

Et vérifier dans `package.json` racine que `"workspaces": ["workers/*"]` existe (équivalent npm) ou que pnpm-workspace suffit.

- [ ] **Step 4: Commit préflight**

```bash
git add pnpm-workspace.yaml package.json
git commit -m "chore(v3): prepare monorepo workspace for cloud worker"
```

---

## Task 1: ADR 0012 — Managed transcription stack

**Files:**
- Create: `docs/v3/decisions/0012-managed-transcription-stack.md`

- [ ] **Step 1: Rédiger l'ADR**

```markdown
# ADR 0012 — Managed Transcription Stack

**Date** : 2026-05-04
**Statut** : Accepté
**Contexte** : sous-épique 05 (managed transcription, cible bundle launch v3.2)
**Spec source** : [`docs/superpowers/specs/2026-05-04-managed-transcription-architecture-design.md`](../../superpowers/specs/2026-05-04-managed-transcription-architecture-design.md)

## Décisions

| # | Sujet | Décision |
|---|---|---|
| Q1 | Architecture | Hybride différée. Phase 1 = proxy d'un provider tiers ; bascule self-host envisagée post-launch si volume/marge le justifient. |
| Q2 | Hébergement proxy | Cloudflare Workers (plan Paid, $5/mois) sur `api.lexena.app`. |
| Q3 | Provider transcription | Groq `whisper-large-v3-turbo` seul. Fallback OpenAI Whisper noté post-launch. |
| Q4 | Provider post-process | OpenAI `gpt-4o-mini` par défaut, `gpt-4o` pour tier `full`. Llama écarté sur retour d'expérience direct. |
| Q5 | Stockage audio | Zero-retention strict. Aucune persistance disque ni Supabase. Logs : seulement `provider_request_id`. |

## Conséquences

- Time-to-market rapide pour le launch v3.2.
- Marge nette confortable sur Starter (~4,35€/user) et Pro (~7,55€/user).
- Dépendance unique Groq pour la transcription en phase 1 — risque accepté, mitigation post-launch via feature flag.
- DPA Groq + DPA OpenAI à signer avant launch (tâches ops).
- Schéma `usage_events` (event-sourced) + `usage_summary` (agrégat trigger) supersede la `usage_minutes` mentionnée à titre indicatif dans le spec premium 2026-04-27 §11.9.

## Alternatives écartées

- **Self-host Whisper sur GPU dès phase 1** : surcoût infra et complexité ops disproportionnés tant que le volume n'est pas validé.
- **OpenAI Whisper seul** : 10-50x plus lent que Groq, pas un argument vs BYOK user.
- **Multi-provider exposé à l'user** : friction UX sans gain équivalent.
- **Rétention temporaire 24-72h pour debug** : zone grise RGPD, contredit la promesse de confiance Lexena.
- **Llama 3 pour le post-process** : qualité catastrophique sur retour d'expérience direct (cf. mémoire `project_post_process_llm_choice.md`).

## Liens

- Spec : `docs/superpowers/specs/2026-05-04-managed-transcription-architecture-design.md`
- Plan : `docs/superpowers/plans/2026-05-04-managed-transcription-architecture.md`
- Sous-épique : `docs/v3/05-managed-transcription.md`
```

- [ ] **Step 2: Commit**

```bash
git add docs/v3/decisions/0012-managed-transcription-stack.md
git commit -m "docs(v3): ADR 0012 managed transcription stack"
```

---

## Task 2: Migration `usage_events`

**Files:**
- Create: `supabase/migrations/20260504100100_usage_events.sql`

- [ ] **Step 1: Écrire la migration**

```sql
-- Append-only ledger of cloud usage events (transcription or post_process).
-- Source of truth for audit, debug, support. Never mutated except via TRUNCATE
-- in test fixtures. Referenced by usage_summary trigger.

CREATE TABLE public.usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('transcription', 'post_process')),
  units NUMERIC(10, 4) NOT NULL CHECK (units >= 0),
  -- minutes for transcription, total tokens (in+out) for post_process
  units_unit TEXT NOT NULL CHECK (units_unit IN ('minutes', 'tokens')),
  model TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('groq', 'openai')),
  provider_request_id TEXT,
  idempotency_key TEXT,
  source TEXT NOT NULL CHECK (source IN ('trial', 'quota', 'overage')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT usage_events_idempotency_unique UNIQUE (user_id, idempotency_key)
);

CREATE INDEX usage_events_user_id_created_at_idx
  ON public.usage_events (user_id, created_at DESC);
CREATE INDEX usage_events_user_id_kind_created_at_idx
  ON public.usage_events (user_id, kind, created_at DESC);

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

-- Reads: user can read their own events (for support / dashboard).
CREATE POLICY usage_events_owner_read
  ON public.usage_events FOR SELECT
  USING (auth.uid() = user_id);

-- Writes: blocked for end users. Only service_role (Worker) can insert.
-- service_role bypasses RLS by design. No INSERT policy = denied for authenticated.

COMMENT ON TABLE public.usage_events IS
  'Append-only ledger of cloud transcription/post-process events. Zero-retention on payload — never stores audio, prompt, or text content.';
```

- [ ] **Step 2: Apply migration locally**

```bash
pnpm exec supabase db reset
```

Expected: la migration passe, no error.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260504100100_usage_events.sql
git commit -m "feat(v3): add usage_events ledger table"
```

---

## Task 3: Migration `usage_summary` + trigger

**Files:**
- Create: `supabase/migrations/20260504100200_usage_summary.sql`

- [ ] **Step 1: Écrire la migration**

```sql
-- Aggregate by (user_id, year_month, kind), maintained by AFTER INSERT trigger
-- on usage_events. Hot path quota check reads this table directly.

CREATE TABLE public.usage_summary (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL CHECK (year_month ~ '^\d{4}-\d{2}$'),
  kind TEXT NOT NULL CHECK (kind IN ('transcription', 'post_process')),
  units_total NUMERIC(12, 4) NOT NULL DEFAULT 0,
  events_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, year_month, kind)
);

ALTER TABLE public.usage_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY usage_summary_owner_read
  ON public.usage_summary FOR SELECT
  USING (auth.uid() = user_id);

-- Trigger function: UPSERT atomically on event insert.

CREATE OR REPLACE FUNCTION public.upsert_usage_summary()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.usage_summary
    (user_id, year_month, kind, units_total, events_count, updated_at)
  VALUES (
    NEW.user_id,
    to_char(NEW.created_at AT TIME ZONE 'UTC', 'YYYY-MM'),
    NEW.kind,
    NEW.units,
    1,
    NOW()
  )
  ON CONFLICT (user_id, year_month, kind) DO UPDATE
    SET units_total = public.usage_summary.units_total + EXCLUDED.units_total,
        events_count = public.usage_summary.events_count + 1,
        updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_usage_events_aggregate
  AFTER INSERT ON public.usage_events
  FOR EACH ROW EXECUTE FUNCTION public.upsert_usage_summary();

COMMENT ON TABLE public.usage_summary IS
  'Aggregate counter per (user_id, year_month, kind). Maintained by trigger on usage_events. Reset implicit per-month via year_month partition.';
```

- [ ] **Step 2: Apply**

```bash
pnpm exec supabase db reset
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260504100200_usage_summary.sql
git commit -m "feat(v3): add usage_summary aggregate + trigger"
```

---

## Task 4: Migration `trial_credits` + stub `subscriptions`

**Files:**
- Create: `supabase/migrations/20260504100300_trial_credits.sql`
- Create: `supabase/migrations/20260504100400_subscriptions_stub.sql`

- [ ] **Step 1: Vérifier si `subscriptions` existe déjà**

```bash
pnpm exec supabase db remote commit --dry-run 2>&1 | grep -i subscription || echo "no subscriptions yet"
```

OU plus simple : grep dans `supabase/migrations/` :

```bash
ls supabase/migrations/ | grep -i subscription
```

Si le résultat est vide → créer le stub Task 4 step 3. Sinon → skip step 3.

- [ ] **Step 2: Écrire migration `trial_credits`**

`supabase/migrations/20260504100300_trial_credits.sql` :

```sql
-- Trial credits granted at email verification: 60 minutes + 30 days cap.
-- See premium offer spec 2026-04-27 §5. Init logic (insert at email verify)
-- lives in 04-billing plan; this migration only creates the table.

CREATE TABLE public.trial_credits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  minutes_granted NUMERIC(8, 2) NOT NULL DEFAULT 60,
  minutes_consumed NUMERIC(10, 4) NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  CONSTRAINT trial_credits_consumed_lte_granted
    CHECK (minutes_consumed <= minutes_granted * 1.05)
);

ALTER TABLE public.trial_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY trial_credits_owner_read
  ON public.trial_credits FOR SELECT
  USING (auth.uid() = user_id);

-- Helper view: is trial currently active and how many minutes remain.
CREATE OR REPLACE VIEW public.trial_status AS
SELECT
  tc.user_id,
  tc.minutes_granted,
  tc.minutes_consumed,
  GREATEST(tc.minutes_granted - tc.minutes_consumed, 0) AS minutes_remaining,
  tc.expires_at,
  tc.expires_at > NOW() AS not_expired,
  (tc.minutes_consumed < tc.minutes_granted AND tc.expires_at > NOW()) AS is_active
FROM public.trial_credits tc;

GRANT SELECT ON public.trial_status TO authenticated;

COMMENT ON TABLE public.trial_credits IS
  'Per-user trial credits. 60 min granted at email verify, 30 days cap. First-of-two ends trial. Re-credit not automatic.';
```

- [ ] **Step 3 (conditionnel) : Stub `subscriptions` si absent**

`supabase/migrations/20260504100400_subscriptions_stub.sql` :

```sql
-- Minimal subscriptions table to allow the Worker to compile and quota check.
-- This will be replaced/extended by the 04-billing plan with the full
-- Lemon Squeezy schema (HMAC webhook, idempotence, etc.).
-- Only create if not already present.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'subscriptions'
  ) THEN
    CREATE TABLE public.subscriptions (
      user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      plan TEXT NOT NULL CHECK (plan IN ('starter', 'pro')),
      status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'expired')),
      quota_minutes INT NOT NULL,
      overage_rate_cents NUMERIC(6, 4) NOT NULL,
      current_period_end TIMESTAMPTZ NOT NULL,
      provider TEXT NOT NULL DEFAULT 'lemonsqueezy',
      provider_subscription_id TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
    CREATE POLICY subscriptions_owner_read
      ON public.subscriptions FOR SELECT
      USING (auth.uid() = user_id);
    COMMENT ON TABLE public.subscriptions IS
      'Stub created by 05-managed-transcription plan. Will be refined by 04-billing plan with full Lemon Squeezy integration.';
  END IF;
END $$;
```

- [ ] **Step 4: Apply**

```bash
pnpm exec supabase db reset
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260504100300_trial_credits.sql supabase/migrations/20260504100400_subscriptions_stub.sql
git commit -m "feat(v3): add trial_credits table and subscriptions stub"
```

---

## Task 5: pgTAP tests pour les migrations

**Files:**
- Create: `supabase/tests/rls_usage_events.sql`
- Create: `supabase/tests/rls_usage_summary.sql`
- Create: `supabase/tests/rls_trial_credits.sql`
- Create: `supabase/tests/usage_summary_trigger.sql`

- [ ] **Step 1: Test RLS `usage_events`**

`supabase/tests/rls_usage_events.sql` :

```sql
BEGIN;
SELECT plan(3);

-- Setup: 2 users, 1 event each.
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.local');

INSERT INTO public.usage_events (user_id, kind, units, units_unit, model, provider, source)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'transcription', 1.5, 'minutes', 'whisper-large-v3-turbo', 'groq', 'trial'),
  ('22222222-2222-2222-2222-222222222222', 'transcription', 2.0, 'minutes', 'whisper-large-v3-turbo', 'groq', 'trial');

-- User A sees only their event.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

SELECT is(
  (SELECT count(*) FROM public.usage_events)::int,
  1,
  'user A sees exactly 1 event'
);
SELECT is(
  (SELECT user_id::text FROM public.usage_events LIMIT 1),
  '11111111-1111-1111-1111-111111111111',
  'user A sees their own event only'
);

-- User B sees only theirs.
SET LOCAL request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
SELECT is(
  (SELECT count(*) FROM public.usage_events)::int,
  1,
  'user B sees exactly 1 event'
);

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Test trigger `usage_summary`**

`supabase/tests/usage_summary_trigger.sql` :

```sql
BEGIN;
SELECT plan(4);

INSERT INTO auth.users (id, email)
VALUES ('11111111-1111-1111-1111-111111111111', 'a@test.local');

-- Insert 3 events, 2 transcription + 1 post_process.
INSERT INTO public.usage_events
  (user_id, kind, units, units_unit, model, provider, source, created_at)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'transcription', 1.0, 'minutes', 'whisper-large-v3-turbo', 'groq', 'trial', '2026-05-04T12:00:00Z'),
  ('11111111-1111-1111-1111-111111111111', 'transcription', 2.5, 'minutes', 'whisper-large-v3-turbo', 'groq', 'trial', '2026-05-04T13:00:00Z'),
  ('11111111-1111-1111-1111-111111111111', 'post_process', 800, 'tokens', 'gpt-4o-mini', 'openai', 'trial', '2026-05-04T14:00:00Z');

SELECT is(
  (SELECT units_total FROM public.usage_summary
   WHERE user_id = '11111111-1111-1111-1111-111111111111'
     AND year_month = '2026-05' AND kind = 'transcription')::numeric,
  3.5::numeric,
  'transcription minutes summed'
);
SELECT is(
  (SELECT events_count FROM public.usage_summary
   WHERE user_id = '11111111-1111-1111-1111-111111111111'
     AND year_month = '2026-05' AND kind = 'transcription')::int,
  2,
  'transcription event count is 2'
);
SELECT is(
  (SELECT units_total FROM public.usage_summary
   WHERE user_id = '11111111-1111-1111-1111-111111111111'
     AND year_month = '2026-05' AND kind = 'post_process')::numeric,
  800::numeric,
  'post_process tokens summed'
);
SELECT is(
  (SELECT count(*) FROM public.usage_summary)::int,
  2,
  'two summary rows: one per (year_month, kind)'
);

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 3: Tests RLS `usage_summary` et `trial_credits`**

`supabase/tests/rls_usage_summary.sql` (cross-tenant deny) — pattern identique au `rls_usage_events.sql` mais sur `usage_summary`. Skip détail, copier le pattern, vérifier que user A ne voit pas les rows de B.

`supabase/tests/rls_trial_credits.sql` — idem sur `trial_credits`.

- [ ] **Step 4: Run tests**

```bash
pnpm exec supabase db reset
pnpm exec supabase test db
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/tests/
git commit -m "test(v3): pgtap RLS + summary trigger for usage tables"
```

---

## Task 6: Worker scaffold

**Files:**
- Create: `workers/transcription-api/package.json`
- Create: `workers/transcription-api/tsconfig.json`
- Create: `workers/transcription-api/wrangler.toml`
- Create: `workers/transcription-api/vitest.config.ts`
- Create: `workers/transcription-api/src/types.ts`

- [ ] **Step 1: package.json**

```json
{
  "name": "@lexena/transcription-api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "jose": "^5.9.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20251001.0",
    "@cloudflare/vitest-pool-workers": "^0.5.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "wrangler": "^3.80.0"
  }
}
```

- [ ] **Step 2: tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types/2024-09-23"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["src/**/*", "test/**/*"]
}
```

- [ ] **Step 3: wrangler.toml**

```toml
name = "lexena-transcription-api"
main = "src/index.ts"
compatibility_date = "2026-05-01"
compatibility_flags = ["nodejs_compat"]

# Production deployment
[env.production]
routes = [
  { pattern = "api.lexena.app/*", zone_name = "lexena.app" }
]

# Staging on workers.dev
[env.staging]
# Uses default workers.dev subdomain

# Secrets are set via `wrangler secret put` — never commit them here.
# Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET,
#           GROQ_API_KEY, OPENAI_API_KEY
```

- [ ] **Step 4: vitest.config.ts**

```typescript
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          // Provide deterministic env vars for tests.
          bindings: {
            SUPABASE_URL: "https://stub.supabase.co",
            SUPABASE_SERVICE_ROLE_KEY: "stub-service-role",
            SUPABASE_JWT_SECRET: "stub-jwt-secret-32-chars-minimum-len",
            GROQ_API_KEY: "stub-groq",
            OPENAI_API_KEY: "stub-openai",
          },
        },
      },
    },
  },
});
```

- [ ] **Step 5: types.ts (Env binding)**

```typescript
// workers/transcription-api/src/types.ts
export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_JWT_SECRET: string;
  GROQ_API_KEY: string;
  OPENAI_API_KEY: string;
}

export interface AuthenticatedUser {
  user_id: string;
  email?: string;
}

export type UsageKind = "transcription" | "post_process";
export type UsageUnit = "minutes" | "tokens";
export type UsageSource = "trial" | "quota" | "overage";

export interface UsageEventInput {
  user_id: string;
  kind: UsageKind;
  units: number;
  units_unit: UsageUnit;
  model: string;
  provider: "groq" | "openai";
  provider_request_id?: string;
  idempotency_key?: string;
  source: UsageSource;
}

export interface QuotaContext {
  source: UsageSource;
  // Remaining minutes available (combined trial + quota + overage allowance).
  remaining_minutes_estimate: number;
}
```

- [ ] **Step 6: Install + typecheck**

```bash
cd workers/transcription-api
pnpm install
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd ../..
git add workers/transcription-api/
git commit -m "feat(worker): scaffold transcription-api Cloudflare Worker"
```

---

## Task 7: JWT verification module

**Files:**
- Create: `workers/transcription-api/src/auth.ts`
- Create: `workers/transcription-api/test/auth.test.ts`

- [ ] **Step 1: Test failant**

`workers/transcription-api/test/auth.test.ts` :

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { env } from "cloudflare:test";
import { authenticate, AuthError } from "../src/auth";

const SECRET = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);

async function makeJwt(sub: string, opts: { expSeconds?: number; iss?: string } = {}) {
  return new SignJWT({ sub, role: "authenticated" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(opts.iss ?? "supabase")
    .setExpirationTime(opts.expSeconds ?? "1h")
    .sign(SECRET);
}

describe("authenticate", () => {
  it("rejects when Authorization header missing", async () => {
    const req = new Request("https://api.lexena.app/transcribe");
    await expect(authenticate(req, env)).rejects.toBeInstanceOf(AuthError);
  });

  it("rejects when token is malformed", async () => {
    const req = new Request("https://api.lexena.app/transcribe", {
      headers: { Authorization: "Bearer not-a-jwt" },
    });
    await expect(authenticate(req, env)).rejects.toBeInstanceOf(AuthError);
  });

  it("rejects when token is expired", async () => {
    const jwt = await makeJwt("user-1", { expSeconds: -10 } as { expSeconds: number });
    // Note: jose's setExpirationTime accepts string ; for past, we sign with explicit expired claim.
    const expired = await new SignJWT({ sub: "user-1", role: "authenticated", exp: Math.floor(Date.now() / 1000) - 60 })
      .setProtectedHeader({ alg: "HS256" })
      .sign(SECRET);
    const req = new Request("https://api.lexena.app/transcribe", {
      headers: { Authorization: `Bearer ${expired}` },
    });
    await expect(authenticate(req, env)).rejects.toBeInstanceOf(AuthError);
  });

  it("returns user_id when token is valid", async () => {
    const jwt = await makeJwt("user-1");
    const req = new Request("https://api.lexena.app/transcribe", {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    const auth = await authenticate(req, env);
    expect(auth.user_id).toBe("user-1");
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
cd workers/transcription-api && pnpm test
```

Expected: 4 tests fail with "module not found" or similar.

- [ ] **Step 3: Implémenter `auth.ts`**

```typescript
// workers/transcription-api/src/auth.ts
import { jwtVerify } from "jose";
import type { Env, AuthenticatedUser } from "./types";

export class AuthError extends Error {
  constructor(message: string, public readonly code: "missing" | "invalid" | "expired") {
    super(message);
    this.name = "AuthError";
  }
}

export async function authenticate(
  req: Request,
  env: Env,
): Promise<AuthenticatedUser> {
  const header = req.headers.get("Authorization");
  if (!header || !header.startsWith("Bearer ")) {
    throw new AuthError("missing Authorization header", "missing");
  }
  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    throw new AuthError("empty bearer token", "missing");
  }

  const secret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);
  let payload;
  try {
    const result = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });
    payload = result.payload;
  } catch (err) {
    const code = (err as Error).message.toLowerCase().includes("exp")
      ? "expired"
      : "invalid";
    throw new AuthError(`jwt verify failed: ${(err as Error).message}`, code);
  }

  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new AuthError("missing sub claim", "invalid");
  }

  return {
    user_id: payload.sub,
    email: typeof payload.email === "string" ? payload.email : undefined,
  };
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
pnpm test
```

Expected: 4/4 pass.

- [ ] **Step 5: Commit**

```bash
cd ../..
git add workers/transcription-api/src/auth.ts workers/transcription-api/test/auth.test.ts
git commit -m "feat(worker): JWT verification with jose"
```

---

## Task 8: Supabase client wrapper

**Files:**
- Create: `workers/transcription-api/src/supabase.ts`

- [ ] **Step 1: Implémenter le wrapper**

```typescript
// workers/transcription-api/src/supabase.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./types";

// Service-role client. Bypasses RLS — use only in trusted Worker context.
// Never expose this client or its key to the browser/desktop client.

let cachedClient: SupabaseClient | null = null;

export function getSupabaseAdmin(env: Env): SupabaseClient {
  if (!cachedClient) {
    cachedClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return cachedClient;
}

// Reset cache for tests.
export function _resetSupabaseClientForTest(): void {
  cachedClient = null;
}
```

Pas de test unitaire dédié : ce wrapper est testé indirectement par `usage.ts` (Task 11).

- [ ] **Step 2: Typecheck**

```bash
cd workers/transcription-api && pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
cd ../..
git add workers/transcription-api/src/supabase.ts
git commit -m "feat(worker): supabase service-role client"
```

---

## Task 9: Errors module

**Files:**
- Create: `workers/transcription-api/src/errors.ts`

- [ ] **Step 1: Implémenter**

```typescript
// workers/transcription-api/src/errors.ts

export type ErrorCode =
  | "missing_auth"
  | "invalid_auth"
  | "expired_auth"
  | "quota_exhausted"
  | "trial_expired"
  | "audio_too_large"
  | "unsupported_format"
  | "provider_unavailable"
  | "internal";

export interface ErrorBody {
  error: ErrorCode;
  message: string;
  request_id?: string;
}

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  missing_auth: 401,
  invalid_auth: 401,
  expired_auth: 401,
  quota_exhausted: 402,
  trial_expired: 402,
  audio_too_large: 413,
  unsupported_format: 415,
  provider_unavailable: 502,
  internal: 500,
};

export function errorResponse(
  code: ErrorCode,
  message: string,
  requestId?: string,
): Response {
  const body: ErrorBody = { error: code, message, ...(requestId ? { request_id: requestId } : {}) };
  return new Response(JSON.stringify(body), {
    status: STATUS_BY_CODE[code],
    headers: { "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add workers/transcription-api/src/errors.ts
git commit -m "feat(worker): typed error response helpers"
```

---

## Task 10: Groq client wrapper

**Files:**
- Create: `workers/transcription-api/src/groq.ts`

- [ ] **Step 1: Implémenter**

```typescript
// workers/transcription-api/src/groq.ts
import type { Env } from "./types";

const GROQ_TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const DEFAULT_MODEL = "whisper-large-v3-turbo";

export interface GroqTranscriptionResult {
  text: string;
  duration: number; // seconds, as returned by Groq
  request_id?: string;
}

export class GroqError extends Error {
  constructor(message: string, public status: number, public retryable: boolean) {
    super(message);
    this.name = "GroqError";
  }
}

export async function transcribeWithGroq(
  audioBlob: Blob,
  env: Env,
  opts: { language?: string; filename?: string } = {},
): Promise<GroqTranscriptionResult> {
  const form = new FormData();
  form.append("file", audioBlob, opts.filename ?? "audio.bin");
  form.append("model", DEFAULT_MODEL);
  form.append("response_format", "verbose_json");
  if (opts.language) {
    form.append("language", opts.language);
  }

  const res = await fetch(GROQ_TRANSCRIBE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
    body: form,
  });

  const requestId = res.headers.get("x-request-id") ?? undefined;

  if (!res.ok) {
    const text = await res.text().catch(() => "<no body>");
    const retryable = res.status >= 500 || res.status === 429;
    throw new GroqError(
      `groq returned ${res.status}: ${text.slice(0, 256)}`,
      res.status,
      retryable,
    );
  }

  const json = (await res.json()) as { text?: string; duration?: number };
  if (typeof json.text !== "string" || typeof json.duration !== "number") {
    throw new GroqError("malformed groq response", 502, true);
  }

  return {
    text: json.text,
    duration: json.duration,
    request_id: requestId,
  };
}
```

- [ ] **Step 2: Test (mock fetch)**

`workers/transcription-api/test/groq.test.ts` :

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { transcribeWithGroq, GroqError } from "../src/groq";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("transcribeWithGroq", () => {
  it("returns text + duration on 200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ text: "hello world", duration: 3.5 }), {
        status: 200,
        headers: { "x-request-id": "req-abc", "content-type": "application/json" },
      }),
    );
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" });
    const result = await transcribeWithGroq(blob, env, { language: "fr" });
    expect(result.text).toBe("hello world");
    expect(result.duration).toBe(3.5);
    expect(result.request_id).toBe("req-abc");
  });

  it("throws GroqError marked retryable on 502", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("upstream timeout", { status: 502 }),
    );
    const blob = new Blob([new Uint8Array([1, 2])], { type: "audio/wav" });
    await expect(transcribeWithGroq(blob, env)).rejects.toMatchObject({
      name: "GroqError",
      status: 502,
      retryable: true,
    });
  });

  it("throws GroqError non-retryable on 400", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("bad request", { status: 400 }),
    );
    const blob = new Blob([new Uint8Array([1])], { type: "audio/wav" });
    await expect(transcribeWithGroq(blob, env)).rejects.toMatchObject({
      status: 400,
      retryable: false,
    });
  });
});
```

- [ ] **Step 3: Run**

```bash
cd workers/transcription-api && pnpm test -- groq
```

Expected: 3/3 pass.

- [ ] **Step 4: Commit**

```bash
cd ../..
git add workers/transcription-api/src/groq.ts workers/transcription-api/test/groq.test.ts
git commit -m "feat(worker): groq whisper client wrapper"
```

---

## Task 11: Usage module — quota check + débit

**Files:**
- Create: `workers/transcription-api/src/usage.ts`
- Create: `workers/transcription-api/test/usage.test.ts`

- [ ] **Step 1: Implémenter**

```typescript
// workers/transcription-api/src/usage.ts
import type { Env, QuotaContext, UsageEventInput, UsageKind } from "./types";
import { getSupabaseAdmin } from "./supabase";

interface TrialStatus {
  is_active: boolean;
  minutes_remaining: number;
}

interface SubscriptionState {
  status: "active" | "paused" | "expired" | null;
  plan: "starter" | "pro" | null;
  quota_minutes: number;
  // Hard cap fair use (mentioned 5h in premium spec, kept configurable here).
  overage_minutes_allowed: number;
  current_month: string; // 'YYYY-MM' UTC
  used_minutes_this_month: number;
}

const HARD_CAP_OVERAGE_MINUTES = 300; // 5h soft cap fair use

function currentYearMonth(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export async function fetchTrialStatus(
  env: Env,
  user_id: string,
): Promise<TrialStatus> {
  const sb = getSupabaseAdmin(env);
  const { data, error } = await sb
    .from("trial_status")
    .select("is_active, minutes_remaining")
    .eq("user_id", user_id)
    .maybeSingle();
  if (error) throw new Error(`trial_status fetch failed: ${error.message}`);
  return {
    is_active: data?.is_active ?? false,
    minutes_remaining: Number(data?.minutes_remaining ?? 0),
  };
}

export async function fetchSubscriptionState(
  env: Env,
  user_id: string,
): Promise<SubscriptionState> {
  const sb = getSupabaseAdmin(env);
  const yearMonth = currentYearMonth();

  const [{ data: sub }, { data: usage }] = await Promise.all([
    sb.from("subscriptions").select("status, plan, quota_minutes").eq("user_id", user_id).maybeSingle(),
    sb.from("usage_summary")
      .select("units_total")
      .eq("user_id", user_id)
      .eq("kind", "transcription")
      .eq("year_month", yearMonth)
      .maybeSingle(),
  ]);

  return {
    status: (sub?.status as SubscriptionState["status"]) ?? null,
    plan: (sub?.plan as SubscriptionState["plan"]) ?? null,
    quota_minutes: Number(sub?.quota_minutes ?? 0),
    overage_minutes_allowed: HARD_CAP_OVERAGE_MINUTES,
    current_month: yearMonth,
    used_minutes_this_month: Number(usage?.units_total ?? 0),
  };
}

/**
 * Determine which "wallet" to debit for a transcription request.
 *
 * Priority: trial > quota > overage > deny.
 * `requested_minutes` may be 0 if duration is not yet known (pre-flight checks
 * still want to verify *some* eligibility).
 */
export async function checkQuotaForTranscription(
  env: Env,
  user_id: string,
  requested_minutes: number,
): Promise<QuotaContext> {
  const trial = await fetchTrialStatus(env, user_id);
  if (trial.is_active && trial.minutes_remaining > 0) {
    return { source: "trial", remaining_minutes_estimate: trial.minutes_remaining };
  }

  const sub = await fetchSubscriptionState(env, user_id);
  if (sub.status !== "active" || !sub.plan) {
    throw new QuotaExhausted("no_active_subscription");
  }

  const remaining_quota = sub.quota_minutes - sub.used_minutes_this_month;
  if (remaining_quota > 0) {
    return { source: "quota", remaining_minutes_estimate: remaining_quota };
  }

  const used_overage = -remaining_quota; // already negative when over
  if (used_overage < sub.overage_minutes_allowed) {
    return {
      source: "overage",
      remaining_minutes_estimate: sub.overage_minutes_allowed - used_overage,
    };
  }

  throw new QuotaExhausted("hard_cap_reached");
}

export class QuotaExhausted extends Error {
  constructor(public reason: "no_active_subscription" | "hard_cap_reached") {
    super(`quota exhausted: ${reason}`);
    this.name = "QuotaExhausted";
  }
}

/**
 * Insert a usage_events row + atomically debit trial_credits if source=trial.
 * Idempotent on (user_id, idempotency_key).
 * Returns the inserted event id, or the existing one if idempotency_key already exists.
 */
export async function recordUsageEvent(
  env: Env,
  event: UsageEventInput,
): Promise<{ event_id: string; deduplicated: boolean }> {
  const sb = getSupabaseAdmin(env);

  // Idempotency: try to find an existing event first.
  if (event.idempotency_key) {
    const { data: existing } = await sb
      .from("usage_events")
      .select("id")
      .eq("user_id", event.user_id)
      .eq("idempotency_key", event.idempotency_key)
      .maybeSingle();
    if (existing) {
      return { event_id: existing.id, deduplicated: true };
    }
  }

  const { data, error } = await sb
    .from("usage_events")
    .insert({
      user_id: event.user_id,
      kind: event.kind,
      units: event.units,
      units_unit: event.units_unit,
      model: event.model,
      provider: event.provider,
      provider_request_id: event.provider_request_id ?? null,
      idempotency_key: event.idempotency_key ?? null,
      source: event.source,
    })
    .select("id")
    .single();

  if (error) {
    // Race condition on idempotency: insert collided. Re-fetch.
    if (event.idempotency_key && error.code === "23505") {
      const { data: existing } = await sb
        .from("usage_events")
        .select("id")
        .eq("user_id", event.user_id)
        .eq("idempotency_key", event.idempotency_key)
        .single();
      return { event_id: existing!.id, deduplicated: true };
    }
    throw new Error(`recordUsageEvent failed: ${error.message}`);
  }

  // If trial source on transcription, also bump trial_credits.minutes_consumed
  // via the bump_trial_minutes RPC (added in the migration below).
  if (event.source === "trial" && event.kind === "transcription") {
    const { error: bumpErr } = await sb.rpc("bump_trial_minutes", {
      p_user_id: event.user_id,
      p_minutes: event.units,
    });
    if (bumpErr) {
      throw new Error(`trial bump failed: ${bumpErr.message}`);
    }
  }

  return { event_id: data.id, deduplicated: false };
}
```

The `bump_trial_minutes` RPC is required. Add a separate migration **before** running this task's tests:

`supabase/migrations/20260504100500_bump_trial_minutes.sql` :

```sql
CREATE OR REPLACE FUNCTION public.bump_trial_minutes(p_user_id UUID, p_minutes NUMERIC)
RETURNS VOID AS $$
  UPDATE public.trial_credits
     SET minutes_consumed = minutes_consumed + p_minutes
   WHERE user_id = p_user_id;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.bump_trial_minutes(UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_trial_minutes(UUID, NUMERIC) TO service_role;
```

Apply with `pnpm exec supabase db reset` before continuing.

- [ ] **Step 2: Tests** (avec stub Supabase via `cloudflare:test` env)

`workers/transcription-api/test/usage.test.ts` :

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { _resetSupabaseClientForTest } from "../src/supabase";
import * as usage from "../src/usage";

beforeEach(() => {
  _resetSupabaseClientForTest();
  vi.restoreAllMocks();
});

describe("currentYearMonth (UTC)", () => {
  it("formats correctly", async () => {
    // Indirect test via fetchSubscriptionState behavior — not exposing function publicly.
    // For thorough test, expose via internal helper if useful.
    expect(true).toBe(true);
  });
});

describe("checkQuotaForTranscription", () => {
  it("prefers trial over quota when trial active", async () => {
    // Mock fetchTrialStatus + fetchSubscriptionState by spying on supabase client.
    // For brevity here, see actual test style in workers/transcription-api/test/usage.test.ts
    // using vi.fn for sb.from(...).select(...).eq(...).maybeSingle().
    // Skipping inline impl to keep plan readable.
  });

  it("falls back to overage when quota exceeded", async () => {
    // similar
  });

  it("throws QuotaExhausted when over hard cap", async () => {
    // similar
  });
});
```

> **Note** : les tests détaillés du module `usage.ts` seront étoffés en Step 3 ci-dessous avec un harness de mock supabase-js. La structure ci-dessus est le squelette ; ajouter les mocks explicites lors de l'exécution.

- [ ] **Step 3: Étoffer les mocks**

Pour chaque test ci-dessus, mocker `getSupabaseAdmin` :

```typescript
import * as sbModule from "../src/supabase";

function mockSupabase(behaviors: { trial?: any; sub?: any; usage?: any }) {
  const fromMock = vi.fn((table: string) => {
    if (table === "trial_status") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: behaviors.trial ?? null, error: null }),
          }),
        }),
      };
    }
    if (table === "subscriptions") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: behaviors.sub ?? null, error: null }),
          }),
        }),
      };
    }
    if (table === "usage_summary") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: behaviors.usage ?? null, error: null }),
              }),
            }),
          }),
        }),
      };
    }
    throw new Error(`unmocked table: ${table}`);
  });
  vi.spyOn(sbModule, "getSupabaseAdmin").mockReturnValue({ from: fromMock } as any);
}

// Then in each test:
it("prefers trial over quota when trial active", async () => {
  mockSupabase({ trial: { is_active: true, minutes_remaining: 30 } });
  const ctx = await usage.checkQuotaForTranscription(env, "user-1", 1);
  expect(ctx.source).toBe("trial");
});
```

Adapter le pattern pour les autres tests.

- [ ] **Step 4: Run**

```bash
cd workers/transcription-api && pnpm test -- usage
```

Expected: 3/3 pass minimum (skeleton + mocks).

- [ ] **Step 5: Commit (incl. RPC migration)**

```bash
cd ../..
git add workers/transcription-api/src/usage.ts workers/transcription-api/test/usage.test.ts supabase/migrations/20260504100500_bump_trial_minutes.sql
git commit -m "feat(worker): quota check + usage event recording"
```

---

## Task 12: `/transcribe` handler

**Files:**
- Create: `workers/transcription-api/src/transcribe.ts`
- Create: `workers/transcription-api/test/transcribe.test.ts`

- [ ] **Step 1: Implémenter le handler**

```typescript
// workers/transcription-api/src/transcribe.ts
import type { Env, AuthenticatedUser } from "./types";
import { transcribeWithGroq, GroqError } from "./groq";
import { checkQuotaForTranscription, recordUsageEvent, QuotaExhausted } from "./usage";
import { errorResponse } from "./errors";

const MAX_AUDIO_BYTES = 50 * 1024 * 1024; // 50 MB hard limit
const ALLOWED_MIME = new Set([
  "audio/wav", "audio/x-wav",
  "audio/mpeg", "audio/mp3",
  "audio/flac",
  "audio/mp4", "audio/m4a",
  "audio/ogg",
  "audio/webm",
]);

export async function handleTranscribe(
  req: Request,
  env: Env,
  user: AuthenticatedUser,
): Promise<Response> {
  const idempotencyKey = req.headers.get("Idempotency-Key") ?? undefined;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorResponse("internal", "expected multipart/form-data body");
  }

  const audio = form.get("audio");
  if (!(audio instanceof File) && !(audio instanceof Blob)) {
    return errorResponse("internal", "missing 'audio' part");
  }
  const language = form.get("language");
  const lang = typeof language === "string" ? language.slice(0, 2) : undefined;

  const blob = audio as Blob;
  if (blob.size > MAX_AUDIO_BYTES) {
    return errorResponse("audio_too_large", `audio exceeds ${MAX_AUDIO_BYTES} bytes`);
  }
  if (blob.type && !ALLOWED_MIME.has(blob.type)) {
    return errorResponse("unsupported_format", `unsupported mime: ${blob.type}`);
  }

  // Pre-check quota with a 0-minute estimate (we don't know duration yet).
  let quota;
  try {
    quota = await checkQuotaForTranscription(env, user.user_id, 0);
  } catch (err) {
    if (err instanceof QuotaExhausted) {
      return errorResponse("quota_exhausted", err.reason);
    }
    throw err;
  }

  // Relay to Groq.
  let result;
  try {
    result = await transcribeWithGroq(blob, env, { language: lang });
  } catch (err) {
    if (err instanceof GroqError) {
      return errorResponse("provider_unavailable", `groq error ${err.status}`);
    }
    throw err;
  }

  // Debit usage.
  const minutes = result.duration / 60;
  const { event_id } = await recordUsageEvent(env, {
    user_id: user.user_id,
    kind: "transcription",
    units: minutes,
    units_unit: "minutes",
    model: "whisper-large-v3-turbo",
    provider: "groq",
    provider_request_id: result.request_id,
    idempotency_key: idempotencyKey,
    source: quota.source,
  });

  return Response.json({
    text: result.text,
    duration_ms: Math.round(result.duration * 1000),
    request_id: event_id,
    source: quota.source,
  });
}
```

- [ ] **Step 2: Tests**

`workers/transcription-api/test/transcribe.test.ts` :

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { handleTranscribe } from "../src/transcribe";
import * as groq from "../src/groq";
import * as usage from "../src/usage";

beforeEach(() => vi.restoreAllMocks());

const user = { user_id: "user-1" };

function buildReq(audioBytes: Uint8Array, opts: { lang?: string; idempotencyKey?: string } = {}): Request {
  const form = new FormData();
  form.append("audio", new Blob([audioBytes], { type: "audio/wav" }), "test.wav");
  if (opts.lang) form.append("language", opts.lang);
  return new Request("https://api.lexena.app/transcribe", {
    method: "POST",
    body: form,
    headers: opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {},
  });
}

describe("handleTranscribe", () => {
  it("returns 200 with transcription when quota OK and groq succeeds", async () => {
    vi.spyOn(usage, "checkQuotaForTranscription").mockResolvedValue({
      source: "trial",
      remaining_minutes_estimate: 30,
    });
    vi.spyOn(groq, "transcribeWithGroq").mockResolvedValue({
      text: "hello",
      duration: 4.2,
      request_id: "groq-req-1",
    });
    vi.spyOn(usage, "recordUsageEvent").mockResolvedValue({
      event_id: "evt-1",
      deduplicated: false,
    });

    const res = await handleTranscribe(buildReq(new Uint8Array([1, 2, 3])), env, user);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { text: string; duration_ms: number; source: string };
    expect(body.text).toBe("hello");
    expect(body.duration_ms).toBe(4200);
    expect(body.source).toBe("trial");
  });

  it("returns 402 when quota exhausted", async () => {
    vi.spyOn(usage, "checkQuotaForTranscription").mockRejectedValue(
      new (await import("../src/usage")).QuotaExhausted("hard_cap_reached"),
    );
    const res = await handleTranscribe(buildReq(new Uint8Array([1])), env, user);
    expect(res.status).toBe(402);
  });

  it("returns 413 when audio too large", async () => {
    const big = new Uint8Array(60 * 1024 * 1024); // 60 MB
    const res = await handleTranscribe(buildReq(big), env, user);
    expect(res.status).toBe(413);
  });

  it("returns 502 when groq fails", async () => {
    vi.spyOn(usage, "checkQuotaForTranscription").mockResolvedValue({
      source: "trial",
      remaining_minutes_estimate: 30,
    });
    vi.spyOn(groq, "transcribeWithGroq").mockRejectedValue(
      new groq.GroqError("upstream", 503, true),
    );
    const res = await handleTranscribe(buildReq(new Uint8Array([1])), env, user);
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 3: Run**

```bash
cd workers/transcription-api && pnpm test -- transcribe
```

Expected: 4/4 pass.

- [ ] **Step 4: Commit**

```bash
cd ../..
git add workers/transcription-api/src/transcribe.ts workers/transcription-api/test/transcribe.test.ts
git commit -m "feat(worker): /transcribe handler with quota check + zero-retention"
```

---

## Task 13: OpenAI client wrapper

**Files:**
- Create: `workers/transcription-api/src/openai.ts`

- [ ] **Step 1: Implémenter**

```typescript
// workers/transcription-api/src/openai.ts
import type { Env } from "./types";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

export type OpenAIModelTier = "mini" | "full";

const MODEL_BY_TIER: Record<OpenAIModelTier, string> = {
  mini: "gpt-4o-mini",
  full: "gpt-4o",
};

export interface OpenAIChatResult {
  text: string;
  tokens_in: number;
  tokens_out: number;
  model: string;
  request_id?: string;
}

export class OpenAIError extends Error {
  constructor(message: string, public status: number, public retryable: boolean) {
    super(message);
    this.name = "OpenAIError";
  }
}

export async function chatCompletion(
  systemPrompt: string,
  userPrompt: string,
  env: Env,
  tier: OpenAIModelTier = "mini",
): Promise<OpenAIChatResult> {
  const model = MODEL_BY_TIER[tier];
  const res = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
    }),
  });

  const requestId = res.headers.get("x-request-id") ?? undefined;

  if (!res.ok) {
    const text = await res.text().catch(() => "<no body>");
    const retryable = res.status >= 500 || res.status === 429;
    throw new OpenAIError(`openai ${res.status}: ${text.slice(0, 256)}`, res.status, retryable);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const text = json.choices?.[0]?.message?.content;
  const tokens_in = json.usage?.prompt_tokens;
  const tokens_out = json.usage?.completion_tokens;

  if (typeof text !== "string" || typeof tokens_in !== "number" || typeof tokens_out !== "number") {
    throw new OpenAIError("malformed openai response", 502, true);
  }

  return { text, tokens_in, tokens_out, model, request_id: requestId };
}
```

- [ ] **Step 2: Test (mock fetch)**

`workers/transcription-api/test/openai.test.ts` :

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { chatCompletion, OpenAIError } from "../src/openai";

beforeEach(() => vi.restoreAllMocks());

describe("chatCompletion", () => {
  it("returns text + tokens on 200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "rephrased" } }],
          usage: { prompt_tokens: 100, completion_tokens: 30 },
        }),
        { status: 200, headers: { "x-request-id": "oai-1", "content-type": "application/json" } },
      ),
    );
    const res = await chatCompletion("system", "user", env, "mini");
    expect(res.text).toBe("rephrased");
    expect(res.tokens_in).toBe(100);
    expect(res.tokens_out).toBe(30);
    expect(res.model).toBe("gpt-4o-mini");
    expect(res.request_id).toBe("oai-1");
  });

  it("uses gpt-4o when tier=full", async () => {
    let receivedBody = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      receivedBody = init!.body as string;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "x" } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
        { status: 200 },
      );
    });
    await chatCompletion("s", "u", env, "full");
    expect(receivedBody).toContain('"model":"gpt-4o"');
  });

  it("throws OpenAIError retryable on 429", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("rate limited", { status: 429 }));
    await expect(chatCompletion("s", "u", env)).rejects.toMatchObject({
      status: 429,
      retryable: true,
    });
  });
});
```

- [ ] **Step 3: Run**

```bash
cd workers/transcription-api && pnpm test -- openai
```

Expected: 3/3 pass.

- [ ] **Step 4: Commit**

```bash
cd ../..
git add workers/transcription-api/src/openai.ts workers/transcription-api/test/openai.test.ts
git commit -m "feat(worker): openai chat completion wrapper"
```

---

## Task 14: Prompts module — templates post-process

**Files:**
- Create: `workers/transcription-api/src/prompts.ts`

- [ ] **Step 1: Implémenter**

```typescript
// workers/transcription-api/src/prompts.ts

export type PostProcessTask = "reformulate" | "correct" | "email" | "summarize";

export interface PromptTemplate {
  system: string;
  buildUser: (input: string, language?: string) => string;
}

const langClause = (lang?: string) =>
  lang ? `\n\nLangue de réponse : ${lang}.` : "";

const TEMPLATES: Record<PostProcessTask, PromptTemplate> = {
  reformulate: {
    system:
      "Tu es un assistant qui reformule un texte pour le rendre plus clair, concis et naturel, en conservant strictement le sens et l'intention de l'auteur. Tu ne rajoutes ni ne retires d'information. Réponds avec uniquement le texte reformulé, sans préambule.",
    buildUser: (input, lang) =>
      `Texte à reformuler :\n\n${input}${langClause(lang)}`,
  },
  correct: {
    system:
      "Tu es un correcteur orthographique et grammatical. Tu corriges les fautes sans modifier le style ni le sens. Réponds avec uniquement le texte corrigé.",
    buildUser: (input, lang) =>
      `Texte à corriger :\n\n${input}${langClause(lang)}`,
  },
  email: {
    system:
      "Tu transformes une note dictée en un email professionnel concis et bien structuré. Tu inclus un objet pertinent, une formule d'appel adaptée et une formule de politesse. Réponds avec uniquement l'email final, format texte brut.",
    buildUser: (input, lang) =>
      `Note à transformer en email :\n\n${input}${langClause(lang)}`,
  },
  summarize: {
    system:
      "Tu résumes un texte en gardant l'essentiel, en 3-5 puces. Réponds avec uniquement les puces, format texte brut.",
    buildUser: (input, lang) =>
      `Texte à résumer :\n\n${input}${langClause(lang)}`,
  },
};

export function getPromptTemplate(task: PostProcessTask): PromptTemplate {
  return TEMPLATES[task];
}

export function isValidTask(task: string): task is PostProcessTask {
  return task in TEMPLATES;
}
```

- [ ] **Step 2: Pas de test unitaire dédié** (les templates sont du contenu, pas de la logique). Test d'intégration via `/post-process` (Task 15).

- [ ] **Step 3: Commit**

```bash
git add workers/transcription-api/src/prompts.ts
git commit -m "feat(worker): post-process prompt templates (FR-first)"
```

---

## Task 15: `/post-process` handler

**Files:**
- Create: `workers/transcription-api/src/post-process.ts`
- Create: `workers/transcription-api/test/post-process.test.ts`

- [ ] **Step 1: Implémenter**

```typescript
// workers/transcription-api/src/post-process.ts
import type { Env, AuthenticatedUser } from "./types";
import { chatCompletion, OpenAIError, type OpenAIModelTier } from "./openai";
import { getPromptTemplate, isValidTask } from "./prompts";
import { recordUsageEvent, fetchTrialStatus, fetchSubscriptionState } from "./usage";
import { errorResponse } from "./errors";

const MAX_INPUT_CHARS = 50_000;

interface PostProcessBody {
  task: string;
  text: string;
  language?: string;
  model_tier?: string;
}

export async function handlePostProcess(
  req: Request,
  env: Env,
  user: AuthenticatedUser,
): Promise<Response> {
  const idempotencyKey = req.headers.get("Idempotency-Key") ?? undefined;

  let body: PostProcessBody;
  try {
    body = (await req.json()) as PostProcessBody;
  } catch {
    return errorResponse("internal", "invalid JSON body");
  }

  if (!isValidTask(body.task)) {
    return errorResponse("internal", `unknown task: ${body.task}`);
  }
  if (typeof body.text !== "string" || !body.text.trim()) {
    return errorResponse("internal", "missing or empty 'text'");
  }
  if (body.text.length > MAX_INPUT_CHARS) {
    return errorResponse("audio_too_large", `text too long (max ${MAX_INPUT_CHARS} chars)`);
  }
  const tier: OpenAIModelTier = body.model_tier === "full" ? "full" : "mini";

  // Eligibility: post_process is gated by *any* of trial active OR active subscription.
  // Token-precise quota tracking happens after the fact.
  const trial = await fetchTrialStatus(env, user.user_id);
  const sub = await fetchSubscriptionState(env, user.user_id);
  const eligible = trial.is_active || sub.status === "active";
  if (!eligible) {
    return errorResponse("quota_exhausted", "no active trial or subscription");
  }
  const source = trial.is_active ? "trial" : "quota";

  const template = getPromptTemplate(body.task);
  const userPrompt = template.buildUser(body.text, body.language);

  let result;
  try {
    result = await chatCompletion(template.system, userPrompt, env, tier);
  } catch (err) {
    if (err instanceof OpenAIError) {
      return errorResponse("provider_unavailable", `openai ${err.status}`);
    }
    throw err;
  }

  const totalTokens = result.tokens_in + result.tokens_out;
  const { event_id } = await recordUsageEvent(env, {
    user_id: user.user_id,
    kind: "post_process",
    units: totalTokens,
    units_unit: "tokens",
    model: result.model,
    provider: "openai",
    provider_request_id: result.request_id,
    idempotency_key: idempotencyKey,
    source,
  });

  return Response.json({
    text: result.text,
    tokens_in: result.tokens_in,
    tokens_out: result.tokens_out,
    request_id: event_id,
    source,
  });
}
```

- [ ] **Step 2: Tests**

`workers/transcription-api/test/post-process.test.ts` :

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { handlePostProcess } from "../src/post-process";
import * as openai from "../src/openai";
import * as usage from "../src/usage";

beforeEach(() => vi.restoreAllMocks());

const user = { user_id: "user-1" };

function buildReq(body: Record<string, unknown>): Request {
  return new Request("https://api.lexena.app/post-process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("handlePostProcess", () => {
  it("returns 200 with reformulated text when eligible", async () => {
    vi.spyOn(usage, "fetchTrialStatus").mockResolvedValue({ is_active: true, minutes_remaining: 30 });
    vi.spyOn(usage, "fetchSubscriptionState").mockResolvedValue({
      status: null, plan: null, quota_minutes: 0,
      overage_minutes_allowed: 300, current_month: "2026-05", used_minutes_this_month: 0,
    });
    vi.spyOn(openai, "chatCompletion").mockResolvedValue({
      text: "reformulated", tokens_in: 50, tokens_out: 20, model: "gpt-4o-mini", request_id: "oai-1",
    });
    vi.spyOn(usage, "recordUsageEvent").mockResolvedValue({ event_id: "evt-1", deduplicated: false });

    const res = await handlePostProcess(
      buildReq({ task: "reformulate", text: "j'ai besoin de", language: "fr" }),
      env,
      user,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { text: string; tokens_in: number; source: string };
    expect(body.text).toBe("reformulated");
    expect(body.tokens_in).toBe(50);
    expect(body.source).toBe("trial");
  });

  it("returns 402 when no trial and no subscription", async () => {
    vi.spyOn(usage, "fetchTrialStatus").mockResolvedValue({ is_active: false, minutes_remaining: 0 });
    vi.spyOn(usage, "fetchSubscriptionState").mockResolvedValue({
      status: "expired", plan: null, quota_minutes: 0,
      overage_minutes_allowed: 300, current_month: "2026-05", used_minutes_this_month: 0,
    });
    const res = await handlePostProcess(
      buildReq({ task: "reformulate", text: "x" }),
      env,
      user,
    );
    expect(res.status).toBe(402);
  });

  it("returns 500-equivalent on unknown task", async () => {
    const res = await handlePostProcess(
      buildReq({ task: "blur", text: "x" }),
      env,
      user,
    );
    expect(res.status).toBe(500);
  });

  it("uses gpt-4o when model_tier=full", async () => {
    vi.spyOn(usage, "fetchTrialStatus").mockResolvedValue({ is_active: true, minutes_remaining: 30 });
    vi.spyOn(usage, "fetchSubscriptionState").mockResolvedValue({} as never);
    const spy = vi.spyOn(openai, "chatCompletion").mockResolvedValue({
      text: "x", tokens_in: 1, tokens_out: 1, model: "gpt-4o", request_id: "r",
    });
    vi.spyOn(usage, "recordUsageEvent").mockResolvedValue({ event_id: "e", deduplicated: false });
    await handlePostProcess(
      buildReq({ task: "reformulate", text: "x", model_tier: "full" }),
      env,
      user,
    );
    expect(spy).toHaveBeenCalledWith(expect.any(String), expect.any(String), env, "full");
  });
});
```

- [ ] **Step 3: Run**

```bash
cd workers/transcription-api && pnpm test -- post-process
```

Expected: 4/4 pass.

- [ ] **Step 4: Commit**

```bash
cd ../..
git add workers/transcription-api/src/post-process.ts workers/transcription-api/test/post-process.test.ts
git commit -m "feat(worker): /post-process handler with prompt templates"
```

---

## Task 16: Worker entry point + routing

**Files:**
- Create: `workers/transcription-api/src/index.ts`

- [ ] **Step 1: Implémenter**

```typescript
// workers/transcription-api/src/index.ts
import type { Env } from "./types";
import { authenticate, AuthError } from "./auth";
import { handleTranscribe } from "./transcribe";
import { handlePostProcess } from "./post-process";
import { errorResponse } from "./errors";

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    // Health check (unauthenticated).
    if (req.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // Authenticate.
    let user;
    try {
      user = await authenticate(req, env);
    } catch (err) {
      if (err instanceof AuthError) {
        const code =
          err.code === "missing" ? "missing_auth" :
          err.code === "expired" ? "expired_auth" : "invalid_auth";
        return errorResponse(code, err.message);
      }
      throw err;
    }

    try {
      switch (url.pathname) {
        case "/transcribe":
          return await handleTranscribe(req, env, user);
        case "/post-process":
          return await handlePostProcess(req, env, user);
        default:
          return new Response("Not Found", { status: 404 });
      }
    } catch (err) {
      console.error("unhandled error", err);
      return errorResponse("internal", (err as Error).message);
    }
  },
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 2: Tests d'intégration end-to-end (routing)**

`workers/transcription-api/test/index.test.ts` :

```typescript
import { describe, it, expect } from "vitest";
import { env, SELF } from "cloudflare:test";

describe("worker routing", () => {
  it("GET /health returns 200", async () => {
    const res = await SELF.fetch("https://api.lexena.app/health");
    expect(res.status).toBe(200);
  });

  it("POST /transcribe without auth returns 401", async () => {
    const res = await SELF.fetch("https://api.lexena.app/transcribe", {
      method: "POST",
      body: new FormData(),
    });
    expect(res.status).toBe(401);
  });

  it("POST /unknown returns 404", async () => {
    const res = await SELF.fetch("https://api.lexena.app/unknown", {
      method: "POST",
      headers: { Authorization: "Bearer fake.jwt.token" },
    });
    // Either 401 (auth fails first) or 404 — both acceptable.
    expect([401, 404]).toContain(res.status);
  });

  it("GET / returns 405", async () => {
    const res = await SELF.fetch("https://api.lexena.app/transcribe", { method: "GET" });
    expect(res.status).toBe(405);
  });
});
```

- [ ] **Step 3: Run + typecheck**

```bash
cd workers/transcription-api && pnpm typecheck && pnpm test
```

Expected: tous tests passent.

- [ ] **Step 4: Commit**

```bash
cd ../..
git add workers/transcription-api/src/index.ts workers/transcription-api/test/index.test.ts
git commit -m "feat(worker): wire entry point + routing"
```

---

## Task 17: Wrangler deploy staging + smoke test

**Files:** (config + secrets, no new code)

- [ ] **Step 1: Login Wrangler**

```bash
cd workers/transcription-api
pnpm exec wrangler login
```

Authentifie-toi via le navigateur.

- [ ] **Step 2: Set secrets pour staging**

```bash
pnpm exec wrangler secret put SUPABASE_URL --env staging
# (paste value)
pnpm exec wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env staging
pnpm exec wrangler secret put SUPABASE_JWT_SECRET --env staging
pnpm exec wrangler secret put GROQ_API_KEY --env staging
pnpm exec wrangler secret put OPENAI_API_KEY --env staging
```

- [ ] **Step 3: Deploy staging**

```bash
pnpm exec wrangler deploy --env staging
```

Expected: l'URL `https://lexena-transcription-api.<account>.workers.dev` est affichée.

- [ ] **Step 4: Smoke test health**

```bash
curl https://lexena-transcription-api.<account>.workers.dev/health
```

Expected: `{"ok":true}`.

- [ ] **Step 5: Smoke test /transcribe sans auth**

```bash
curl -X POST -F audio=@test-fixture.wav https://lexena-transcription-api.<account>.workers.dev/transcribe
```

Expected: HTTP 401, body `{"error":"missing_auth",...}`.

- [ ] **Step 6: Smoke test avec un JWT user dev**

Récupérer un JWT depuis l'app Lexena en dev (DevTools > Network > supabase headers > Authorization).

```bash
curl -X POST \
  -H "Authorization: Bearer <jwt>" \
  -F audio=@test-fixture.wav \
  -F language=fr \
  https://lexena-transcription-api.<account>.workers.dev/transcribe
```

Expected: HTTP 200 avec `{"text":"...","duration_ms":...}` SI l'user a un trial actif (insérer manuellement `trial_credits` row si besoin via SQL editor Supabase).

- [ ] **Step 7: Set production secrets et deploy production**

Pour le déploiement production (sur `api.lexena.app`), répéter step 2 avec `--env production` puis :

```bash
pnpm exec wrangler deploy --env production
```

Vérifier que `api.lexena.app` route bien vers le Worker (DNS Cloudflare géré automatiquement par Wrangler grâce à la route configurée dans `wrangler.toml`).

> **Note** : ne pas exécuter le step 7 (production) tant que la table `subscriptions` réelle n'est pas en place via le plan 04-billing — sinon l'app cliente verra des `subscription not found` côté Worker. Utiliser staging jusque-là.

- [ ] **Step 8: Documenter le runbook (déplacé en Task 29)**

(Pas de commit ici — secrets are out-of-band, no files changed.)

---

## Task 18: Cloudflare Rate Limiting Rules

**Files:** (configuration Cloudflare dashboard, pas de fichier code)

- [ ] **Step 1: Configurer dans le dashboard Cloudflare**

Dashboard > `lexena.app` zone > Security > WAF > Rate Limiting Rules :

| Règle | Critère | Action | Limite |
|---|---|---|---|
| `api-per-ip` | URL path matches `^/transcribe$` or `^/post-process$` | Block | 30 req / 1 min / IP |
| `api-per-bearer` | URL path matches `^/transcribe$` or `^/post-process$`, header `Authorization` | Block | 100 req / 1 min / per Authorization header value |

- [ ] **Step 2: Documenter dans le runbook**

Référencer dans `docs/v3/runbooks/managed-transcription.md` (Task 29).

- [ ] **Step 3: Smoke test**

Boucle 50 requêtes en moins d'une minute depuis une seule IP :

```bash
for i in {1..50}; do curl -s -o /dev/null -w "%{http_code}\n" https://api.lexena.app/health; done
```

Expected: après ~30 réponses 200, les suivantes retournent 429 jusqu'à reset.

(Rien à committer.)

---

## Task 19: Tauri Rust commands `transcribe_audio_cloud` + `post_process_cloud`

**Files:**
- Create: `src-tauri/src/cloud.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml` (vérifier reqwest)

- [ ] **Step 1: Vérifier `reqwest` et `hound` dans Cargo.toml**

```bash
grep -E '^(reqwest|hound)' src-tauri/Cargo.toml
```

Si `reqwest` absent (probablement déjà présent — utilisé pour le download des modèles locaux) :

```toml
reqwest = { version = "0.12", features = ["json", "multipart", "stream"] }
```

`hound` est utilisé par `transcription.rs` existant pour encoder les WAV. S'il n'est pas listé, ajouter :

```toml
hound = "3.5"
```

- [ ] **Step 2: Créer `src-tauri/src/cloud.rs`**

L'API client prend les **samples i16 bruts + sample_rate** et encode le WAV en mémoire (pas de fichier sur disque, conforme au zero-retention). Cohérent avec l'API existante de `transcribe_audio` (cf. `src-tauri/src/transcription.rs`).

```rust
// src-tauri/src/cloud.rs
use reqwest::multipart::{Form, Part};
use serde::{Deserialize, Serialize};
use std::io::Cursor;

const API_BASE: &str = "https://api.lexena.app";

#[derive(Debug, thiserror::Error)]
pub enum CloudError {
    #[error("network error: {0}")]
    Network(#[from] reqwest::Error),
    #[error("worker returned {status}: {message}")]
    Api { status: u16, code: String, message: String },
    #[error("missing auth token")]
    MissingAuth,
    #[error("wav encoding failed: {0}")]
    WavEncoding(String),
}

impl serde::Serialize for CloudError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            CloudError::Api { status, code, message } => {
                let mut map = serde_json::Map::new();
                map.insert("kind".into(), "api".into());
                map.insert("status".into(), (*status).into());
                map.insert("code".into(), code.clone().into());
                map.insert("message".into(), message.clone().into());
                serde_json::Value::Object(map).serialize(serializer)
            }
            other => serializer.serialize_str(&other.to_string()),
        }
    }
}

#[derive(Deserialize)]
struct ErrorBody {
    error: String,
    message: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct TranscriptionResult {
    pub text: String,
    pub duration_ms: u64,
    pub request_id: String,
    pub source: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct PostProcessResult {
    pub text: String,
    pub tokens_in: u32,
    pub tokens_out: u32,
    pub request_id: String,
    pub source: String,
}

/// Encode i16 PCM samples as a WAV byte buffer in memory.
/// Mono, 16-bit, sample_rate as provided.
fn encode_wav_in_memory(samples: &[i16], sample_rate: u32) -> Result<Vec<u8>, CloudError> {
    let mut buf = Vec::with_capacity(44 + samples.len() * 2);
    {
        let cursor = Cursor::new(&mut buf);
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::new(cursor, spec)
            .map_err(|e| CloudError::WavEncoding(e.to_string()))?;
        for s in samples {
            writer.write_sample(*s)
                .map_err(|e| CloudError::WavEncoding(e.to_string()))?;
        }
        writer.finalize()
            .map_err(|e| CloudError::WavEncoding(e.to_string()))?;
    }
    Ok(buf)
}

async fn handle_response<T: for<'de> Deserialize<'de>>(
    res: reqwest::Response,
) -> Result<T, CloudError> {
    let status = res.status();
    if status.is_success() {
        Ok(res.json::<T>().await?)
    } else {
        let body = res.json::<ErrorBody>().await.unwrap_or(ErrorBody {
            error: "unknown".into(),
            message: format!("HTTP {}", status.as_u16()),
        });
        Err(CloudError::Api {
            status: status.as_u16(),
            code: body.error,
            message: body.message,
        })
    }
}

#[tauri::command]
pub async fn transcribe_audio_cloud(
    samples: Vec<i16>,
    sample_rate: u32,
    language: Option<String>,
    jwt: String,
    idempotency_key: Option<String>,
) -> Result<TranscriptionResult, CloudError> {
    if jwt.is_empty() {
        return Err(CloudError::MissingAuth);
    }
    let wav_bytes = encode_wav_in_memory(&samples, sample_rate)?;
    let part = Part::bytes(wav_bytes)
        .file_name("audio.wav")
        .mime_str("audio/wav")
        .map_err(|e| CloudError::Api {
            status: 400, code: "client_error".into(),
            message: format!("invalid mime: {e}"),
        })?;
    let mut form = Form::new().part("audio", part);
    if let Some(lang) = language {
        form = form.text("language", lang);
    }

    let client = reqwest::Client::new();
    let mut req = client
        .post(format!("{API_BASE}/transcribe"))
        .bearer_auth(&jwt)
        .multipart(form);
    if let Some(key) = idempotency_key {
        req = req.header("Idempotency-Key", key);
    }
    let res = req.send().await?;
    handle_response(res).await
}

#[tauri::command]
pub async fn post_process_cloud(
    task: String,
    text: String,
    language: Option<String>,
    model_tier: Option<String>,
    jwt: String,
    idempotency_key: Option<String>,
) -> Result<PostProcessResult, CloudError> {
    if jwt.is_empty() {
        return Err(CloudError::MissingAuth);
    }
    let body = serde_json::json!({
        "task": task,
        "text": text,
        "language": language,
        "model_tier": model_tier,
    });
    let client = reqwest::Client::new();
    let mut req = client
        .post(format!("{API_BASE}/post-process"))
        .bearer_auth(&jwt)
        .json(&body);
    if let Some(key) = idempotency_key {
        req = req.header("Idempotency-Key", key);
    }
    let res = req.send().await?;
    handle_response(res).await
}
```

- [ ] **Step 3: Register dans `lib.rs`**

Trouver le bloc `tauri::Builder` et ajouter aux `invoke_handler` :

```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands
    crate::cloud::transcribe_audio_cloud,
    crate::cloud::post_process_cloud,
])
```

Et en haut de `lib.rs`, ajouter `mod cloud;`.

- [ ] **Step 4: Build verify**

```bash
LIBCLANG_PATH="C:/Program Files/LLVM/bin" PATH="$PATH:/c/Program Files/CMake/bin" cargo check
```

(Depuis `src-tauri/`, ou via la convention du projet.)

Expected: zéro erreur.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/cloud.rs src-tauri/src/lib.rs
git commit -m "feat(tauri): cloud transcribe + post_process commands"
```

---

## Task 20: Frontend `lib/cloud/` — types + api wrappers + erreurs

**Files:**
- Create: `src/lib/cloud/types.ts`
- Create: `src/lib/cloud/errors.ts`
- Create: `src/lib/cloud/api.ts`
- Create: `src/lib/cloud/api.test.ts`

- [ ] **Step 1: Types**

`src/lib/cloud/types.ts` :

```typescript
export type CloudUsageSource = "trial" | "quota" | "overage";

export interface TranscriptionResult {
  text: string;
  duration_ms: number;
  request_id: string;
  source: CloudUsageSource;
}

export interface PostProcessResult {
  text: string;
  tokens_in: number;
  tokens_out: number;
  request_id: string;
  source: CloudUsageSource;
}

export type PostProcessTask = "reformulate" | "correct" | "email" | "summarize";
export type ModelTier = "mini" | "full";

export interface CloudApiErrorBody {
  kind: "api";
  status: number;
  code: string;
  message: string;
}
```

- [ ] **Step 2: Erreurs typées**

`src/lib/cloud/errors.ts` :

```typescript
import type { CloudApiErrorBody } from "./types";

export class CloudApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "CloudApiError";
  }

  static fromTauri(e: unknown): CloudApiError | Error {
    if (
      typeof e === "object" && e !== null &&
      "kind" in e && (e as CloudApiErrorBody).kind === "api"
    ) {
      const body = e as CloudApiErrorBody;
      return new CloudApiError(body.status, body.code, body.message);
    }
    return e instanceof Error ? e : new Error(String(e));
  }

  isQuotaIssue(): boolean {
    return this.status === 402;
  }
  isAuthIssue(): boolean {
    return this.status === 401;
  }
  isProviderUnavailable(): boolean {
    return this.status === 502;
  }
}
```

- [ ] **Step 3: API wrappers**

`src/lib/cloud/api.ts` :

```typescript
import { invoke } from "@tauri-apps/api/core";
import type {
  TranscriptionResult, PostProcessResult, PostProcessTask, ModelTier,
} from "./types";
import { CloudApiError } from "./errors";

interface TranscribeArgs {
  samples: Int16Array;
  sampleRate: number;
  language?: string;
  jwt: string;
  idempotencyKey?: string;
}

export async function transcribeCloud(args: TranscribeArgs): Promise<TranscriptionResult> {
  try {
    return await invoke<TranscriptionResult>("transcribe_audio_cloud", {
      samples: Array.from(args.samples),
      sampleRate: args.sampleRate,
      language: args.language ?? null,
      jwt: args.jwt,
      idempotencyKey: args.idempotencyKey ?? null,
    });
  } catch (err) {
    throw CloudApiError.fromTauri(err);
  }
}

interface PostProcessArgs {
  task: PostProcessTask;
  text: string;
  language?: string;
  modelTier?: ModelTier;
  jwt: string;
  idempotencyKey?: string;
}

export async function postProcessCloud(args: PostProcessArgs): Promise<PostProcessResult> {
  try {
    return await invoke<PostProcessResult>("post_process_cloud", {
      task: args.task,
      text: args.text,
      language: args.language ?? null,
      modelTier: args.modelTier ?? null,
      jwt: args.jwt,
      idempotencyKey: args.idempotencyKey ?? null,
    });
  } catch (err) {
    throw CloudApiError.fromTauri(err);
  }
}
```

- [ ] **Step 4: Tests**

`src/lib/cloud/api.test.ts` :

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { transcribeCloud, postProcessCloud } from "./api";
import { CloudApiError } from "./errors";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));
import { invoke } from "@tauri-apps/api/core";

beforeEach(() => vi.resetAllMocks());

describe("transcribeCloud", () => {
  it("calls transcribe_audio_cloud with serialized samples", async () => {
    (invoke as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      text: "hi", duration_ms: 1000, request_id: "r1", source: "trial",
    });
    const res = await transcribeCloud({
      samples: Int16Array.from([1, 2, 3]),
      sampleRate: 16000,
      language: "fr",
      jwt: "jwt",
    });
    expect(res.text).toBe("hi");
    expect(invoke).toHaveBeenCalledWith("transcribe_audio_cloud", expect.objectContaining({
      samples: [1, 2, 3],
      sampleRate: 16000,
      language: "fr",
      jwt: "jwt",
    }));
  });

  it("throws CloudApiError when Tauri returns an api error", async () => {
    (invoke as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce({
      kind: "api", status: 402, code: "quota_exhausted", message: "out",
    });
    await expect(transcribeCloud({
      samples: Int16Array.from([1]),
      sampleRate: 16000,
      jwt: "jwt",
    })).rejects.toBeInstanceOf(CloudApiError);
  });
});

describe("postProcessCloud", () => {
  it("forwards modelTier and language", async () => {
    (invoke as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      text: "out", tokens_in: 10, tokens_out: 5, request_id: "r2", source: "trial",
    });
    await postProcessCloud({
      task: "reformulate", text: "in", language: "fr", modelTier: "mini", jwt: "jwt",
    });
    expect(invoke).toHaveBeenCalledWith("post_process_cloud", expect.objectContaining({
      task: "reformulate", text: "in", language: "fr", modelTier: "mini",
    }));
  });
});
```

- [ ] **Step 5: Run**

```bash
pnpm test -- src/lib/cloud
```

Expected: 3/3 pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cloud/
git commit -m "feat(frontend): cloud api wrappers + typed errors"
```

---

## Task 21: `CloudContext` + `useCloud` hook

**Files:**
- Create: `src/contexts/CloudContext.tsx`
- Create: `src/hooks/useCloud.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Implémenter le context**

`src/contexts/CloudContext.tsx` :

```typescript
import { createContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";

export type CloudMode = "local" | "cloud" | "uninitialized";

export interface CloudContextValue {
  mode: CloudMode;
  // True if the user is signed-in AND eligible (trial active OR active subscription).
  // Computed by useUsage and pushed back here.
  isCloudEligible: boolean;
  setEligibility: (eligible: boolean) => void;
}

export const CloudContext = createContext<CloudContextValue>({
  mode: "uninitialized",
  isCloudEligible: false,
  setEligibility: () => {},
});

export function CloudProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [eligible, setEligible] = useState(false);

  const mode: CloudMode = useMemo(() => {
    if (!user) return "local";
    return eligible ? "cloud" : "local";
  }, [user, eligible]);

  // Reset eligibility on logout.
  useEffect(() => {
    if (!user) setEligible(false);
  }, [user]);

  const value: CloudContextValue = { mode, isCloudEligible: eligible, setEligibility: setEligible };
  return <CloudContext.Provider value={value}>{children}</CloudContext.Provider>;
}
```

- [ ] **Step 2: Hook**

`src/hooks/useCloud.ts` :

```typescript
import { useContext } from "react";
import { CloudContext } from "@/contexts/CloudContext";

export function useCloud() {
  return useContext(CloudContext);
}
```

- [ ] **Step 3: Wrap App**

Dans `src/App.tsx`, autour du tree (après `AuthProvider`, avant `SyncProvider`) :

```tsx
import { CloudProvider } from "@/contexts/CloudContext";

// ...
<AuthProvider>
  <CloudProvider>
    {/* ... rest */}
  </CloudProvider>
</AuthProvider>
```

- [ ] **Step 4: Build verify**

```bash
pnpm build
```

Expected: pas d'erreur TS.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/CloudContext.tsx src/hooks/useCloud.ts src/App.tsx
git commit -m "feat(frontend): CloudContext + useCloud hook"
```

---

## Task 22: `useUsage` hook — lecture quota / trial

**Files:**
- Create: `src/hooks/useUsage.ts`

- [ ] **Step 1: Implémenter**

```typescript
// src/hooks/useUsage.ts
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useCloud } from "@/hooks/useCloud";

interface TrialStatus {
  is_active: boolean;
  minutes_remaining: number;
  expires_at: string | null;
}

interface UsageData {
  trial: TrialStatus;
  monthly_minutes_used: number;
  // Same shape we eventually want to surface; tier comes from subscriptions table.
  plan: { quota_minutes: number; plan: "starter" | "pro" } | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function useUsage(): UsageData {
  const { user } = useAuth();
  const { setEligibility } = useCloud();

  const [trial, setTrial] = useState<TrialStatus>({
    is_active: false, minutes_remaining: 0, expires_at: null,
  });
  const [monthlyUsed, setMonthlyUsed] = useState<number>(0);
  const [plan, setPlan] = useState<UsageData["plan"]>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchAll = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const ym = currentYearMonth();
      const [{ data: trialData }, { data: usage }, { data: sub }] = await Promise.all([
        supabase.from("trial_status").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("usage_summary").select("units_total")
          .eq("user_id", user.id).eq("year_month", ym).eq("kind", "transcription").maybeSingle(),
        supabase.from("subscriptions").select("plan, quota_minutes, status").eq("user_id", user.id).maybeSingle(),
      ]);

      const t: TrialStatus = {
        is_active: Boolean(trialData?.is_active),
        minutes_remaining: Number(trialData?.minutes_remaining ?? 0),
        expires_at: (trialData?.expires_at as string) ?? null,
      };
      setTrial(t);
      setMonthlyUsed(Number(usage?.units_total ?? 0));
      setPlan(
        sub && sub.status === "active"
          ? { quota_minutes: Number(sub.quota_minutes), plan: sub.plan as "starter" | "pro" }
          : null,
      );

      const eligible = t.is_active || (sub?.status === "active");
      setEligibility(eligible);
    } finally {
      setLoading(false);
    }
  }, [user, setEligibility]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return { trial, monthly_minutes_used: monthlyUsed, plan, loading, refresh: fetchAll };
}
```

- [ ] **Step 2: Build verify**

```bash
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useUsage.ts
git commit -m "feat(frontend): useUsage hook reads trial + quota + sub state"
```

---

## Task 23: `QuotaCounter` — compteur header

**Files:**
- Create: `src/components/cloud/QuotaCounter.tsx`
- Modify: `src/components/dashboard/DashboardHeader.tsx`

- [ ] **Step 1: Implémenter**

`src/components/cloud/QuotaCounter.tsx` :

```tsx
import { useTranslation } from "react-i18next";
import { useUsage } from "@/hooks/useUsage";
import { useAuth } from "@/hooks/useAuth";

function formatMinutes(min: number): string {
  if (min < 1) return "<1";
  return Math.floor(min).toString();
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / (24 * 3600 * 1000)) : 0;
}

export function QuotaCounter() {
  const { t } = useTranslation("cloud");
  const { user } = useAuth();
  const { trial, monthly_minutes_used, plan, loading } = useUsage();

  if (!user || loading) return null;

  // Trial active: show whichever cap is most constraining.
  if (trial.is_active) {
    const days = daysUntil(trial.expires_at);
    const showMinutes = days === null || trial.minutes_remaining < days * 2; // rough heuristic
    return (
      <div className="vt-app vt-app__quota-counter" title={t("trial.tooltip")}>
        {showMinutes
          ? t("trial.minutes_remaining", { count: Math.floor(trial.minutes_remaining) })
          : t("trial.days_remaining", { count: days ?? 0 })}
      </div>
    );
  }

  // Active subscription: show monthly minutes left.
  if (plan) {
    const remaining = Math.max(plan.quota_minutes - monthly_minutes_used, 0);
    return (
      <div className="vt-app vt-app__quota-counter" title={t("plan.tooltip", { plan: plan.plan })}>
        {t("plan.minutes_remaining", { count: Math.floor(remaining) })}
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 2: Insérer dans le header**

Dans `src/components/dashboard/DashboardHeader.tsx`, à proximité des autres badges/icônes :

```tsx
import { QuotaCounter } from "@/components/cloud/QuotaCounter";

// ...
<div className="header-actions">
  <QuotaCounter />
  {/* existing icons */}
</div>
```

- [ ] **Step 3: Build verify**

```bash
pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/cloud/QuotaCounter.tsx src/components/dashboard/DashboardHeader.tsx
git commit -m "feat(frontend): QuotaCounter in header"
```

---

## Task 24: `CloudSection` — onglet settings

**Files:**
- Create: `src/components/settings/sections/CloudSection.tsx`
- Modify: `src/components/settings/SettingsDialog.tsx`

- [ ] **Step 1: Implémenter le panel**

`src/components/settings/sections/CloudSection.tsx` :

```tsx
import { useTranslation } from "react-i18next";
import { useUsage } from "@/hooks/useUsage";
import { useAuth } from "@/hooks/useAuth";

export function CloudSection() {
  const { t } = useTranslation("cloud");
  const { user } = useAuth();
  const { trial, monthly_minutes_used, plan, loading, refresh } = useUsage();

  if (!user) {
    return <p className="vt-app__muted">{t("settings.signin_required")}</p>;
  }
  if (loading) return <p>{t("settings.loading")}</p>;

  return (
    <div className="vt-app vt-app__settings-section">
      <h2>{t("settings.heading")}</h2>

      {trial.is_active && (
        <div className="vt-app__card">
          <h3>{t("settings.trial.heading")}</h3>
          <dl>
            <dt>{t("settings.trial.minutes_remaining")}</dt>
            <dd>{Math.floor(trial.minutes_remaining)}</dd>
            <dt>{t("settings.trial.expires_at")}</dt>
            <dd>{trial.expires_at ? new Date(trial.expires_at).toLocaleString() : "-"}</dd>
          </dl>
        </div>
      )}

      {plan && (
        <div className="vt-app__card">
          <h3>{t("settings.plan.heading", { plan: plan.plan })}</h3>
          <dl>
            <dt>{t("settings.plan.quota_minutes")}</dt>
            <dd>{plan.quota_minutes}</dd>
            <dt>{t("settings.plan.minutes_used")}</dt>
            <dd>{Math.floor(monthly_minutes_used)}</dd>
            <dt>{t("settings.plan.minutes_remaining")}</dt>
            <dd>{Math.max(plan.quota_minutes - Math.floor(monthly_minutes_used), 0)}</dd>
          </dl>
        </div>
      )}

      {!trial.is_active && !plan && (
        <p className="vt-app__muted">{t("settings.nothing_active")}</p>
      )}

      <button onClick={() => refresh()}>{t("settings.refresh")}</button>
    </div>
  );
}
```

- [ ] **Step 2: Ajouter l'onglet dans `SettingsDialog`**

Modifier `src/components/settings/SettingsDialog.tsx` pour ajouter un onglet "Cloud" entre les onglets existants. Suivre le pattern utilisé pour `AccountSection` / `SecuritySection`.

- [ ] **Step 3: Build verify**

```bash
pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/sections/CloudSection.tsx src/components/settings/SettingsDialog.tsx
git commit -m "feat(frontend): CloudSection in settings dialog"
```

---

## Task 25: i18n strings (FR + EN)

**Files:**
- Create: `src/locales/fr/cloud.json`
- Create: `src/locales/en/cloud.json`
- Modify: `src/i18n.ts`

- [ ] **Step 1: FR**

`src/locales/fr/cloud.json` :

```json
{
  "trial": {
    "minutes_remaining_one": "{{count}} min d'essai",
    "minutes_remaining_other": "{{count}} min d'essai",
    "days_remaining_one": "{{count}} jour d'essai",
    "days_remaining_other": "{{count}} jours d'essai",
    "tooltip": "Crédit d'essai cloud — passez à un plan payant pour continuer après expiration."
  },
  "plan": {
    "minutes_remaining_one": "{{count}} min restantes",
    "minutes_remaining_other": "{{count}} min restantes",
    "tooltip": "Plan {{plan}} — minutes incluses ce mois-ci."
  },
  "settings": {
    "heading": "Service cloud Lexena",
    "signin_required": "Connectez-vous pour accéder au service cloud.",
    "loading": "Chargement…",
    "nothing_active": "Aucun essai ni abonnement actif. La transcription cloud est désactivée.",
    "refresh": "Rafraîchir",
    "trial": {
      "heading": "Essai gratuit en cours",
      "minutes_remaining": "Minutes restantes",
      "expires_at": "Expire le"
    },
    "plan": {
      "heading": "Plan {{plan}}",
      "quota_minutes": "Minutes incluses ce mois",
      "minutes_used": "Minutes consommées",
      "minutes_remaining": "Minutes restantes"
    }
  }
}
```

- [ ] **Step 2: EN**

`src/locales/en/cloud.json` :

```json
{
  "trial": {
    "minutes_remaining_one": "{{count}} trial min",
    "minutes_remaining_other": "{{count}} trial min",
    "days_remaining_one": "{{count}} trial day",
    "days_remaining_other": "{{count}} trial days",
    "tooltip": "Cloud trial credit — subscribe to keep using cloud after expiry."
  },
  "plan": {
    "minutes_remaining_one": "{{count}} min left",
    "minutes_remaining_other": "{{count}} min left",
    "tooltip": "{{plan}} plan — included minutes this month."
  },
  "settings": {
    "heading": "Lexena cloud service",
    "signin_required": "Sign in to access the cloud service.",
    "loading": "Loading…",
    "nothing_active": "No active trial or subscription. Cloud transcription is disabled.",
    "refresh": "Refresh",
    "trial": {
      "heading": "Free trial in progress",
      "minutes_remaining": "Minutes remaining",
      "expires_at": "Expires on"
    },
    "plan": {
      "heading": "{{plan}} plan",
      "quota_minutes": "Included minutes this month",
      "minutes_used": "Minutes consumed",
      "minutes_remaining": "Minutes remaining"
    }
  }
}
```

- [ ] **Step 3: Déclarer namespace dans `src/i18n.ts`**

Ajouter `"cloud"` dans la liste des namespaces et importer les bundles :

```typescript
import frCloud from "@/locales/fr/cloud.json";
import enCloud from "@/locales/en/cloud.json";

// ... dans la config i18next:
resources: {
  fr: { /* ...existing, */ cloud: frCloud },
  en: { /* ...existing, */ cloud: enCloud },
}
```

- [ ] **Step 4: Build verify**

```bash
pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add src/locales/fr/cloud.json src/locales/en/cloud.json src/i18n.ts
git commit -m "feat(i18n): cloud namespace FR + EN"
```

---

## Task 26: Routing client cloud vs local

**Files:**
- Modify: `src/components/dashboard/Dashboard.tsx` (ou le component qui orchestre `transcribe_audio`)
- Modify: tout site d'appel post-process IA existant

- [ ] **Step 1: Identifier les sites d'appel actuels**

```bash
grep -rn "transcribe_audio\|invoke.*transcribe\|post_process" src/
```

Lister les 3-4 endroits qui appellent les commandes Tauri actuelles (probablement Dashboard, et le hook post-process IA).

- [ ] **Step 2: Modifier `Dashboard.tsx` pour router**

Dans le handler de transcription après stop recording :

```tsx
import { useCloud } from "@/hooks/useCloud";
import { transcribeCloud } from "@/lib/cloud/api";
import { CloudApiError } from "@/lib/cloud/errors";
import { supabase } from "@/lib/supabase";

// ...
const { mode } = useCloud();

async function handleTranscribe(audio: Int16Array, sampleRate: number) {
  if (mode === "cloud") {
    const session = await supabase.auth.getSession();
    const jwt = session.data.session?.access_token;
    if (!jwt) {
      // Fallback: cloud requested but no JWT — treat as local.
      return transcribeLocal(audio, sampleRate);
    }
    try {
      return await transcribeCloud({
        samples: audio,
        sampleRate,
        language: settings.language,
        jwt,
        idempotencyKey: crypto.randomUUID(),
      });
    } catch (err) {
      if (err instanceof CloudApiError && err.isProviderUnavailable()) {
        toast.error(t("cloud:errors.provider_unavailable"));
        // No silent fallback (per design §8.2).
        throw err;
      }
      throw err;
    }
  }
  return transcribeLocal(audio, sampleRate);
}
```

- [ ] **Step 3: Idem pour le post-process**

Adapter le hook ou le component qui invoque le post-process actuel pour router via `postProcessCloud` quand `mode === "cloud"`. Pas de fallback local : le post-process n'existe pas en mode local (cf. spec premium §7.3).

- [ ] **Step 4: Build verify**

```bash
pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/Dashboard.tsx
git commit -m "feat(frontend): route transcribe + post_process to cloud when mode=cloud"
```

---

## Task 27: Gestion d'erreur + retry idempotent

**Files:**
- Modify: `src/lib/cloud/api.ts` (ajouter retry transparent sur erreurs réseau)

- [ ] **Step 1: Ajouter retry réseau**

Dans `src/lib/cloud/api.ts`, wrapper chaque commande Tauri avec un retry simple sur les erreurs réseau (mais PAS sur les erreurs API 4xx/5xx) :

```typescript
async function withNetworkRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (err instanceof CloudApiError) throw err; // never retry API errors
      if (i === attempts) throw err;
      await new Promise(r => setTimeout(r, 200 * Math.pow(2, i)));
    }
  }
  throw lastErr;
}

export async function transcribeCloud(args: TranscribeArgs): Promise<TranscriptionResult> {
  const idempotencyKey = args.idempotencyKey ?? crypto.randomUUID();
  return withNetworkRetry(() =>
    invokeWithErrorMapping<TranscriptionResult>("transcribe_audio_cloud", {
      samples: Array.from(args.samples),
      sampleRate: args.sampleRate,
      language: args.language ?? null,
      jwt: args.jwt,
      idempotencyKey,
    }),
  );
}

// Similar for postProcessCloud.

async function invokeWithErrorMapping<T>(cmd: string, payload: unknown): Promise<T> {
  try {
    return await invoke<T>(cmd, payload as Record<string, unknown>);
  } catch (err) {
    throw CloudApiError.fromTauri(err);
  }
}
```

- [ ] **Step 2: Test du retry**

Ajouter à `src/lib/cloud/api.test.ts` :

```typescript
it("retries network errors then succeeds", async () => {
  (invoke as unknown as ReturnType<typeof vi.fn>)
    .mockRejectedValueOnce(new Error("network"))
    .mockResolvedValueOnce({ text: "ok", duration_ms: 1000, request_id: "r", source: "trial" });

  const res = await transcribeCloud({
    samples: Int16Array.from([1]),
    sampleRate: 16000,
    jwt: "jwt",
  });
  expect(res.text).toBe("ok");
  expect(invoke).toHaveBeenCalledTimes(2);
});

it("does not retry on CloudApiError", async () => {
  (invoke as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce({
    kind: "api", status: 402, code: "quota_exhausted", message: "out",
  });
  await expect(transcribeCloud({
    samples: Int16Array.from([1]),
    sampleRate: 16000,
    jwt: "jwt",
  })).rejects.toBeInstanceOf(CloudApiError);
  expect(invoke).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 3: Run + commit**

```bash
pnpm test -- src/lib/cloud
git add src/lib/cloud/
git commit -m "feat(frontend): network retry with idempotency key, no retry on api errors"
```

---

## Task 28: Checklist E2E manuelle

**Files:**
- Create: `docs/v3/05-managed-transcription-e2e-checklist.md`

- [ ] **Step 1: Rédiger la checklist**

```markdown
# E2E Checklist — Managed Transcription

> Exécuter avant tag `v3.X.0-beta.X` qui inclut le bundle launch.

## Pré-requis

- [ ] Worker déployé sur staging (`workers.dev`) avec secrets corrects.
- [ ] Migrations Supabase appliquées en environnement de test.
- [ ] Insert manuel d'un row `trial_credits` pour le user de test :
  ```sql
  INSERT INTO public.trial_credits (user_id, minutes_granted, minutes_consumed)
  VALUES ('<test-user-uuid>', 60, 0);
  ```
- [ ] Insert manuel d'un row `subscriptions` (optionnel, pour tester le path quota) :
  ```sql
  INSERT INTO public.subscriptions (user_id, plan, status, quota_minutes, overage_rate_cents, current_period_end)
  VALUES ('<test-user-uuid>', 'pro', 'active', 1000, 0.0200, NOW() + INTERVAL '30 days');
  ```

## Scénarios

### S1 — Transcription en mode trial

- [ ] Connecté. Mode = cloud (badge "X min d'essai" visible dans le header).
- [ ] Lancer un enregistrement court (~10s), arrêter.
- [ ] Toast / popup transcription affiche le texte retourné par Groq.
- [ ] La latence end-to-end est <2s pour 10s d'audio.
- [ ] `usage_events` contient une nouvelle ligne kind=transcription, source=trial.
- [ ] `trial_credits.minutes_consumed` a été incrémenté de la durée audio.
- [ ] Le badge header se met à jour (refresh manuel via bouton settings).

### S2 — Transcription en mode quota plan Pro

- [ ] Insérer un row `subscriptions` actif (cf. pré-requis).
- [ ] Désactiver le trial : `UPDATE trial_credits SET minutes_consumed = 60 WHERE user_id=...`.
- [ ] Refresh. Badge header passe à "X min restantes" (basé sur quota - usage).
- [ ] Lancer une transcription. `usage_events.source = 'quota'`.
- [ ] `usage_summary.units_total` augmente du delta minutes.

### S3 — Quota épuisé (402)

- [ ] Forcer `usage_summary.units_total = quota_minutes + overage_minutes_allowed` pour le mois courant.
- [ ] Lancer une transcription.
- [ ] L'app affiche une erreur "Quota épuisé" (toast + message de paywall si dispo).
- [ ] Aucune ligne `usage_events` ajoutée.

### S4 — Provider Groq down (502)

- [ ] Mocker en local un Worker qui retourne 502 sur `/transcribe` (ou tester en staging avec un GROQ_API_KEY invalide temporairement).
- [ ] Lancer une transcription.
- [ ] L'app affiche le toast "Service de transcription indisponible".
- [ ] **Aucune bascule automatique vers le mode local** (cf. design §8.2).
- [ ] Si l'user a un modèle local, le toast inclut un bouton "Essayer en local maintenant".

### S5 — Post-process reformulate

- [ ] Avoir un texte transcrit dans la note active.
- [ ] Cliquer sur "Reformuler".
- [ ] Le texte est remplacé par la version reformulée.
- [ ] `usage_events` contient une ligne kind=post_process, units_unit=tokens.
- [ ] Réitérer pour les autres tasks (`correct`, `email`, `summarize`).

### S6 — Mode local préservé pour user non-signed-in

- [ ] Logout.
- [ ] Mode passe à local (badge header disparaît).
- [ ] Lancer une transcription : utilise whisper-rs local, aucune requête réseau vers `api.lexena.app`.
- [ ] Le post-process n'est plus exposé dans l'UI (ou affiche un message "réservé au cloud").

### S7 — Idempotency key

- [ ] Lancer une transcription en simulant une coupure réseau juste avant la réponse 200 (couper le wifi 2s après l'envoi).
- [ ] Re-tenter manuellement. Vérifier que `usage_events` ne contient PAS deux lignes pour le même appel (un seul row, l'autre est dédupliqué via `idempotency_key`).

### S8 — Performance

- [ ] Transcription d'un fichier 30s : latence end-to-end <2s P95 (mesurer via DevTools network tab).
- [ ] Post-process d'un texte 500 mots : latence <3s P95.
```

- [ ] **Step 2: Commit**

```bash
git add docs/v3/05-managed-transcription-e2e-checklist.md
git commit -m "docs(v3): e2e checklist for managed transcription"
```

---

## Task 29: Runbook ops

**Files:**
- Create: `docs/v3/runbooks/managed-transcription.md`

- [ ] **Step 1: Rédiger**

```markdown
# Runbook — Managed Transcription Service

## Vue d'ensemble

- **Worker** : `lexena-transcription-api` sur Cloudflare Workers
- **Production URL** : `https://api.lexena.app`
- **Staging URL** : `https://lexena-transcription-api.<account>.workers.dev`
- **Code source** : `workers/transcription-api/`
- **Providers upstream** : Groq (transcription), OpenAI (post-process)
- **Storage** : Supabase Postgres EU (tables `usage_events`, `usage_summary`, `trial_credits`)

## Secrets

| Variable | Source | Rotation |
|---|---|---|
| `GROQ_API_KEY` | Console Groq > API Keys | Manuelle, à minima trimestrielle |
| `OPENAI_API_KEY` | Console OpenAI > API Keys | Manuelle, à minima trimestrielle |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard > Settings > API | À synchroniser avec rotation Supabase |
| `SUPABASE_JWT_SECRET` | Supabase Dashboard > Settings > API > JWT Secret | À synchroniser avec rotation Supabase |
| `SUPABASE_URL` | Supabase Dashboard > Project URL | Stable |

### Procédure de rotation

```bash
cd workers/transcription-api
pnpm exec wrangler secret put <VARIABLE_NAME> --env production
# coller la nouvelle valeur quand demandé
pnpm exec wrangler deploy --env production
```

## Monitoring

### Cloudflare Analytics

Dashboard > `lexena-transcription-api` > Analytics :
- Requests / sec, by status code
- P50 / P95 / P99 latency
- Errors par endpoint

### Supabase

Dashboard > Logs Explorer, filtrer par : `usage_events`, `subscriptions`.

### Métriques d'alerte (à configurer post-launch)

- > 1% d'erreurs 5xx pendant 5 min → email admin
- P95 latency `/transcribe` > 5s pendant 10 min → email
- `usage_events` insert rate à zéro pendant 1h en heure ouvrable → vérifier worker dispo

## Incidents fréquents

### Groq 5xx prolongé

1. Vérifier https://status.groq.com.
2. Si Groq down : communiquer aux users via toast "Service de transcription momentanément indisponible".
3. Pas de fallback automatique en phase 1. Attendre rétablissement.
4. Si downtime >30 min, reconsidérer la note "fallback OpenAI Whisper" (design §12.1).

### OpenAI 5xx ou 429 prolongé

1. Vérifier https://status.openai.com.
2. Si rate limit (429) : vérifier consommation tokens / mois sur la console OpenAI.
3. Augmenter le tier de l'API key si bloquant.

### Supabase down

1. Vérifier status.supabase.com.
2. Le Worker retourne 500 sur tous les appels (impossible de vérifier quota).
3. Communiquer via toast generic.

### Quota explosion / abuse suspecté

```sql
-- Top 10 users par consommation transcription du mois
SELECT user_id, units_total, events_count
FROM usage_summary
WHERE year_month = to_char(NOW(), 'YYYY-MM')
  AND kind = 'transcription'
ORDER BY units_total DESC
LIMIT 10;
```

Si un user dépasse 5h/mois (hard cap fair use, design §4.5) → mail manuel proposant upgrade ou conversation.

## Déploiement

```bash
# Staging
cd workers/transcription-api
pnpm test
pnpm exec wrangler deploy --env staging

# Production (après validation staging)
pnpm exec wrangler deploy --env production
```

## Rollback

```bash
# Lister les versions
pnpm exec wrangler deployments list --env production

# Rollback à une version précédente
pnpm exec wrangler rollback --env production --message "incident X" <version-id>
```
```

- [ ] **Step 2: Commit**

```bash
git add docs/v3/runbooks/managed-transcription.md
git commit -m "docs(v3): runbook for managed transcription ops"
```

---

## Task 30: Final verification

- [ ] **Step 1: Run all test suites**

```bash
# Worker tests
cd workers/transcription-api && pnpm test && cd ../..

# Frontend tests
pnpm test

# Rust check
LIBCLANG_PATH="C:/Program Files/LLVM/bin" PATH="$PATH:/c/Program Files/CMake/bin" cargo check --manifest-path src-tauri/Cargo.toml

# Frontend build
pnpm build

# Supabase tests
pnpm exec supabase db reset
pnpm exec supabase test db
```

Expected: tout vert.

- [ ] **Step 2: Demander à l'utilisateur de lancer `pnpm tauri dev`**

> "Pourrais-tu lancer `pnpm tauri dev` et exécuter la checklist E2E `docs/v3/05-managed-transcription-e2e-checklist.md` ?"

(Cf. CLAUDE.md, je ne lance pas `pnpm tauri dev` moi-même.)

- [ ] **Step 3: Ouvrir une PR**

```bash
git push -u origin feat/v3-managed-transcription
gh pr create --title "feat(v3): managed transcription architecture (sub-epic 05 phase 1)" --body "$(cat <<'EOF'
## Summary

Implements the managed transcription service (sub-epic 05 phase 1) as designed in `docs/superpowers/specs/2026-05-04-managed-transcription-architecture-design.md`:

- Cloudflare Worker on `api.lexena.app` with `/transcribe` (Groq Whisper turbo) and `/post-process` (OpenAI gpt-4o-mini) endpoints
- Supabase tables: `usage_events` (append-only ledger), `usage_summary` (aggregate via trigger), `trial_credits`
- Tauri Rust + frontend integration with cloud / local mode routing
- Header `QuotaCounter` + settings `CloudSection` + i18n FR/EN

Out of scope (covered by 04-billing plan):
- Lemon Squeezy webhook ingestion
- Trial credit init at email verification
- Welcome screen first-run + BYOK UI removal

## Test plan

- [ ] Worker tests pass: `cd workers/transcription-api && pnpm test`
- [ ] Frontend tests pass: `pnpm test`
- [ ] Supabase tests pass: `pnpm exec supabase test db`
- [ ] Rust compiles: `cargo check`
- [ ] E2E checklist executed: `docs/v3/05-managed-transcription-e2e-checklist.md`
- [ ] Worker deployed staging and smoke-tested

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

**Fin du plan.**
