GRANT SELECT ON public.forex_prices TO anon;
DROP POLICY IF EXISTS "Authenticated can read forex_prices" ON public.forex_prices;
CREATE POLICY "Public can read forex_prices" ON public.forex_prices FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON public.forex_features TO anon;
DROP POLICY IF EXISTS "Authenticated can read forex_features" ON public.forex_features;
CREATE POLICY "Public can read forex_features" ON public.forex_features FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON public.forex_ohlcv TO anon;
DROP POLICY IF EXISTS "Authenticated can read forex_ohlcv" ON public.forex_ohlcv;
CREATE POLICY "Public can read forex_ohlcv" ON public.forex_ohlcv FOR SELECT TO anon, authenticated USING (true);

GRANT EXECUTE ON FUNCTION public.get_latest_forex_price(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_latest_features(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_latest_ohlcv(text, text, integer) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.upsert_forex_price(text, numeric, numeric, numeric, integer, numeric, text) FROM anon, authenticated, public;