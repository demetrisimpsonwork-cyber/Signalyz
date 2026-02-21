
-- Runs table for deterministic mode caching
CREATE TABLE public.runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  input_hash TEXT NOT NULL,
  deterministic BOOLEAN NOT NULL DEFAULT true,
  pipeline_version TEXT NOT NULL DEFAULT '1.2',
  status TEXT NOT NULL DEFAULT 'pending',
  model_name TEXT,
  total_score INTEGER,
  pct NUMERIC(5,1),
  overall_seniority_alignment TEXT,
  top_3_gaps JSONB,
  final_package JSONB,
  user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for hash lookups
CREATE INDEX idx_runs_input_hash ON public.runs (input_hash);
CREATE INDEX idx_runs_user_id ON public.runs (user_id);

-- Run artifacts table for step-level persistence
CREATE TABLE public.run_artifacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  step_name TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_run_artifacts_run_id ON public.run_artifacts (run_id);

-- Enable RLS
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.run_artifacts ENABLE ROW LEVEL SECURITY;

-- Runs: anyone can read completed runs (for QA replay), authenticated users can insert
CREATE POLICY "Anyone can read completed runs" ON public.runs FOR SELECT USING (true);
CREATE POLICY "Anyone can insert runs" ON public.runs FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update runs" ON public.runs FOR UPDATE USING (true);

-- Run artifacts: readable by anyone, insertable by anyone (edge function uses service role)
CREATE POLICY "Anyone can read run artifacts" ON public.run_artifacts FOR SELECT USING (true);
CREATE POLICY "Anyone can insert run artifacts" ON public.run_artifacts FOR INSERT WITH CHECK (true);
