begin;
select plan(6);

-- Fixture : 2 users
insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.local', 'authenticated', 'authenticated');

-- User A enregistre un device
set local role authenticated;
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
insert into public.user_devices (user_id, device_fingerprint, os_name, os_version, app_version) values
  ('11111111-1111-1111-1111-111111111111', 'fingerprint-A', 'win', '11', '3.0.0');

select results_eq(
  $$ select count(*)::int from public.user_devices $$,
  $$ values (1) $$,
  'User A voit son device'
);

-- Bascule vers user B
set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';

select results_eq(
  $$ select count(*)::int from public.user_devices $$,
  $$ values (0) $$,
  'User B ne voit PAS le device de A'
);

-- User B tente INSERT avec user_id = A → doit échouer (RLS WITH CHECK)
select throws_ok(
  $$ insert into public.user_devices (user_id, device_fingerprint, os_name, os_version, app_version) values ('11111111-1111-1111-1111-111111111111', 'fingerprint-Hack', 'win', '11', '3.0.0') $$,
  '42501',
  null,
  'User B ne peut pas INSERT un device avec user_id de A'
);

-- User B tente DELETE — RLS filtre en silence
select lives_ok(
  $$ delete from public.user_devices where user_id = '11111111-1111-1111-1111-111111111111' $$,
  'User B DELETE de A ne lève pas (RLS filtre en silence)'
);

-- Le device de A doit être intact
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
select results_eq(
  $$ select count(*)::int from public.user_devices where user_id = '11111111-1111-1111-1111-111111111111' $$,
  $$ values (1) $$,
  'Le device de A est intact après tentative DELETE de B'
);

-- Cleanup
set local role postgres;
delete from auth.users where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

select pass('Cleanup OK');

select * from finish();
rollback;
