-- Signalyzed repair sandbox events (Phase 3H): in-memory repair simulation audit — no raw text, no PII.

CREATE TABLE public.signalyzed_repair_sandbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  request_id text,
  export_id text,
  candidate_type text NOT NULL DEFAULT 'none',
  sandbox_repair_type text NOT NULL DEFAULT 'none',
  before_score integer NOT NULL,
  after_score integer NOT NULL,
  score_delta integer NOT NULL,
  before_verdict text NOT NULL CHECK (before_verdict IN ('ready', 'needs_review', 'unsafe')),
  after_verdict text NOT NULL CHECK (after_verdict IN ('ready', 'needs_review', 'unsafe')),
  hard_blocker_delta integer NOT NULL DEFAULT 0,
  warning_delta integer NOT NULL DEFAULT 0,
  risk_level text NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  sandbox_result text NOT NULL CHECK (sandbox_result IN ('improved', 'no_change', 'regressed', 'unsafe_to_apply')),
  recommended_next_step text NOT NULL CHECK (
    recommended_next_step IN (
      'eligible_for_future_auto_repair',
      'keep_human_review',
      'do_not_apply',
      'needs_more_data'
    )
  ),
  diagnostic_codes_before jsonb NOT NULL DEFAULT '[]'::jsonb,
  diagnostic_codes_after jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_candidate_action text NOT NULL DEFAULT 'monitor_only',
  sanitizer_version text NOT NULL DEFAULT '1.0',
  CONSTRAINT signalyzed_repair_sandbox_events_export_unique UNIQUE (export_id)
);

CREATE INDEX signalyzed_repair_sandbox_events_created_at_idx
  ON public.signalyzed_repair_sandbox_events (created_at DESC);

CREATE INDEX signalyzed_repair_sandbox_events_result_idx
  ON public.signalyzed_repair_sandbox_events (sandbox_result, created_at DESC);

CREATE INDEX signalyzed_repair_sandbox_events_repair_type_idx
  ON public.signalyzed_repair_sandbox_events (sandbox_repair_type, created_at DESC);

ALTER TABLE public.signalyzed_repair_sandbox_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated insert signalyzed_repair_sandbox_events"
  ON public.signalyzed_repair_sandbox_events
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anonymous insert signalyzed_repair_sandbox_events"
  ON public.signalyzed_repair_sandbox_events
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Service role manages signalyzed_repair_sandbox_events"
  ON public.signalyzed_repair_sandbox_events
  FOR ALL
  TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
