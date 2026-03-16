
ALTER TABLE public.calibration_runs
  ADD COLUMN IF NOT EXISTS dimensions_improved_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dimensions_unchanged_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retry_pass_triggered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS calibration_pass_number integer NOT NULL DEFAULT 1;
