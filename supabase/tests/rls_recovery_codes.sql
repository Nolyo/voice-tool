begin;
select plan(7);

-- Fixture : 2 users
insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.local', 'authenticated', 'authenticated');

-- User A pose un code de récupération
set local role authenticated;
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
insert into public.recovery_codes (user_id, code_hash) values
  ('11111111-1111-1111-1111-111111111111', encode(extensions.digest('plain-aaa', 'sha256'), 'hex'));

select results_eq(
  $$ select count(*)::int from public.recovery_codes $$,
  $$ values (1) $$,
  'User A voit son code'
);

-- Bascule vers user B
set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';

select results_eq(
  $$ select count(*)::int from public.recovery_codes $$,
  $$ values (0) $$,
  'User B ne voit PAS le code de A'
);

-- User B tente UPDATE — RLS filtre en silence
select lives_ok(
  $$ update public.recovery_codes set used_at = now() where user_id = '11111111-1111-1111-1111-111111111111' $$,
  'User B UPDATE de A ne lève pas (RLS filtre en silence)'
);
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';

select results_eq(
  $$ select used_at from public.recovery_codes where user_id = '11111111-1111-1111-1111-111111111111' $$,
  $$ values (null::timestamptz) $$,
  'Le code de A reste non-utilisé après tentative UPDATE de B'
);

-- User B tente INSERT avec user_id = A → doit échouer (RLS WITH CHECK)
set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
select throws_ok(
  $$ insert into public.recovery_codes (user_id, code_hash) values ('11111111-1111-1111-1111-111111111111', 'fake-hash') $$,
  '42501',
  null,
  'User B ne peut pas INSERT un code avec user_id de A'
);

-- Vérifie le format hex 64 chars du hash SHA-256
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
select results_eq(
  $$ select code_hash ~ '^[0-9a-f]{64}$' from public.recovery_codes where user_id = '11111111-1111-1111-1111-111111111111' $$,
  $$ values (true) $$,
  'code_hash a bien le format SHA-256 hex 64 chars'
);

-- Cleanup
set local role postgres;
delete from auth.users where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

select pass('Cleanup OK');

select * from finish();
rollback;
