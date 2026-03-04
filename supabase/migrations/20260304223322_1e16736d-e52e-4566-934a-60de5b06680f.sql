ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS calibrated_resume jsonb,
  ADD COLUMN IF NOT EXISTS calibrated_resume_edited jsonb,
  ADD COLUMN IF NOT EXISTS calibrated_resume_at timestamptz;