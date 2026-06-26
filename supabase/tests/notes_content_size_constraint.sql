begin;
select plan(2);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local', 'authenticated', 'authenticated');

set local role authenticated;
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
-- Plan A : profile_id NOT NULL → FK vers user_profiles. Parent d'abord.
insert into public.user_profiles (id, user_id, name) values
  ('a0000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 'Default');

-- 1 MB pile (1 048 576 bytes) doit passer.
select lives_ok(
  $$ insert into public.user_notes (id, user_id, profile_id, title, content_html)
       values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
               '11111111-1111-1111-1111-111111111111',
               'a0000000-0000-4000-8000-000000000001',
               'pile 1 MB',
               repeat('a', 1048576)) $$,
  'Content_html de 1 MB pile (1 048 576 bytes) est accepté par la contrainte'
);

-- 1 MB + 1 byte doit être rejeté.
select throws_ok(
  $$ insert into public.user_notes (id, user_id, profile_id, title, content_html)
       values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
               '11111111-1111-1111-1111-111111111111',
               'a0000000-0000-4000-8000-000000000001',
               'trop gros',
               repeat('a', 1048577)) $$,
  '23514',
  null,
  'Content_html > 1 MB (1 048 577 bytes) est rejeté par la contrainte CHECK'
);

set local role postgres;
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';

select * from finish();
rollback;
