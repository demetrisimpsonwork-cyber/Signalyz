-- Signalyzed repair candidate queue (Phase 3G): advisory auto-repair candidates only — no raw text, no PII.

CREATE TABLE public.signalyzed_repair_candidate_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  request_id text,
  export_id text,
  export_type text CHECK (export_type IN ('docx', 'pdf')),
  candidate boolean NOT NULL DEFAULT false,
  candidate_type text NOT NULL DEFAULT 'none',
  risk_level text NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  confidence text NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  source_diagnostic_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_future_action text NOT NULL DEFAULT 'monitor_only',
  reason_code text NOT NULL DEFAULT 'unknown',
  standard_score integer,
  standard_verdict text CHECK (standard_verdict IN ('ready', 'needs_review', 'unsafe')),
  internal_label text CHECK (internal_label IN ('READY_INTERNAL', 'REVIEW_INTERNAL', 'UNSAFE_INTERNAL')),
  sanitizer_version text NOT NULL DEFAULT '1.0',
  CONSTRAINT signalyzed_repair_candidate_events_export_unique UNIQUE (export_id)
);

CREATE INDEX signalyzed_repair_candidate_events_created_at_idx
  ON public.signalyzed_repair_candidate_events (created_at DESC);

CREATE INDEX signalyzed_repair_candidate_events_candidate_idx
  ON public.signalyzed_repair_candidate_events (candidate, created_at DESC);

CREATE INDEX signalyzed_repair_candidate_events_type_idx
  ON public.signalyzed_repair_candidate_events (candidate_type, created_at DESC);

ALTER TABLE public.signalyzed_repair_candidate_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated insert signalyzed_repair_candidate_events"
  ON public.signalyzed_repair_candidate_events
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anonymous insert signalyzed_repair_candidate_events"
  ON public.signalyzed_repair_candidate_events
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Service role manages signalyzed_repair_candidate_events"
  ON public.signalyzed_repair_candidate_events
  FOR ALL
  TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
