begin;
select plan(18);

-- Function purity
select is(public.normalize_email('user@example.com'), 'user@example.com', 'lowercase passthrough');
select is(public.normalize_email('USER@Example.COM'), 'user@example.com', 'lowercases');
select is(public.normalize_email('user+anything@example.com'), 'user@example.com', 'strips +suffix on any domain');
select is(public.normalize_email('User+a+b+c@Example.com'), 'user@example.com', 'strips multiple +suffix and lowercases');
select is(public.normalize_email('u.s.e.r@gmail.com'), 'user@gmail.com', 'strips dots on gmail.com');
select is(public.normalize_email('u.s.e.r@googlemail.com'), 'user@googlemail.com', 'strips dots on googlemail.com');
select is(public.normalize_email('u.s.e.r+x@gmail.com'), 'user@gmail.com', 'strips dots and +suffix on gmail');
select is(public.normalize_email('u.s.e.r@outlook.com'), 'u.s.e.r@outlook.com', 'does NOT strip dots on outlook');
select is(public.normalize_email('u.s.e.r@yahoo.com'), 'u.s.e.r@yahoo.com', 'does NOT strip dots on yahoo');
select is(public.normalize_email(NULL), NULL, 'NULL passthrough');
select is(public.normalize_email(''), '', 'empty string passthrough');
select is(public.normalize_email('no-at-sign'), 'no-at-sign', 'malformed input passthrough (no @)');

-- Trigger : duplicate canonical rejected on INSERT
insert into auth.users (id, email, aud, role) values
  ('33333333-3333-3333-3333-333333333333', 'alice@gmail.com', 'authenticated', 'authenticated');

select throws_ok(
  $$ insert into auth.users (id, email, aud, role) values
       ('44444444-4444-4444-4444-444444444444', 'a.l.i.c.e+work@gmail.com', 'authenticated', 'authenticated') $$,
  'P0001',
  'email already registered (canonical form collision)',
  'INSERT with same canonical form is rejected'
);

select throws_ok(
  $$ insert into auth.users (id, email, aud, role) values
       ('55555555-5555-5555-5555-555555555555', 'ALICE+other@GMAIL.COM', 'authenticated', 'authenticated') $$,
  'P0001',
  'email already registered (canonical form collision)',
  'INSERT with case+suffix variant is rejected'
);

-- Different domain → not blocked
select lives_ok(
  $$ insert into auth.users (id, email, aud, role) values
       ('66666666-6666-6666-6666-666666666666', 'alice@outlook.com', 'authenticated', 'authenticated') $$,
  'INSERT on different domain is allowed'
);

-- UPDATE that creates a collision is rejected
select throws_ok(
  $$ update auth.users set email = 'alice+update@gmail.com' where id = '66666666-6666-6666-6666-666666666666' $$,
  'P0001',
  'email already registered (canonical form collision)',
  'UPDATE creating canonical collision is rejected'
);

-- UPDATE the same user's own email (no collision) is allowed
select lives_ok(
  $$ update auth.users set email = 'alice2@gmail.com' where id = '33333333-3333-3333-3333-333333333333' $$,
  'UPDATE on owner row is allowed when canonical changes uniquely'
);

-- NULL email is not rejected by the trigger (auth.users.email is NOT NULL in practice, but the trigger guards explicitly).
select lives_ok(
  $$ insert into auth.users (id, email, aud, role) values
       ('77777777-7777-7777-7777-777777777777', null, 'authenticated', 'authenticated') $$,
  'INSERT with NULL email is not blocked by the trigger (auth-side NOT NULL is the gate)'
);

select * from finish();
rollback;
