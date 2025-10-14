-- Create forex_ohlcv table for storing historical candles
CREATE TABLE IF NOT EXISTS public.forex_ohlcv (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL, -- M15, H1, H4, D1
  bar_timestamp TIMESTAMPTZ NOT NULL,
  open NUMERIC(12, 5) NOT NULL,
  high NUMERIC(12, 5) NOT NULL,
  low NUMERIC(12, 5) NOT NULL,
  close NUMERIC(12, 5) NOT NULL,
  volume INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(symbol, timeframe, bar_timestamp)
);

-- Create index for fast queries
CREATE INDEX idx_ohlcv_symbol_tf ON public.forex_ohlcv(symbol, timeframe);
CREATE INDEX idx_ohlcv_timestamp ON public.forex_ohlcv(bar_timestamp DESC);
CREATE INDEX idx_ohlcv_symbol_tf_timestamp ON public.forex_ohlcv(symbol, timeframe, bar_timestamp DESC);

-- Enable Row Level Security
ALTER TABLE public.forex_ohlcv ENABLE ROW LEVEL SECURITY;

-- Everyone can read OHLCV data (public data)
CREATE POLICY "Anyone can view forex ohlcv"
  ON public.forex_ohlcv
  FOR SELECT
  USING (true);

-- Only authenticated users can insert OHLCV
CREATE POLICY "Authenticated users can insert ohlcv"
  ON public.forex_ohlcv
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Create forex_features table for storing calculated indicators
CREATE TABLE IF NOT EXISTS public.forex_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_close NUMERIC(12, 5) NOT NULL,
  ema_20 NUMERIC(12, 5),
  ema_50 NUMERIC(12, 5),
  ema_200 NUMERIC(12, 5),
  adx_14 NUMERIC(8, 2),
  rsi_14 NUMERIC(8, 2),
  atr_14 NUMERIC(12, 5),
  pivot_pp NUMERIC(12, 5),
  pivot_r1 NUMERIC(12, 5),
  pivot_r2 NUMERIC(12, 5),
  pivot_s1 NUMERIC(12, 5),
  pivot_s2 NUMERIC(12, 5),
  swing_highs JSONB,
  swing_lows JSONB,
  round_levels JSONB,
  session TEXT,
  trend_direction TEXT, -- ↗, ↘, →
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(symbol, timeframe, calculated_at)
);

-- Create index for features
CREATE INDEX idx_features_symbol_tf ON public.forex_features(symbol, timeframe);
CREATE INDEX idx_features_calculated ON public.forex_features(calculated_at DESC);
CREATE INDEX idx_features_symbol_tf_calculated ON public.forex_features(symbol, timeframe, calculated_at DESC);

-- Enable RLS
ALTER TABLE public.forex_features ENABLE ROW LEVEL SECURITY;

-- Everyone can read features
CREATE POLICY "Anyone can view forex features"
  ON public.forex_features
  FOR SELECT
  USING (true);

-- Only authenticated users can insert features
CREATE POLICY "Authenticated users can insert features"
  ON public.forex_features
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Function to get latest OHLCV bars
CREATE OR REPLACE FUNCTION public.get_latest_ohlcv(
  p_symbol TEXT,
  p_timeframe TEXT,
  p_count INTEGER DEFAULT 100
)
RETURNS TABLE (
  bar_timestamp TIMESTAMPTZ,
  open NUMERIC,
  high NUMERIC,
  low NUMERIC,
  close NUMERIC,
  volume INTEGER
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    bar_timestamp,
    open,
    high,
    low,
    close,
    volume
  FROM public.forex_ohlcv
  WHERE symbol = p_symbol AND timeframe = p_timeframe
  ORDER BY bar_timestamp DESC
  LIMIT p_count;
$$;

-- Function to get latest features
CREATE OR REPLACE FUNCTION public.get_latest_features(
  p_symbol TEXT,
  p_timeframe TEXT
)
RETURNS TABLE (
  symbol TEXT,
  timeframe TEXT,
  calculated_at TIMESTAMPTZ,
  last_close NUMERIC,
  ema_20 NUMERIC,
  ema_50 NUMERIC,
  ema_200 NUMERIC,
  adx_14 NUMERIC,
  rsi_14 NUMERIC,
  atr_14 NUMERIC,
  pivot_pp NUMERIC,
  pivot_r1 NUMERIC,
  pivot_r2 NUMERIC,
  pivot_s1 NUMERIC,
  pivot_s2 NUMERIC,
  swing_highs JSONB,
  swing_lows JSONB,
  round_levels JSONB,
  session TEXT,
  trend_direction TEXT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    symbol,
    timeframe,
    calculated_at,
    last_close,
    ema_20,
    ema_50,
    ema_200,
    adx_14,
    rsi_14,
    atr_14,
    pivot_pp,
    pivot_r1,
    pivot_r2,
    pivot_s1,
    pivot_s2,
    swing_highs,
    swing_lows,
    round_levels,
    session,
    trend_direction
  FROM public.forex_features
  WHERE symbol = p_symbol AND timeframe = p_timeframe
  ORDER BY calculated_at DESC
  LIMIT 1;
$$;