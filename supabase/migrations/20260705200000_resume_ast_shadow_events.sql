-- Resume AST Shadow Observatory: anonymized parse telemetry (no resume/JD text, no PII).

CREATE TABLE public.resume_ast_shadow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  request_id text,
  run_id text,
  ast_version text NOT NULL DEFAULT '1.0.0',
  source_parse_ok boolean NOT NULL DEFAULT false,
  generated_parse_ok boolean NOT NULL DEFAULT false,
  source_sections integer NOT NULL DEFAULT 0,
  generated_sections integer NOT NULL DEFAULT 0,
  source_bullets integer NOT NULL DEFAULT 0,
  generated_bullets integer NOT NULL DEFAULT 0,
  source_skills integer NOT NULL DEFAULT 0,
  generated_skills integer NOT NULL DEFAULT 0,
  validation_error_count integer NOT NULL DEFAULT 0,
  warning_count integer NOT NULL DEFAULT 0,
  round_trip_fidelity numeric(8, 4) NOT NULL DEFAULT 0,
  bullet_preservation_score numeric(8, 4) NOT NULL DEFAULT 0,
  keyword_preservation_score numeric(8, 4) NOT NULL DEFAULT 0,
  missing_section_count integer NOT NULL DEFAULT 0,
  added_section_count integer NOT NULL DEFAULT 0,
  parse_time_ms integer NOT NULL DEFAULT 0,
  fingerprint_changed boolean NOT NULL DEFAULT false,
  error_class text,
  CONSTRAINT resume_ast_shadow_events_request_unique UNIQUE (request_id)
);

CREATE INDEX resume_ast_shadow_events_created_at_idx
  ON public.resume_ast_shadow_events (created_at DESC);

CREATE INDEX resume_ast_shadow_events_fidelity_idx
  ON public.resume_ast_shadow_events (round_trip_fidelity, created_at DESC);

ALTER TABLE public.resume_ast_shadow_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated insert resume_ast_shadow_events"
  ON public.resume_ast_shadow_events
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anonymous insert resume_ast_shadow_events"
  ON public.resume_ast_shadow_events
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Service role manages resume_ast_shadow_events"
  ON public.resume_ast_shadow_events
  FOR ALL
  TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
