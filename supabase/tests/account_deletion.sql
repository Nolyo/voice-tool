begin;
select plan(14);

-- Fixture : 2 users
insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.local', 'authenticated', 'authenticated');

-- Verified MFA factor for user A only
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'totp', 'totp', 'verified', 'x', now(), now());

-- (1) Anonymous : not authenticated
set local role anon;
select throws_ok(
  $$ select public.request_account_deletion() $$,
  null::text,
  'not authenticated',
  'request_account_deletion : anonyme → not authenticated'
);

-- (1b) cancel anonymous → not authenticated
select throws_ok(
  $$ select public.cancel_account_deletion() $$,
  null::text,
  'not authenticated',
  'cancel_account_deletion : anonyme → not authenticated'
);

-- (2) User B (no MFA) at AAL1 : insert succeeds
set local role authenticated;
set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
set local "request.jwt.claim.aal" = 'aal1';
select lives_ok(
  $$ select public.request_account_deletion() $$,
  'request_account_deletion : user sans MFA à AAL1 → ok'
);

-- (3) Tombstone inserted for user B
select is(
  (select count(*)::int from public.account_deletion_requests where user_id = '22222222-2222-2222-2222-222222222222'),
  1,
  'tombstone inséré pour user sans MFA'
);

-- (4) User A (has MFA) at AAL1 : aal2_required
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
set local "request.jwt.claim.aal" = 'aal1';
select throws_ok(
  $$ select public.request_account_deletion() $$,
  '42501',
  'aal2_required',
  'request_account_deletion : user avec MFA à AAL1 → aal2_required'
);

-- (5) User A at AAL2 : insert succeeds
set local "request.jwt.claim.aal" = 'aal2';
select lives_ok(
  $$ select public.request_account_deletion() $$,
  'request_account_deletion : user avec MFA à AAL2 → ok'
);

-- Guard: user A's tombstone must exist before RLS / cancel tests
select is(
  (select count(*)::int from public.account_deletion_requests where user_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'precondition: tombstone user A présente avant RLS/cancel'
);

-- (6) RLS cross-tenant SELECT : user B cannot see user A's tombstone
set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
set local "request.jwt.claim.aal" = 'aal2';
select is(
  (select count(*)::int from public.account_deletion_requests where user_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'RLS : user B ne peut pas voir la tombstone de user A'
);

-- (7) RLS cross-tenant DELETE : user B's delete is invisible to user A's row
delete from public.account_deletion_requests where user_id = '11111111-1111-1111-1111-111111111111';
-- Switch to postgres to bypass RLS and verify user A's row still exists
set local role postgres;
select is(
  (select count(*)::int from public.account_deletion_requests where user_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'RLS : user B ne peut pas supprimer la tombstone de user A'
);
-- Restore user A's session for the cancel tests that follow
set local role authenticated;
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
set local "request.jwt.claim.aal" = 'aal2';

-- (8) cancel_account_deletion : User A at AAL1 → aal2_required
set local "request.jwt.claim.aal" = 'aal1';
select throws_ok(
  $$ select public.cancel_account_deletion() $$,
  '42501',
  'aal2_required',
  'cancel_account_deletion : user avec MFA à AAL1 → aal2_required'
);

-- (9) cancel_account_deletion : User A at AAL2 → deletes own row
set local "request.jwt.claim.aal" = 'aal2';
select lives_ok(
  $$ select public.cancel_account_deletion() $$,
  'cancel_account_deletion : user avec MFA à AAL2 → ok'
);

-- (10) Tombstone gone for user A after cancel
select is(
  (select count(*)::int from public.account_deletion_requests where user_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'tombstone supprimé après cancel_account_deletion'
);

-- (NEW) cancel by user without MFA at AAL1 → ok (deletes B's tombstone)
set local role authenticated;
set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
set local "request.jwt.claim.aal" = 'aal1';
select lives_ok(
  $$ select public.cancel_account_deletion() $$,
  'cancel_account_deletion : user sans MFA à AAL1 → ok'
);
select is(
  (select count(*)::int from public.account_deletion_requests where user_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'tombstone B supprimé après cancel sans MFA'
);

-- Cleanup
set local role postgres;
delete from auth.users where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

select * from finish();
rollback;
