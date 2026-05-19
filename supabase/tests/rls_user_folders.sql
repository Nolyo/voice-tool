begin;
select plan(5);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.local', 'authenticated', 'authenticated');

set local role authenticated;
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
insert into public.user_folders (id, user_id, name, "order") values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Idées', 0);

select results_eq(
  $$ select count(*)::int from public.user_folders where deleted_at is null $$,
  $$ values (1) $$,
  'User A voit son dossier'
);

set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
select results_eq(
  $$ select count(*)::int from public.user_folders $$,
  $$ values (0) $$,
  'User B ne voit pas le dossier de A'
);

select throws_ok(
  $$ insert into public.user_folders (id, user_id, name) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'hack') $$,
  '42501',
  null,
  'User B ne peut pas créer un dossier sous le user_id de A'
);

select lives_ok(
  $$ update public.user_folders set name = 'pwned' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'User B UPDATE de A ne lève pas (RLS filtre en silence)'
);
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
select results_eq(
  $$ select name from public.user_folders where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  $$ values ('Idées'::text) $$,
  'Le dossier de A est inchangé après tentative UPDATE de B'
);

set local role postgres;
delete from auth.users where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

select * from finish();
rollback;
