begin;
select plan(2);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local', 'authenticated', 'authenticated');

set local role authenticated;
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
-- Plan A : profile_id NOT NULL → FK vers user_profiles. Parent d'abord.
insert into public.user_profiles (id, user_id, name) values
  ('a0000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 'Default');

-- 3 MB pile (3 145 728 bytes) doit passer.
select lives_ok(
  $$ insert into public.user_notes (id, user_id, profile_id, title, content_html)
       values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
               '11111111-1111-1111-1111-111111111111',
               'a0000000-0000-4000-8000-000000000001',
               'pile 3 MB',
               repeat('a', 3145728)) $$,
  'Content_html de 3 MB pile (3 145 728 bytes) est accepté par la contrainte'
);

-- 3 MB + 1 byte doit être rejeté.
select throws_ok(
  $$ insert into public.user_notes (id, user_id, profile_id, title, content_html)
       values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
               '11111111-1111-1111-1111-111111111111',
               'a0000000-0000-4000-8000-000000000001',
               'trop gros',
               repeat('a', 3145729)) $$,
  '23514',
  null,
  'Content_html > 3 MB (3 145 729 bytes) est rejeté par la contrainte CHECK'
);

set local role postgres;
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';

select * from finish();
rollback;
