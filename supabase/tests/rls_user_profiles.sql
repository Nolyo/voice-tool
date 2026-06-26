begin;
select plan(5);

insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.local', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@test.local', 'authenticated', 'authenticated');

set local role authenticated;
set local "request.jwt.claim.sub" = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into public.user_profiles (id, user_id, name) values
  ('10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Perso');

select results_eq(
  $$ select count(*)::int from public.user_profiles where deleted_at is null $$,
  $$ values (1) $$,
  'User A voit son propre profil'
);

set local "request.jwt.claim.sub" = 'bbbbbbbb-0000-0000-0000-000000000002';
select results_eq(
  $$ select count(*)::int from public.user_profiles $$,
  $$ values (0) $$,
  'User B ne voit aucun profil de A (RLS isolation)'
);

select throws_ok(
  $$ insert into public.user_profiles (id, user_id, name) values ('20000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'hack') $$,
  '42501',
  null,
  'User B ne peut pas créer un profil sous le user_id de A'
);

select lives_ok(
  $$ update public.user_profiles set name = 'hacked' where id = '10000000-0000-0000-0000-000000000001' $$,
  'User B UPDATE de A ne lève pas (RLS filtre en silence)'
);
set local "request.jwt.claim.sub" = 'aaaaaaaa-0000-0000-0000-000000000001';
select results_eq(
  $$ select name from public.user_profiles where id = '10000000-0000-0000-0000-000000000001' $$,
  $$ values ('Perso'::text) $$,
  'Le profil de A est inchangé après tentative UPDATE de B'
);

set local role postgres;
delete from auth.users where id in ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002');

select * from finish();
rollback;
