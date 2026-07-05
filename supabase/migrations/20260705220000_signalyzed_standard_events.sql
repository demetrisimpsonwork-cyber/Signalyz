-- Signalyzed Standard v0 events: unified export quality verdict (no resume/JD text, no PII).

CREATE TABLE public.signalyzed_standard_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  request_id text,
  export_id text,
  standard_version text NOT NULL DEFAULT '0.1.0',
  export_type text CHECK (export_type IN ('docx', 'pdf')),
  template_version text,
  signalyzed_score integer NOT NULL DEFAULT 0,
  verdict text NOT NULL CHECK (verdict IN ('ready', 'needs_review', 'unsafe')),
  confidence text NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  hard_blocker_count integer NOT NULL DEFAULT 0,
  warning_count integer NOT NULL DEFAULT 0,
  diagnostic_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  category_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommended_action text NOT NULL DEFAULT 'keep_shadow',
  source_reports_present jsonb NOT NULL DEFAULT '{}'::jsonb,
  sanitizer_version text NOT NULL DEFAULT '1.0',
  CONSTRAINT signalyzed_standard_events_export_unique UNIQUE (export_id)
);

CREATE INDEX signalyzed_standard_events_created_at_idx
  ON public.signalyzed_standard_events (created_at DESC);

CREATE INDEX signalyzed_standard_events_verdict_idx
  ON public.signalyzed_standard_events (verdict, created_at DESC);

CREATE INDEX signalyzed_standard_events_score_idx
  ON public.signalyzed_standard_events (signalyzed_score, created_at DESC);

ALTER TABLE public.signalyzed_standard_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated insert signalyzed_standard_events"
  ON public.signalyzed_standard_events
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anonymous insert signalyzed_standard_events"
  ON public.signalyzed_standard_events
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Service role manages signalyzed_standard_events"
  ON public.signalyzed_standard_events
  FOR ALL
  TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
