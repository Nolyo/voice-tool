CREATE OR REPLACE FUNCTION public.bump_trial_minutes(p_user_id UUID, p_minutes NUMERIC)
RETURNS VOID AS $$
  UPDATE public.trial_credits
     SET minutes_consumed = minutes_consumed + p_minutes
   WHERE user_id = p_user_id;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.bump_trial_minutes(UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_trial_minutes(UUID, NUMERIC) TO service_role;
