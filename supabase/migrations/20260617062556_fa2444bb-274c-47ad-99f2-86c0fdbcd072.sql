
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE public.daily_market_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session TEXT NOT NULL,
  market_context TEXT NOT NULL,
  pairs_analysis JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_features JSONB,
  ai_provider TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_daily_market_reviews_created_at ON public.daily_market_reviews (created_at DESC);

GRANT SELECT ON public.daily_market_reviews TO authenticated, anon;
GRANT ALL ON public.daily_market_reviews TO service_role;

ALTER TABLE public.daily_market_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read market reviews"
  ON public.daily_market_reviews
  FOR SELECT
  USING (true);
