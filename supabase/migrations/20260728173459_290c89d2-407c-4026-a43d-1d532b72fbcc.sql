CREATE TABLE public.external_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  forecast_date date NOT NULL DEFAULT CURRENT_DATE,
  direction text NOT NULL,
  entry numeric,
  sl numeric,
  tp numeric,
  confidence numeric,
  horizon_hours integer,
  source text NOT NULL DEFAULT 'forex-market-data',
  raw jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (symbol, forecast_date, source)
);

GRANT SELECT ON public.external_forecasts TO authenticated;
GRANT ALL ON public.external_forecasts TO service_role;

ALTER TABLE public.external_forecasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "external_forecasts_read_auth"
ON public.external_forecasts
FOR SELECT TO authenticated
USING (true);

CREATE INDEX idx_external_forecasts_symbol_date
ON public.external_forecasts (symbol, forecast_date DESC);

ALTER TABLE public.daily_forecasts
  ADD COLUMN IF NOT EXISTS external_direction text,
  ADD COLUMN IF NOT EXISTS external_confidence numeric,
  ADD COLUMN IF NOT EXISTS external_agreement text;