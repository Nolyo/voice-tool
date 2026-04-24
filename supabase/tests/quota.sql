begin;
select plan(3);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local', 'authenticated', 'authenticated');

set local role authenticated;
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
insert into public.user_settings (user_id, data) values
  ('11111111-1111-1111-1111-111111111111', '{"ui":{"theme":"dark","language":"fr"}}'::jsonb);
insert into public.user_dictionary_words (user_id, word) values
  ('11111111-1111-1111-1111-111111111111', 'tauri');
insert into public.user_snippets (id, user_id, label, content) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'sign', 'Cordialement');

select ok(
  public.compute_user_sync_size('11111111-1111-1111-1111-111111111111') > 0,
  'compute_user_sync_size retourne > 0 pour user avec data'
);

-- Prouve que la taille intègre bien la contribution de chaque table : ajouter un mot dico doit strictement augmenter la taille.
do $$
declare
  before bigint;
  after bigint;
begin
  before := public.compute_user_sync_size('11111111-1111-1111-1111-111111111111');
  insert into public.user_dictionary_words (user_id, word) values
    ('11111111-1111-1111-1111-111111111111', 'extrabig_word_for_test');
  after := public.compute_user_sync_size('11111111-1111-1111-1111-111111111111');
  if after <= before then
    raise exception 'size did not grow: before=% after=%', before, after;
  end if;
end $$;
select pass('compute_user_sync_size intègre la contribution dico');

-- Test que user B ne peut pas compute la size de user A
insert into auth.users (id, email, aud, role) values
  ('22222222-2222-2222-2222-222222222222', 'b@test.local', 'authenticated', 'authenticated');
set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';

select throws_ok(
  $$ select public.compute_user_sync_size('11111111-1111-1111-1111-111111111111') $$,
  '42501',
  'access denied',
  'User B ne peut pas compute la size de A'
);

set local role postgres;
delete from auth.users where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

select * from finish();
rollback;
