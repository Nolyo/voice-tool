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
