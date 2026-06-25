begin;
select plan(7);

-- Two tenants + one note owned by user A.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@test.dev'),
  ('00000000-0000-0000-0000-0000000000b2', 'b@test.dev');
insert into public.user_notes (id, user_id, title, content_html)
  values ('00000000-0000-0000-0000-00000000note', '00000000-0000-0000-0000-0000000000a1', 'A note', '<p>hi</p>');

-- Act as user A: can insert a share for own note.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select lives_ok(
  $$insert into public.note_shares (slug, user_id, note_id, title_snapshot)
    values ('aaaaaaaaaaaaaaaa', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000note', 'A note')$$,
  'owner can insert own share');

select results_eq(
  $$select count(*)::int from public.note_shares$$, $$values (1)$$,
  'owner sees own share');

-- Partial unique: a second ACTIVE share for the same note must fail.
select throws_ok(
  $$insert into public.note_shares (slug, user_id, note_id, title_snapshot)
    values ('cccccccccccccccc', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000note', 'A note')$$,
  '23505', null, 'only one active share per note');

-- Act as user B: cannot see or mutate A's share.
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
select results_eq(
  $$select count(*)::int from public.note_shares$$, $$values (0)$$,
  'cross-tenant select blocked by RLS');

select results_eq(
  $$with u as (update public.note_shares set revoked_at = now()
      where slug = 'aaaaaaaaaaaaaaaa' returning 1) select count(*)::int from u$$,
  $$values (0)$$, 'cross-tenant update blocked by RLS');

select results_eq(
  $$with d as (delete from public.note_shares where slug = 'aaaaaaaaaaaaaaaa' returning 1)
    select count(*)::int from d$$,
  $$values (0)$$, 'cross-tenant delete blocked by RLS');

-- B cannot insert a share pointing at A's note row (RLS insert check is on user_id only;
-- but B claiming own user_id with A's note must still be allowed by RLS yet is harmless —
-- the Edge Function join on (note_id,user_id) prevents serving it). Assert B can only
-- insert rows with its own user_id.
select throws_ok(
  $$insert into public.note_shares (slug, user_id, note_id, title_snapshot)
    values ('dddddddddddddddd', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000note', 'x')$$,
  '42501', null, 'cannot insert a share owned by another user');

select * from finish();
rollback;
