
CREATE TABLE public.signal_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID REFERENCES public.daily_market_reviews(id) ON DELETE SET NULL,
  pair TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('LONG','SHORT')),
  entry NUMERIC NOT NULL,
  sl NUMERIC NOT NULL,
  tp NUMERIC NOT NULL,
  rr NUMERIC,
  confidence NUMERIC,
  atr_at_entry NUMERIC,
  adx_at_entry NUMERIC,
  trigger TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','TP','SL','EXPIRED')),
  expected_pnl NUMERIC,
  realized_pnl NUMERIC,
  surprise_ratio NUMERIC,
  exit_price NUMERIC,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '48 hours')
);

CREATE INDEX idx_signal_outcomes_status ON public.signal_outcomes(status);
CREATE INDEX idx_signal_outcomes_pair ON public.signal_outcomes(pair);
CREATE INDEX idx_signal_outcomes_opened_at ON public.signal_outcomes(opened_at DESC);

GRANT SELECT ON public.signal_outcomes TO anon, authenticated;
GRANT ALL ON public.signal_outcomes TO service_role;

ALTER TABLE public.signal_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read signal outcomes"
  ON public.signal_outcomes FOR SELECT
  USING (true);
