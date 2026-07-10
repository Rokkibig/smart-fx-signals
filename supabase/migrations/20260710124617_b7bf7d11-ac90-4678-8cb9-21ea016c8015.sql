-- Backfill evaluation fields for terminal forecasts that were closed before scoring was added.
UPDATE public.daily_forecasts
SET
  evaluated_at = COALESCE(evaluated_at, updated_at, now()),
  hit_target = CASE WHEN status = 'HIT_TARGET' THEN true WHEN status = 'HIT_STOP' THEN false ELSE hit_target END,
  hit_stop = CASE WHEN status = 'HIT_STOP' THEN true WHEN status = 'HIT_TARGET' THEN false ELSE hit_stop END,
  accuracy_score = CASE
    WHEN status = 'HIT_TARGET' THEN 90
    WHEN status = 'HIT_STOP' THEN 5
    ELSE accuracy_score
  END,
  actual_direction = CASE
    WHEN status = 'HIT_TARGET' AND direction IN ('up', 'down') THEN direction
    WHEN status = 'HIT_STOP' AND direction = 'up' THEN 'down'
    WHEN status = 'HIT_STOP' AND direction = 'down' THEN 'up'
    ELSE actual_direction
  END,
  actual_move_pips = COALESCE(actual_move_pips, 0),
  evaluation_notes = COALESCE(
    evaluation_notes,
    CASE
      WHEN status = 'HIT_TARGET' THEN 'TP був досягнутий до додавання scoring-backfill'
      WHEN status = 'HIT_STOP' THEN 'SL був досягнутий до додавання scoring-backfill'
      ELSE evaluation_notes
    END
  )
WHERE status IN ('HIT_TARGET', 'HIT_STOP')
  AND accuracy_score IS NULL;

-- Rebuild forecast_stats from evaluated forecasts so the header quality badge reflects real data.
WITH per_symbol AS (
  SELECT
    symbol,
    count(*)::integer AS total_forecasts,
    count(*) FILTER (WHERE direction = actual_direction)::integer AS correct_direction,
    count(*) FILTER (WHERE hit_target IS TRUE)::integer AS hit_target_count,
    count(*) FILTER (WHERE hit_stop IS TRUE)::integer AS hit_stop_count,
    round(avg(COALESCE(accuracy_score, 0))::numeric, 2) AS avg_accuracy,
    round(avg(COALESCE(probability, 0))::numeric, 2) AS avg_probability,
    max(evaluated_at) AS last_evaluated_at
  FROM public.daily_forecasts
  WHERE evaluated_at IS NOT NULL
  GROUP BY symbol
)
INSERT INTO public.forecast_stats (
  symbol,
  total_forecasts,
  correct_direction,
  hit_target_count,
  hit_stop_count,
  avg_accuracy,
  avg_probability,
  recent_mistakes,
  last_evaluated_at,
  updated_at
)
SELECT
  symbol,
  total_forecasts,
  correct_direction,
  hit_target_count,
  hit_stop_count,
  avg_accuracy,
  avg_probability,
  '[]'::jsonb,
  last_evaluated_at,
  now()
FROM per_symbol
ON CONFLICT (symbol) DO UPDATE SET
  total_forecasts = EXCLUDED.total_forecasts,
  correct_direction = EXCLUDED.correct_direction,
  hit_target_count = EXCLUDED.hit_target_count,
  hit_stop_count = EXCLUDED.hit_stop_count,
  avg_accuracy = EXCLUDED.avg_accuracy,
  avg_probability = EXCLUDED.avg_probability,
  last_evaluated_at = EXCLUDED.last_evaluated_at,
  updated_at = now();