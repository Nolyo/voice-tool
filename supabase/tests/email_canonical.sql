begin;
select plan(12);

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

select * from finish();
rollback;
