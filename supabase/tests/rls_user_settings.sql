begin;
select plan(6);

-- Fixture : 2 users
insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.local', 'authenticated', 'authenticated');

-- User A pose un row
set local role authenticated;
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
insert into public.user_settings (user_id, data) values
  ('11111111-1111-1111-1111-111111111111', '{"ui":{"theme":"dark"}}'::jsonb);

select results_eq(
  $$ select count(*)::int from public.user_settings $$,
  $$ values (1) $$,
  'User A voit son row'
);

-- Bascule vers user B
set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';

select results_eq(
  $$ select count(*)::int from public.user_settings $$,
  $$ values (0) $$,
  'User B ne voit PAS le row de A'
);

select throws_ok(
  $$ update public.user_settings set data = '{"ui":{"theme":"light"}}'::jsonb where user_id = '11111111-1111-1111-1111-111111111111' $$,
  null,
  null,
  'User B ne peut pas UPDATE le row de A (RLS filtre)'
);
-- NB: update sur 0 rows réussit silencieusement à cause de RLS — on teste via re-select côté A
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';

select results_eq(
  $$ select data->>'ui' from public.user_settings where user_id = '11111111-1111-1111-1111-111111111111' $$,
  $$ values ('{"theme": "dark"}') $$,
  'Le row de A est inchangé après tentative UPDATE de B'
);

-- User B tente insert avec user_id = A → doit échouer (RLS WITH CHECK)
set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
select throws_ok(
  $$ insert into public.user_settings (user_id, data) values ('11111111-1111-1111-1111-111111111111', '{"hack":true}'::jsonb) $$,
  '42501',
  null,
  'User B ne peut pas INSERT un row avec user_id de A'
);

-- Cleanup
set local role postgres;
delete from auth.users where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

select pass('Cleanup OK');

select * from finish();
rollback;
