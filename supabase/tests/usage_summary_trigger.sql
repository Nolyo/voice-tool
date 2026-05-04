BEGIN;
SELECT plan(4);

INSERT INTO auth.users (id, email)
VALUES ('11111111-1111-1111-1111-111111111111', 'a@test.local');

-- Insert 3 events, 2 transcription + 1 post_process.
INSERT INTO public.usage_events
  (user_id, kind, units, units_unit, model, provider, source, created_at)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'transcription', 1.0, 'minutes', 'whisper-large-v3-turbo', 'groq', 'trial', '2026-05-04T12:00:00Z'),
  ('11111111-1111-1111-1111-111111111111', 'transcription', 2.5, 'minutes', 'whisper-large-v3-turbo', 'groq', 'trial', '2026-05-04T13:00:00Z'),
  ('11111111-1111-1111-1111-111111111111', 'post_process', 800, 'tokens', 'gpt-4o-mini', 'openai', 'trial', '2026-05-04T14:00:00Z');

SELECT is(
  (SELECT units_total FROM public.usage_summary
   WHERE user_id = '11111111-1111-1111-1111-111111111111'
     AND year_month = '2026-05' AND kind = 'transcription')::numeric,
  3.5::numeric,
  'transcription minutes summed'
);
SELECT is(
  (SELECT events_count FROM public.usage_summary
   WHERE user_id = '11111111-1111-1111-1111-111111111111'
     AND year_month = '2026-05' AND kind = 'transcription')::int,
  2,
  'transcription event count is 2'
);
SELECT is(
  (SELECT units_total FROM public.usage_summary
   WHERE user_id = '11111111-1111-1111-1111-111111111111'
     AND year_month = '2026-05' AND kind = 'post_process')::numeric,
  800::numeric,
  'post_process tokens summed'
);
SELECT is(
  (SELECT count(*) FROM public.usage_summary)::int,
  2,
  'two summary rows: one per (year_month, kind)'
);

SELECT * FROM finish();
ROLLBACK;
