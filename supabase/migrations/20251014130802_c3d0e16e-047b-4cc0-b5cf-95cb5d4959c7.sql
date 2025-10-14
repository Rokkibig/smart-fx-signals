-- Create forex_prices table for storing current and historical prices
CREATE TABLE IF NOT EXISTS public.forex_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  price NUMERIC(12, 5) NOT NULL,
  bid NUMERIC(12, 5),
  ask NUMERIC(12, 5),
  volume INTEGER DEFAULT 0,
  spread NUMERIC(12, 5),
  source TEXT DEFAULT 'manual',
  price_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for fast lookups by symbol and timestamp
CREATE INDEX idx_forex_prices_symbol ON public.forex_prices(symbol);
CREATE INDEX idx_forex_prices_timestamp ON public.forex_prices(price_timestamp DESC);
CREATE INDEX idx_forex_prices_symbol_timestamp ON public.forex_prices(symbol, price_timestamp DESC);

-- Enable Row Level Security
ALTER TABLE public.forex_prices ENABLE ROW LEVEL SECURITY;

-- Everyone can read prices (public data)
CREATE POLICY "Anyone can view forex prices"
  ON public.forex_prices
  FOR SELECT
  USING (true);

-- Only authenticated users can insert prices
CREATE POLICY "Authenticated users can insert prices"
  ON public.forex_prices
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Only authenticated users can update prices
CREATE POLICY "Authenticated users can update prices"
  ON public.forex_prices
  FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Create trigger for updated_at
CREATE TRIGGER update_forex_prices_updated_at
  BEFORE UPDATE ON public.forex_prices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Create function to get latest price for a symbol
CREATE OR REPLACE FUNCTION public.get_latest_forex_price(p_symbol TEXT)
RETURNS TABLE (
  symbol TEXT,
  price NUMERIC,
  bid NUMERIC,
  ask NUMERIC,
  volume INTEGER,
  spread NUMERIC,
  source TEXT,
  price_timestamp TIMESTAMPTZ
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    symbol,
    price,
    bid,
    ask,
    volume,
    spread,
    source,
    price_timestamp
  FROM public.forex_prices
  WHERE symbol = p_symbol
  ORDER BY price_timestamp DESC
  LIMIT 1;
$$;

-- Create function to upsert (insert or update) latest price
CREATE OR REPLACE FUNCTION public.upsert_forex_price(
  p_symbol TEXT,
  p_price NUMERIC,
  p_bid NUMERIC DEFAULT NULL,
  p_ask NUMERIC DEFAULT NULL,
  p_volume INTEGER DEFAULT 0,
  p_spread NUMERIC DEFAULT NULL,
  p_source TEXT DEFAULT 'api'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Insert new price record
  INSERT INTO public.forex_prices (symbol, price, bid, ask, volume, spread, source, price_timestamp)
  VALUES (p_symbol, p_price, p_bid, p_ask, p_volume, p_spread, p_source, now())
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;