-- I4 follow-up: belt-and-suspenders guard against debiting trial_credits when
-- the trial has already expired.
--
-- Race scenario: the Worker pre-checks trial_status (which uses
-- expires_at > NOW()) before serving a transcription, but between that read
-- and the eventual usage_events INSERT, the trial may expire. Without this
-- guard, the trigger would still debit minutes_consumed on an inactive trial,
-- which is misleading (the audit row says "trial credit debited" for a trial
-- that no longer exists from the user's perspective).
--
-- INVARIANT CHANGE vs 20260504221727_atomic_trial_bump.sql:
-- The original migration claimed "if the bump fails the INSERT rolls back, so
-- we never have an event recorded without the matching trial debit." That
-- guarantee is intentionally relaxed here. After this migration, a usage_events
-- row inserted after trial expiry will be persisted (audit trail conserved)
-- but no debit will be applied. This is the correct trade-off:
--   - rare race (transcription already served by the Worker)
--   - no double-charge or user-facing block
--   - the event remains visible for audit / debugging
--
-- Only the function body changes; trg_usage_events_trial_bump (defined in the
-- previous migration) keeps pointing at the same function name.

CREATE OR REPLACE FUNCTION public.bump_trial_on_usage_event()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.source = 'trial'
     AND NEW.kind = 'transcription'
     AND NEW.units_unit = 'minutes' THEN
    UPDATE public.trial_credits
       SET minutes_consumed = minutes_consumed + NEW.units
     WHERE user_id = NEW.user_id
       AND expires_at > NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.bump_trial_on_usage_event() IS
  'Debits trial_credits.minutes_consumed when a usage_events row is inserted with source=trial AND kind=transcription AND the trial has not expired. Atomic with the INSERT; expired trials log the event without a debit.';
