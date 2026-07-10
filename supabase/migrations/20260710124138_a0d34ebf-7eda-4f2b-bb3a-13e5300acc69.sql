-- Закриваємо старі оцінені прогнози, що застрягли в ACTIVE
UPDATE public.daily_forecasts
SET status = CASE
  WHEN hit_target = true THEN 'HIT_TARGET'
  WHEN hit_stop = true THEN 'HIT_STOP'
  ELSE 'EXPIRED'
END
WHERE status = 'ACTIVE' AND evaluated_at IS NOT NULL;