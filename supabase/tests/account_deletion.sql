begin;
select plan(8);

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
  'not authenticated',
  'request_account_deletion : anonyme → not authenticated'
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

-- (6) cancel_account_deletion : User A at AAL1 → aal2_required
set local "request.jwt.claim.aal" = 'aal1';
select throws_ok(
  $$ select public.cancel_account_deletion() $$,
  '42501',
  'aal2_required',
  'cancel_account_deletion : user avec MFA à AAL1 → aal2_required'
);

-- (7) cancel_account_deletion : User A at AAL2 → deletes own row
set local "request.jwt.claim.aal" = 'aal2';
select lives_ok(
  $$ select public.cancel_account_deletion() $$,
  'cancel_account_deletion : user avec MFA à AAL2 → ok'
);

-- (8) Tombstone gone for user A after cancel
select is(
  (select count(*)::int from public.account_deletion_requests where user_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'tombstone supprimé après cancel_account_deletion'
);

-- Cleanup
set local role postgres;
delete from auth.users where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

select * from finish();
rollback;
