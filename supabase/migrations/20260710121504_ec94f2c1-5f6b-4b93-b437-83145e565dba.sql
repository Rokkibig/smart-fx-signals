
ALTER TABLE public.daily_forecasts
  ADD COLUMN IF NOT EXISTS current_entry NUMERIC,
  ADD COLUMN IF NOT EXISTS current_target NUMERIC,
  ADD COLUMN IF NOT EXISTS current_stop NUMERIC,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS adjustments_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invalidation_reason TEXT,
  ADD COLUMN IF NOT EXISTS last_revalidated_at TIMESTAMPTZ;

UPDATE public.daily_forecasts
SET current_entry = COALESCE(current_entry, price_at_forecast),
    current_target = COALESCE(current_target, target_price),
    current_stop = COALESCE(current_stop, stop_price)
WHERE current_entry IS NULL;

CREATE TABLE IF NOT EXISTS public.forecast_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_id UUID NOT NULL REFERENCES public.daily_forecasts(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  reason TEXT NOT NULL,
  old_entry NUMERIC, new_entry NUMERIC,
  old_target NUMERIC, new_target NUMERIC,
  old_stop NUMERIC, new_stop NUMERIC,
  live_price NUMERIC,
  atr_used NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.forecast_adjustments TO authenticated;
GRANT ALL ON public.forecast_adjustments TO service_role;

ALTER TABLE public.forecast_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read forecast_adjustments"
  ON public.forecast_adjustments FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_forecast_adjustments_forecast ON public.forecast_adjustments(forecast_id);
CREATE INDEX IF NOT EXISTS idx_daily_forecasts_status ON public.daily_forecasts(status);
