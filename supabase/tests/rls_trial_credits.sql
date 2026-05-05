BEGIN;
SELECT plan(2);

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.local');

INSERT INTO public.trial_credits (user_id, minutes_granted, minutes_consumed)
VALUES
  ('11111111-1111-1111-1111-111111111111', 60, 5),
  ('22222222-2222-2222-2222-222222222222', 60, 10);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

SELECT is(
  (SELECT count(*) FROM public.trial_credits)::int,
  1,
  'user A sees only their trial_credits row'
);

SET LOCAL request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
SELECT is(
  (SELECT minutes_consumed FROM public.trial_credits)::numeric,
  10::numeric,
  'user B sees their own minutes_consumed'
);

SELECT * FROM finish();
ROLLBACK;
