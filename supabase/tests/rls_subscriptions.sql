-- pgtap : RLS subscriptions — owner-only read, no client write.

BEGIN;
SELECT plan(6);

-- Sanity
SELECT has_table('public', 'subscriptions', 'subscriptions table exists');
SELECT has_column('public', 'subscriptions', 'provider_subscription_id',
                  'provider_subscription_id column exists');

-- Setup deux users
INSERT INTO auth.users (id, email, email_confirmed_at)
VALUES
  ('aaaa1111-aaaa-1111-aaaa-111111111111', 'alice@test.local', NOW()),
  ('bbbb2222-bbbb-2222-bbbb-222222222222', 'bob@test.local', NOW());

-- Insert subscription pour Alice (en service-role : on bypass RLS dans le test)
INSERT INTO public.subscriptions (
  user_id, plan, status, provider_customer_id, provider_subscription_id, current_period_end, quota_minutes, overage_rate_eur_per_minute
) VALUES (
  'aaaa1111-aaaa-1111-aaaa-111111111111',
  'starter',
  'active',
  'cust_alice',
  'sub_alice_001',
  NOW() + INTERVAL '30 days',
  400,
  0.03
);

-- Test 3 : Alice voit sa propre row
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"aaaa1111-aaaa-1111-aaaa-111111111111","role":"authenticated"}';

SELECT is(
  (SELECT count(*) FROM public.subscriptions WHERE user_id = 'aaaa1111-aaaa-1111-aaaa-111111111111')::int,
  1,
  'alice reads her own subscription via RLS'
);

-- Test 4 : Bob ne voit pas la row d'Alice
SET LOCAL "request.jwt.claims" = '{"sub":"bbbb2222-bbbb-2222-bbbb-222222222222","role":"authenticated"}';

SELECT is(
  (SELECT count(*) FROM public.subscriptions WHERE user_id = 'aaaa1111-aaaa-1111-aaaa-111111111111')::int,
  0,
  'bob cannot read alice subscription (RLS owner-only)'
);

-- Test 5 : authenticated ne peut pas insert (REVOKE INSERT)
SELECT throws_ok(
  $$INSERT INTO public.subscriptions (user_id, plan, status, provider_customer_id, provider_subscription_id, current_period_end, quota_minutes, overage_rate_eur_per_minute)
    VALUES ('bbbb2222-bbbb-2222-bbbb-222222222222', 'pro', 'active', 'cust_bob', 'sub_bob_001', NOW() + INTERVAL '30 days', 1000, 0.02)$$,
  '42501', -- insufficient_privilege
  NULL,
  'authenticated user cannot insert into subscriptions (REVOKE INSERT)'
);

-- Test 6 : ré-upsert sur le même user_id écrase la row précédente (modèle
-- "une ligne par user", réabonnement après expiration). On revient en
-- service-role pour bypasser RLS et simuler le webhook.
RESET ROLE;
RESET "request.jwt.claims";

INSERT INTO public.subscriptions (
  user_id, plan, status, provider_customer_id, provider_subscription_id, current_period_end, quota_minutes, overage_rate_eur_per_minute
) VALUES (
  'aaaa1111-aaaa-1111-aaaa-111111111111',
  'pro',
  'active',
  'cust_alice',
  'sub_alice_002',
  NOW() + INTERVAL '30 days',
  1000,
  0.02
)
ON CONFLICT (user_id) DO UPDATE SET
  plan = EXCLUDED.plan,
  provider_subscription_id = EXCLUDED.provider_subscription_id,
  quota_minutes = EXCLUDED.quota_minutes,
  overage_rate_eur_per_minute = EXCLUDED.overage_rate_eur_per_minute;

SELECT is(
  (SELECT count(*) FROM public.subscriptions WHERE user_id = 'aaaa1111-aaaa-1111-aaaa-111111111111')::int,
  1,
  're-upsert on same user_id overwrites (one row per user, not a duplicate)'
);

SELECT * FROM finish();
ROLLBACK;
