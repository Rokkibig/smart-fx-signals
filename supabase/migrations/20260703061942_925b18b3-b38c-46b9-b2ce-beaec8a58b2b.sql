
CREATE TABLE public.daily_forecasts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  forecast_date DATE NOT NULL,
  forecast_horizon_hours INTEGER NOT NULL DEFAULT 24,
  direction TEXT NOT NULL CHECK (direction IN ('up','down','neutral')),
  probability NUMERIC(5,2) NOT NULL,
  price_at_forecast NUMERIC(18,8) NOT NULL,
  target_price NUMERIC(18,8),
  stop_price NUMERIC(18,8),
  expected_move_pips NUMERIC(10,2),
  reasoning TEXT,
  news_context TEXT,
  technical_snapshot JSONB,
  model_version TEXT DEFAULT 'gemini-2.5-pro',
  evaluated_at TIMESTAMPTZ,
  actual_direction TEXT,
  actual_move_pips NUMERIC(10,2),
  hit_target BOOLEAN,
  hit_stop BOOLEAN,
  accuracy_score NUMERIC(5,2),
  evaluation_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(symbol, forecast_date)
);

GRANT SELECT ON public.daily_forecasts TO anon, authenticated;
GRANT ALL ON public.daily_forecasts TO service_role;
ALTER TABLE public.daily_forecasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read forecasts" ON public.daily_forecasts
  FOR SELECT USING (true);

CREATE INDEX idx_daily_forecasts_symbol_date ON public.daily_forecasts(symbol, forecast_date DESC);
CREATE INDEX idx_daily_forecasts_pending_eval ON public.daily_forecasts(evaluated_at, forecast_date) WHERE evaluated_at IS NULL;

CREATE TRIGGER update_daily_forecasts_updated_at
  BEFORE UPDATE ON public.daily_forecasts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE public.forecast_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL UNIQUE,
  total_forecasts INTEGER NOT NULL DEFAULT 0,
  correct_direction INTEGER NOT NULL DEFAULT 0,
  hit_target_count INTEGER NOT NULL DEFAULT 0,
  hit_stop_count INTEGER NOT NULL DEFAULT 0,
  avg_accuracy NUMERIC(5,2) NOT NULL DEFAULT 0,
  avg_probability NUMERIC(5,2) NOT NULL DEFAULT 0,
  recent_mistakes JSONB DEFAULT '[]'::jsonb,
  last_evaluated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.forecast_stats TO anon, authenticated;
GRANT ALL ON public.forecast_stats TO service_role;
ALTER TABLE public.forecast_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read stats" ON public.forecast_stats
  FOR SELECT USING (true);

CREATE TRIGGER update_forecast_stats_updated_at
  BEFORE UPDATE ON public.forecast_stats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
