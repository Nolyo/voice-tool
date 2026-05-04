-- Replace the Worker's after-insert RPC call with a Postgres trigger that debits
-- trial_credits in the same transaction as the usage_events INSERT. Atomic by
-- construction — if the bump fails the INSERT rolls back, so we never have an
-- event recorded without the matching trial debit.
--
-- DEPLOYMENT: this migration MUST be applied together with the Worker change
-- that removes the bump_trial_minutes RPC call from recordUsageEvent (see
-- workers/transcription-api/src/usage.ts). Applying this migration while the
-- old Worker is still live causes double-debits — the trigger and the RPC will
-- both run, debiting trial_credits twice per event. Push migration + redeploy
-- Worker simultaneously, or keep staging quiet during the window.
--
-- Pre-existing trg_usage_events_aggregate (which maintains usage_summary) is
-- untouched. Two triggers, two responsibilities, both fire on INSERT.

CREATE OR REPLACE FUNCTION public.bump_trial_on_usage_event()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.source = 'trial'
     AND NEW.kind = 'transcription'
     AND NEW.units_unit = 'minutes' THEN
    UPDATE public.trial_credits
       SET minutes_consumed = minutes_consumed + NEW.units
     WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_usage_events_trial_bump
  AFTER INSERT ON public.usage_events
  FOR EACH ROW EXECUTE FUNCTION public.bump_trial_on_usage_event();

COMMENT ON FUNCTION public.bump_trial_on_usage_event() IS
  'Debits trial_credits.minutes_consumed when a usage_events row is inserted with source=trial AND kind=transcription. Atomic with the INSERT.';
