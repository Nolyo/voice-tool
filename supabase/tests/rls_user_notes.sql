begin;
select plan(6);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.local', 'authenticated', 'authenticated');

set local role authenticated;
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';

-- Folder + note for user A
insert into public.user_folders (id, user_id, name) values
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', '11111111-1111-1111-1111-111111111111', 'A folder');
insert into public.user_notes (id, user_id, title, content_html, folder_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Note A', '<p>hello</p>', 'ffffffff-ffff-ffff-ffff-ffffffffffff');

select results_eq(
  $$ select count(*)::int from public.user_notes where deleted_at is null $$,
  $$ values (1) $$,
  'User A voit sa note'
);

set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
select results_eq(
  $$ select count(*)::int from public.user_notes $$,
  $$ values (0) $$,
  'User B ne voit pas la note de A'
);

select throws_ok(
  $$ insert into public.user_notes (id, user_id, title, content_html) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'hack', '<p>bad</p>') $$,
  '42501',
  null,
  'User B ne peut pas créer une note sous le user_id de A'
);

select lives_ok(
  $$ update public.user_notes set title = 'pwned' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'User B UPDATE de A ne lève pas (RLS filtre en silence)'
);
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
select results_eq(
  $$ select title from public.user_notes where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  $$ values ('Note A'::text) $$,
  'La note de A est inchangée après tentative UPDATE de B'
);

-- FK folder_id ON DELETE SET NULL : suppression du dossier orphelinise les notes.
delete from public.user_folders where id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
select results_eq(
  $$ select folder_id::text from public.user_notes where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  $$ values (null::text) $$,
  'La note est orphelinée (folder_id NULL) après suppression du dossier (ON DELETE SET NULL)'
);

set local role postgres;
delete from auth.users where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

select * from finish();
rollback;
