-- Append-only ledger of cloud usage events (transcription or post_process).
-- Source of truth for audit, debug, support. Never mutated except via TRUNCATE
-- in test fixtures. Referenced by usage_summary trigger.

CREATE TABLE public.usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('transcription', 'post_process')),
  units NUMERIC(10, 4) NOT NULL CHECK (units >= 0),
  -- minutes for transcription, total tokens (in+out) for post_process
  units_unit TEXT NOT NULL CHECK (units_unit IN ('minutes', 'tokens')),
  model TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('groq', 'openai')),
  provider_request_id TEXT,
  idempotency_key TEXT,
  source TEXT NOT NULL CHECK (source IN ('trial', 'quota', 'overage')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT usage_events_idempotency_unique UNIQUE (user_id, idempotency_key)
);

CREATE INDEX usage_events_user_id_created_at_idx
  ON public.usage_events (user_id, created_at DESC);
CREATE INDEX usage_events_user_id_kind_created_at_idx
  ON public.usage_events (user_id, kind, created_at DESC);

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

-- Reads: user can read their own events (for support / dashboard).
CREATE POLICY usage_events_owner_read
  ON public.usage_events FOR SELECT
  USING (auth.uid() = user_id);

-- Writes: blocked for end users. Only service_role (Worker) can insert.
-- service_role bypasses RLS by design. No INSERT policy = denied for authenticated.

COMMENT ON TABLE public.usage_events IS
  'Append-only ledger of cloud transcription/post-process events. Zero-retention on payload — never stores audio, prompt, or text content.';
