BEGIN;
SELECT plan(2);

-- Setup: 2 users, 1 event each. Trigger will populate usage_summary automatically.
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.local');

INSERT INTO public.usage_events (user_id, kind, units, units_unit, model, provider, source)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'transcription', 1.0, 'minutes', 'whisper-large-v3-turbo', 'groq', 'trial'),
  ('22222222-2222-2222-2222-222222222222', 'transcription', 2.0, 'minutes', 'whisper-large-v3-turbo', 'groq', 'trial');

-- User A sees only their summary row.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

SELECT is(
  (SELECT count(*) FROM public.usage_summary)::int,
  1,
  'user A sees exactly 1 summary row'
);

-- User B sees only theirs.
SET LOCAL request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
SELECT is(
  (SELECT count(*) FROM public.usage_summary)::int,
  1,
  'user B sees exactly 1 summary row'
);

SELECT * FROM finish();
ROLLBACK;
