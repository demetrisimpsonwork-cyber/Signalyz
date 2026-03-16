CREATE TABLE public.calibration_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  run_id uuid,
  original_score integer NOT NULL,
  calibrated_score integer NOT NULL,
  score_delta integer NOT NULL,
  improved_dimensions text[] NOT NULL DEFAULT '{}',
  unchanged_dimensions text[] NOT NULL DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.calibration_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage calibration_runs"
ON public.calibration_runs FOR ALL
TO public
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can view own calibration_runs"
ON public.calibration_runs FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own calibration_runs"
ON public.calibration_runs FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Block anon on calibration_runs"
ON public.calibration_runs FOR SELECT
TO anon
USING (false);