
-- 1) market_news
CREATE TABLE public.market_news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT,
  currency TEXT,
  headline TEXT NOT NULL,
  summary TEXT,
  url TEXT,
  source TEXT,
  sentiment NUMERIC,
  impact TEXT DEFAULT 'medium',
  published_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_market_news_pub ON public.market_news(published_at DESC);
CREATE INDEX idx_market_news_symbol ON public.market_news(symbol, published_at DESC);
CREATE INDEX idx_market_news_currency ON public.market_news(currency, published_at DESC);
GRANT SELECT ON public.market_news TO authenticated;
GRANT ALL ON public.market_news TO service_role;
ALTER TABLE public.market_news ENABLE ROW LEVEL SECURITY;
CREATE POLICY "news readable by authenticated" ON public.market_news FOR SELECT TO authenticated USING (true);

-- 2) news_blackouts
CREATE TABLE public.news_blackouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  currency TEXT NOT NULL,
  reason TEXT NOT NULL,
  event_ref UUID,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  impact TEXT DEFAULT 'high',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_blackouts_window ON public.news_blackouts(currency, starts_at, ends_at);
GRANT SELECT ON public.news_blackouts TO authenticated;
GRANT ALL ON public.news_blackouts TO service_role;
ALTER TABLE public.news_blackouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blackouts readable by authenticated" ON public.news_blackouts FOR SELECT TO authenticated USING (true);

-- 3) cot_positions
CREATE TABLE public.cot_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  currency TEXT NOT NULL,
  report_date DATE NOT NULL,
  non_commercial_long INTEGER,
  non_commercial_short INTEGER,
  net_position INTEGER,
  change_wow INTEGER,
  open_interest INTEGER,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(currency, report_date)
);
GRANT SELECT ON public.cot_positions TO authenticated;
GRANT ALL ON public.cot_positions TO service_role;
ALTER TABLE public.cot_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cot readable by authenticated" ON public.cot_positions FOR SELECT TO authenticated USING (true);

-- helper: check if any blackout is active for a currency at time t
CREATE OR REPLACE FUNCTION public.is_currency_in_blackout(p_currency TEXT, p_at TIMESTAMPTZ DEFAULT now())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.news_blackouts
    WHERE currency = p_currency
      AND p_at BETWEEN starts_at AND ends_at
  );
$$;
