-- Launch readiness: post-report user feedback (no resume/JD text).

CREATE TABLE public.user_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id text,
  source text NOT NULL DEFAULT 'hiring_report'
    CHECK (source IN ('hiring_report', 'calibrated_resume', 'cover_letter', 'general')),
  useful boolean,
  applied_with_resume boolean,
  outcome text CHECK (outcome IS NULL OR outcome IN ('interview', 'rejected', 'waiting')),
  comment text CHECK (comment IS NULL OR char_length(comment) <= 2000),
  request_id text,
  report_run_fingerprint text,
  pipeline_version text,
  plan_tier text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_feedback_created_at_idx ON public.user_feedback (created_at DESC);
CREATE INDEX user_feedback_source_idx ON public.user_feedback (source, created_at DESC);
CREATE INDEX user_feedback_request_id_idx ON public.user_feedback (request_id) WHERE request_id IS NOT NULL;

ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;

-- Anyone signed in inserts own row; anonymous inserts with null user_id.
CREATE POLICY "Users insert own feedback"
  ON public.user_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "Anonymous insert feedback"
  ON public.user_feedback
  FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL);

CREATE POLICY "Admins read all feedback"
  ON public.user_feedback
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
