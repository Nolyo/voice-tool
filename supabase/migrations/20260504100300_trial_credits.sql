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
