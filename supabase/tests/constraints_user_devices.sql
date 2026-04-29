begin;
select plan(6);

-- Fixture
insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local', 'authenticated', 'authenticated');

set local role authenticated;
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';

-- Boundary values pass (50 / 100 / 100 chars exactly).
select lives_ok(
  $$ insert into public.user_devices (user_id, device_fingerprint, app_version, os_name, os_version) values
     ('11111111-1111-1111-1111-111111111111', 'fp-boundary',
      repeat('a', 50), repeat('b', 100), repeat('c', 100)) $$,
  'app_version=50 / os_name=100 / os_version=100 chars accepted'
);

-- Above the cap is rejected with the expected check_violation code (23514).
select throws_ok(
  $$ insert into public.user_devices (user_id, device_fingerprint, app_version) values
     ('11111111-1111-1111-1111-111111111111', 'fp-overflow-app', repeat('a', 51)) $$,
  '23514',
  null,
  'app_version > 50 chars rejected by user_devices_app_version_len'
);

select throws_ok(
  $$ insert into public.user_devices (user_id, device_fingerprint, os_name) values
     ('11111111-1111-1111-1111-111111111111', 'fp-overflow-osname', repeat('b', 101)) $$,
  '23514',
  null,
  'os_name > 100 chars rejected by user_devices_os_name_len'
);

select throws_ok(
  $$ insert into public.user_devices (user_id, device_fingerprint, os_version) values
     ('11111111-1111-1111-1111-111111111111', 'fp-overflow-osversion', repeat('c', 101)) $$,
  '23514',
  null,
  'os_version > 100 chars rejected by user_devices_os_version_len'
);

-- NULL values stay valid (the columns are nullable; constraints only fire on non-NULL inputs).
select lives_ok(
  $$ insert into public.user_devices (user_id, device_fingerprint, app_version, os_name, os_version) values
     ('11111111-1111-1111-1111-111111111111', 'fp-nulls', null, null, null) $$,
  'NULL values accepted (constraints only apply to non-NULL)'
);

-- Cleanup
set local role postgres;
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';

select pass('Cleanup OK');

select * from finish();
rollback;
