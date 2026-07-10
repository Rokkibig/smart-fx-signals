
CREATE TABLE public.market_snapshots (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  snapshot_at TIMESTAMPTZ NOT NULL,
  price NUMERIC NOT NULL,
  atr_h1 NUMERIC,
  trend_d1 TEXT,
  trend_h4 TEXT,
  trend_h1 TEXT,
  trend_m15 TEXT,
  adx_h1_bucket TEXT,
  adx_h4_bucket TEXT,
  rsi_h1_bucket TEXT,
  rsi_h4_bucket TEXT,
  dist_ema200_atr_bucket TEXT,
  range_pos_bucket TEXT,
  session TEXT,
  dow SMALLINT,
  cot_bias TEXT,
  news_sentiment_bucket TEXT,
  pattern_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (symbol, snapshot_at)
);
CREATE INDEX idx_snapshots_pattern ON public.market_snapshots (symbol, pattern_key);
CREATE INDEX idx_snapshots_time ON public.market_snapshots (symbol, snapshot_at DESC);

GRANT SELECT ON public.market_snapshots TO authenticated;
GRANT ALL ON public.market_snapshots TO service_role;
ALTER TABLE public.market_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read snapshots" ON public.market_snapshots FOR SELECT TO authenticated USING (true);

CREATE TABLE public.snapshot_outcomes (
  snapshot_id BIGINT PRIMARY KEY REFERENCES public.market_snapshots(id) ON DELETE CASCADE,
  horizon_hours INT NOT NULL DEFAULT 24,
  direction_24h TEXT NOT NULL,
  move_pips NUMERIC NOT NULL,
  mfe_pips NUMERIC NOT NULL,
  mae_pips NUMERIC NOT NULL,
  mfe_atr NUMERIC,
  mae_atr NUMERIC,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_outcomes_direction ON public.snapshot_outcomes (direction_24h);

GRANT SELECT ON public.snapshot_outcomes TO authenticated;
GRANT ALL ON public.snapshot_outcomes TO service_role;
ALTER TABLE public.snapshot_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read outcomes" ON public.snapshot_outcomes FOR SELECT TO authenticated USING (true);

-- Add columns to daily_forecasts for statistical transparency
ALTER TABLE public.daily_forecasts
  ADD COLUMN IF NOT EXISTS n_matches INT,
  ADD COLUMN IF NOT EXISTS p_up NUMERIC,
  ADD COLUMN IF NOT EXISTS p_down NUMERIC,
  ADD COLUMN IF NOT EXISTS p_flat NUMERIC,
  ADD COLUMN IF NOT EXISTS median_move_pips NUMERIC,
  ADD COLUMN IF NOT EXISTS median_mae_pips NUMERIC,
  ADD COLUMN IF NOT EXISTS pattern_key TEXT,
  ADD COLUMN IF NOT EXISTS stat_source TEXT;
