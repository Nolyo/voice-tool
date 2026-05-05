-- Aggregate by (user_id, year_month, kind), maintained by AFTER INSERT trigger
-- on usage_events. Hot path quota check reads this table directly.

CREATE TABLE public.usage_summary (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL CHECK (year_month ~ '^\d{4}-\d{2}$'),
  kind TEXT NOT NULL CHECK (kind IN ('transcription', 'post_process')),
  units_total NUMERIC(12, 4) NOT NULL DEFAULT 0,
  events_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, year_month, kind)
);

ALTER TABLE public.usage_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY usage_summary_owner_read
  ON public.usage_summary FOR SELECT
  USING (auth.uid() = user_id);

-- Trigger function: UPSERT atomically on event insert.

CREATE OR REPLACE FUNCTION public.upsert_usage_summary()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.usage_summary
    (user_id, year_month, kind, units_total, events_count, updated_at)
  VALUES (
    NEW.user_id,
    to_char(NEW.created_at AT TIME ZONE 'UTC', 'YYYY-MM'),
    NEW.kind,
    NEW.units,
    1,
    NOW()
  )
  ON CONFLICT (user_id, year_month, kind) DO UPDATE
    SET units_total = public.usage_summary.units_total + EXCLUDED.units_total,
        events_count = public.usage_summary.events_count + 1,
        updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_usage_events_aggregate
  AFTER INSERT ON public.usage_events
  FOR EACH ROW EXECUTE FUNCTION public.upsert_usage_summary();

COMMENT ON TABLE public.usage_summary IS
  'Aggregate counter per (user_id, year_month, kind). Maintained by trigger on usage_events. Reset implicit per-month via year_month partition.';
