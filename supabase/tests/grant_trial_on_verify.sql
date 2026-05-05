BEGIN;
SELECT plan(9);

-- ─── Sanity ─────────────────────────────────────────────────────────────────

SELECT has_function(
  'public', 'grant_trial_credits',
  'function public.grant_trial_credits exists'
);

SELECT has_trigger(
  'auth', 'users', 'grant_trial_on_user_insert',
  'AFTER INSERT trigger on auth.users exists'
);

SELECT has_trigger(
  'auth', 'users', 'grant_trial_on_email_confirmed',
  'AFTER UPDATE trigger on auth.users exists'
);

-- ─── Scenario 1: OAuth / signup with confirmations off ──────────────────────
-- INSERT auth.users with email_confirmed_at already set fires the INSERT
-- trigger and grants the trial.

INSERT INTO auth.users (id, email, email_confirmed_at)
VALUES ('11111111-1111-1111-1111-111111111111', 'a@test.local', NOW());

SELECT is(
  (SELECT minutes_granted FROM public.trial_credits
   WHERE user_id = '11111111-1111-1111-1111-111111111111')::numeric,
  60::numeric,
  'scenario 1: trial granted on INSERT with email_confirmed_at set'
);

SELECT ok(
  (SELECT expires_at FROM public.trial_credits
   WHERE user_id = '11111111-1111-1111-1111-111111111111')
  BETWEEN NOW() + INTERVAL '29 days 23 hours' AND NOW() + INTERVAL '30 days 1 hour',
  'scenario 1: expires_at is approximately NOW() + 30 days'
);

-- ─── Scenario 2: email signup not yet verified ──────────────────────────────
-- INSERT with email_confirmed_at NULL must NOT grant a trial.

INSERT INTO auth.users (id, email, email_confirmed_at)
VALUES ('22222222-2222-2222-2222-222222222222', 'b@test.local', NULL);

SELECT is(
  (SELECT count(*) FROM public.trial_credits
   WHERE user_id = '22222222-2222-2222-2222-222222222222')::int,
  0,
  'scenario 2: no trial granted while email_confirmed_at is NULL'
);

-- ─── Scenario 3: post-hoc verification (magic link / email confirm) ────────
-- The user from scenario 2 verifies. UPDATE OF email_confirmed_at fires the
-- UPDATE trigger and grants the trial.

UPDATE auth.users
   SET email_confirmed_at = NOW()
 WHERE id = '22222222-2222-2222-2222-222222222222';

SELECT is(
  (SELECT count(*) FROM public.trial_credits
   WHERE user_id = '22222222-2222-2222-2222-222222222222')::int,
  1,
  'scenario 3: trial granted after email_confirmed_at transitions NULL → NOT NULL'
);

-- ─── Scenario 4: irrelevant UPDATE does not duplicate ──────────────────────
-- Updating a column that is not email_confirmed_at must not fire our trigger
-- (the WHEN clause + AFTER UPDATE OF column filter prevents it). Verify by
-- counting rows for the already-verified user from scenario 1.

UPDATE auth.users
   SET raw_user_meta_data = '{"foo": "bar"}'::jsonb
 WHERE id = '11111111-1111-1111-1111-111111111111';

SELECT is(
  (SELECT count(*) FROM public.trial_credits
   WHERE user_id = '11111111-1111-1111-1111-111111111111')::int,
  1,
  'scenario 4: unrelated UPDATE does not create a duplicate trial row'
);

-- ─── Scenario 5: idempotency — pre-existing trial is preserved ─────────────
-- (a) Insert an unverified user (FK target, no trigger fires).
-- (b) Manually insert a trial_credits row with minutes_consumed = 30.
-- (c) Verify the user. The UPDATE trigger fires but ON CONFLICT DO NOTHING
--     leaves the manual row untouched.

INSERT INTO auth.users (id, email, email_confirmed_at)
VALUES ('33333333-3333-3333-3333-333333333333', 'c@test.local', NULL);

INSERT INTO public.trial_credits (user_id, minutes_granted, minutes_consumed)
VALUES ('33333333-3333-3333-3333-333333333333', 60, 30);

UPDATE auth.users
   SET email_confirmed_at = NOW()
 WHERE id = '33333333-3333-3333-3333-333333333333';

SELECT is(
  (SELECT minutes_consumed FROM public.trial_credits
   WHERE user_id = '33333333-3333-3333-3333-333333333333')::numeric,
  30::numeric,
  'scenario 5: pre-existing trial_credits row is preserved on verify (ON CONFLICT)'
);

SELECT * FROM finish();
ROLLBACK;
