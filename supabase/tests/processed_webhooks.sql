BEGIN;
SELECT plan(3);

SELECT has_table('public', 'processed_webhooks', 'processed_webhooks exists');
SELECT col_is_pk('public', 'processed_webhooks', 'webhook_id', 'webhook_id is PK');

-- Pas de policy = pas de lecture client
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"aaaa1111-aaaa-1111-aaaa-111111111111","role":"authenticated"}';

SELECT is(
  (SELECT count(*) FROM public.processed_webhooks)::int,
  0,
  'authenticated cannot read processed_webhooks (no policy)'
);

SELECT * FROM finish();
ROLLBACK;
