
-- 1) Restrict SELECT on market/forecast tables to authenticated users only
DROP POLICY IF EXISTS "Anyone can view forex prices" ON public.forex_prices;
CREATE POLICY "Authenticated can view forex prices" ON public.forex_prices
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view forex features" ON public.forex_features;
CREATE POLICY "Authenticated can view forex features" ON public.forex_features
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view forex ohlcv" ON public.forex_ohlcv;
CREATE POLICY "Authenticated can view forex ohlcv" ON public.forex_ohlcv
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Public can read forecasts" ON public.daily_forecasts;
CREATE POLICY "Authenticated can read forecasts" ON public.daily_forecasts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can read market reviews" ON public.daily_market_reviews;
CREATE POLICY "Authenticated can read market reviews" ON public.daily_market_reviews
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Public can read stats" ON public.forecast_stats;
CREATE POLICY "Authenticated can read forecast stats" ON public.forecast_stats
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can read signal outcomes" ON public.signal_outcomes;
CREATE POLICY "Authenticated can read signal outcomes" ON public.signal_outcomes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Public can read backfill jobs" ON public.backfill_jobs;
CREATE POLICY "Authenticated can read backfill jobs" ON public.backfill_jobs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Public read economic events" ON public.economic_events;
CREATE POLICY "Authenticated can read economic events" ON public.economic_events
  FOR SELECT TO authenticated USING (true);

-- Revoke anon SELECT grants on these tables
REVOKE SELECT ON public.forex_prices, public.forex_features, public.forex_ohlcv,
  public.daily_forecasts, public.daily_market_reviews, public.forecast_stats,
  public.signal_outcomes, public.backfill_jobs, public.economic_events FROM anon;

-- 2) Restrict forecast_revisions to subscribed users
DROP POLICY IF EXISTS "Authenticated read revisions" ON public.forecast_revisions;
CREATE POLICY "Subscribed users can read revisions" ON public.forecast_revisions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.subscribers s
      WHERE s.user_id = auth.uid() AND s.subscribed = true
    )
  );

-- 3) Convert data-reading SECURITY DEFINER functions to SECURITY INVOKER
ALTER FUNCTION public.get_latest_forex_price(text) SECURITY INVOKER;
ALTER FUNCTION public.get_latest_features(text, text) SECURITY INVOKER;
ALTER FUNCTION public.get_latest_ohlcv(text, text, integer) SECURITY INVOKER;
ALTER FUNCTION public.upsert_forex_price(text, numeric, numeric, numeric, integer, numeric, text) SECURITY INVOKER;

-- 4) Revoke EXECUTE on internal SECURITY DEFINER functions from anon/authenticated
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
