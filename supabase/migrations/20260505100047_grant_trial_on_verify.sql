-- Auto-grant 60 min / 30 days trial on email verification.
-- Fires on the two paths a user becomes "verified":
--   1. INSERT with email_confirmed_at already set (OAuth, or email signup
--      while auth.email.enable_confirmations = false).
--   2. UPDATE OF email_confirmed_at from NULL to NOT NULL (magic link, or
--      email signup with confirmations enabled).
--
-- ON CONFLICT DO NOTHING makes it idempotent: if a row was manually inserted
-- (e.g. for a test user) or for any future re-verify edge case, we don't
-- overwrite an in-progress trial.
--
-- minutes_granted / started_at / expires_at all use the table defaults
-- (60 min, NOW(), NOW() + 30 days) — keeping the grant policy in one place
-- (the table definition).

CREATE OR REPLACE FUNCTION public.grant_trial_credits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.trial_credits (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_trial_credits() FROM PUBLIC;

CREATE TRIGGER grant_trial_on_user_insert
  AFTER INSERT ON auth.users
  FOR EACH ROW
  WHEN (NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.grant_trial_credits();

CREATE TRIGGER grant_trial_on_email_confirmed
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.grant_trial_credits();

COMMENT ON FUNCTION public.grant_trial_credits() IS
  'Inserts a trial_credits row (60 min / 30 days) for the user being verified. Idempotent via ON CONFLICT.';
