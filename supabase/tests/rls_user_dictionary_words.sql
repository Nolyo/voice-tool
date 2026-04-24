begin;
select plan(5);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.local', 'authenticated', 'authenticated');

set local role authenticated;
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
insert into public.user_dictionary_words (user_id, word) values
  ('11111111-1111-1111-1111-111111111111', 'tauri'),
  ('11111111-1111-1111-1111-111111111111', 'supabase');

select results_eq(
  $$ select count(*)::int from public.user_dictionary_words where deleted_at is null $$,
  $$ values (2) $$,
  'User A voit ses 2 mots'
);

set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
select results_eq(
  $$ select count(*)::int from public.user_dictionary_words $$,
  $$ values (0) $$,
  'User B ne voit aucun mot'
);

select throws_ok(
  $$ insert into public.user_dictionary_words (user_id, word) values ('11111111-1111-1111-1111-111111111111', 'hack') $$,
  '42501',
  null,
  'User B ne peut pas injecter un mot avec user_id de A'
);

-- delete réussit silencieusement sur 0 rows via RLS
select lives_ok(
  $$ delete from public.user_dictionary_words where user_id = '11111111-1111-1111-1111-111111111111' $$,
  'User B DELETE de A ne lève pas (RLS filtre en silence)'
);
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
select results_eq(
  $$ select count(*)::int from public.user_dictionary_words where user_id = '11111111-1111-1111-1111-111111111111' and deleted_at is null $$,
  $$ values (2) $$,
  'Les mots de A restent après tentative DELETE de B'
);

set local role postgres;
delete from auth.users where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

select * from finish();
rollback;
