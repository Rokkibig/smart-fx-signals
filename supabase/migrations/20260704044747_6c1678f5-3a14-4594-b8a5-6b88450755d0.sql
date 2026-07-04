
CREATE TABLE public.economic_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_time TIMESTAMPTZ NOT NULL,
  currency TEXT NOT NULL,
  country TEXT,
  title TEXT NOT NULL,
  importance TEXT NOT NULL DEFAULT 'medium',
  actual TEXT,
  forecast TEXT,
  previous TEXT,
  unit TEXT,
  source TEXT DEFAULT 'twelvedata',
  external_id TEXT,
  processed_at TIMESTAMPTZ,
  affected_symbols TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_time, currency, title)
);
GRANT SELECT ON public.economic_events TO anon, authenticated;
GRANT ALL ON public.economic_events TO service_role;
ALTER TABLE public.economic_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read economic events" ON public.economic_events FOR SELECT USING (true);

CREATE INDEX idx_econ_events_time ON public.economic_events(event_time DESC);
CREATE INDEX idx_econ_events_unprocessed ON public.economic_events(event_time) WHERE processed_at IS NULL;

CREATE TABLE public.forecast_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_id UUID NOT NULL REFERENCES public.daily_forecasts(id) ON DELETE CASCADE,
  event_id UUID REFERENCES public.economic_events(id) ON DELETE SET NULL,
  symbol TEXT NOT NULL,
  prev_direction TEXT,
  prev_probability NUMERIC,
  new_direction TEXT NOT NULL,
  new_probability NUMERIC NOT NULL,
  new_target_price NUMERIC,
  new_stop_price NUMERIC,
  price_at_revision NUMERIC,
  reasoning TEXT,
  trigger TEXT NOT NULL DEFAULT 'news',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.forecast_revisions TO authenticated;
GRANT ALL ON public.forecast_revisions TO service_role;
ALTER TABLE public.forecast_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read revisions" ON public.forecast_revisions FOR SELECT TO authenticated USING (true);

CREATE INDEX idx_revisions_forecast ON public.forecast_revisions(forecast_id, created_at DESC);
CREATE INDEX idx_revisions_symbol ON public.forecast_revisions(symbol, created_at DESC);

CREATE TRIGGER trg_econ_events_updated
BEFORE UPDATE ON public.economic_events
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
