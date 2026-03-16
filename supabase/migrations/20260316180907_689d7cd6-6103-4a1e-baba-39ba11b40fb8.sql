
CREATE OR REPLACE FUNCTION public.calibration_analytics()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total_runs', count(*),
    'avg_delta', round(avg(score_delta)::numeric, 2),
    'median_delta', (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY score_delta) FROM calibration_runs),
    'pct_improved', round(100.0 * count(*) FILTER (WHERE score_delta > 0) / GREATEST(count(*), 1), 1),
    'pct_unchanged', round(100.0 * count(*) FILTER (WHERE score_delta = 0) / GREATEST(count(*), 1), 1),
    'pct_decreased', round(100.0 * count(*) FILTER (WHERE score_delta < 0) / GREATEST(count(*), 1), 1),
    'dimension_frequency', (
      SELECT jsonb_object_agg(dim, cnt ORDER BY cnt DESC)
      FROM (
        SELECT unnest(improved_dimensions) AS dim, count(*) AS cnt
        FROM calibration_runs
        GROUP BY dim
      ) sub
    )
  )
  FROM calibration_runs;
$$;
