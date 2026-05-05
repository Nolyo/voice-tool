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
