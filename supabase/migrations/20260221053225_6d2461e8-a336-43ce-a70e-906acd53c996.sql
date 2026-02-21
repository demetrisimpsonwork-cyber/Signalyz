
ALTER TABLE public.runs
  ADD COLUMN final_resume_text TEXT,
  ADD COLUMN changes_diff JSONB,
  ADD COLUMN export_ready BOOLEAN NOT NULL DEFAULT false;
