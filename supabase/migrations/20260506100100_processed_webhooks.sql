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
