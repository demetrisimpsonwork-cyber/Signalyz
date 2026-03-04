
-- Alignment history table for Pro users
CREATE TABLE public.alignment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  inferred_role text NOT NULL DEFAULT '',
  score integer NOT NULL DEFAULT 0,
  strength_label text NOT NULL DEFAULT 'Weak',
  top_gap text,
  resume_built boolean NOT NULL DEFAULT false,
  full_result_json jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.alignment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own history"
  ON public.alignment_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own history"
  ON public.alignment_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own history"
  ON public.alignment_history FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Add onboarding fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_skipped boolean NOT NULL DEFAULT false;
