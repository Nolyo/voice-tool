BEGIN;
SELECT plan(3);

SELECT has_table('public', 'processed_webhooks', 'processed_webhooks exists');
SELECT col_is_pk('public', 'processed_webhooks', 'webhook_id', 'webhook_id is PK');

-- Pas de privilège = pas de lecture client (REVOKE ALL FROM authenticated dans la migration).
-- Le SELECT doit lever "permission denied" avant même que RLS ne s'applique.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"aaaa1111-aaaa-1111-aaaa-111111111111","role":"authenticated"}';

SELECT throws_ok(
  'SELECT count(*) FROM public.processed_webhooks',
  '42501',
  'permission denied for table processed_webhooks',
  'authenticated cannot read processed_webhooks (privilege revoked)'
);

SELECT * FROM finish();
ROLLBACK;
