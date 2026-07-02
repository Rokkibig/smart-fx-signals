
-- Unique constraint for idempotent upserts
CREATE UNIQUE INDEX IF NOT EXISTS forex_ohlcv_symbol_tf_ts_uniq
  ON public.forex_ohlcv (symbol, timeframe, bar_timestamp);

CREATE INDEX IF NOT EXISTS forex_ohlcv_symbol_tf_ts_desc
  ON public.forex_ohlcv (symbol, timeframe, bar_timestamp DESC);

-- Backfill jobs tracking
CREATE TABLE IF NOT EXISTS public.backfill_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  timeframe text NOT NULL,
  from_ts timestamptz NOT NULL,
  to_ts timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending|running|done|error|paused
  done_bars integer NOT NULL DEFAULT 0,
  est_total_bars integer,
  last_ts timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.backfill_jobs TO authenticated;
GRANT SELECT ON public.backfill_jobs TO anon;
GRANT ALL ON public.backfill_jobs TO service_role;

ALTER TABLE public.backfill_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read backfill jobs"
  ON public.backfill_jobs FOR SELECT
  USING (true);

CREATE INDEX IF NOT EXISTS backfill_jobs_status_idx ON public.backfill_jobs (status, created_at DESC);
