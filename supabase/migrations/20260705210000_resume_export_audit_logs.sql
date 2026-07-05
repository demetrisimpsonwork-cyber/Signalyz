-- Export audit logs: sanitized export validation telemetry (no resume/JD text, no PII).

CREATE TABLE public.resume_export_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  request_id text,
  export_id text NOT NULL,
  user_id uuid,
  export_type text NOT NULL CHECK (export_type IN ('docx', 'pdf')),
  template_family text NOT NULL DEFAULT 'signalyz-calibrated',
  template_version text NOT NULL DEFAULT '1.0.0',
  renderer text NOT NULL DEFAULT 'unknown',
  qa_score integer,
  qa_verdict text,
  ast_fingerprint text,
  artifact_sha256 text NOT NULL,
  artifact_bytes integer NOT NULL DEFAULT 0,
  render_ms integer NOT NULL DEFAULT 0,
  validation_passed boolean NOT NULL DEFAULT false,
  validation_warning_count integer NOT NULL DEFAULT 0,
  validation_error_count integer NOT NULL DEFAULT 0,
  link_count integer NOT NULL DEFAULT 0,
  broken_link_count integer NOT NULL DEFAULT 0,
  missing_expected_link_count integer NOT NULL DEFAULT 0,
  duplicate_link_count integer NOT NULL DEFAULT 0,
  section_count integer NOT NULL DEFAULT 0,
  bullet_count integer NOT NULL DEFAULT 0,
  page_count integer,
  error_class text,
  sanitizer_version text NOT NULL DEFAULT '10.0',
  CONSTRAINT resume_export_audit_logs_export_unique UNIQUE (export_id)
);

CREATE INDEX resume_export_audit_logs_created_at_idx
  ON public.resume_export_audit_logs (created_at DESC);

CREATE INDEX resume_export_audit_logs_export_type_idx
  ON public.resume_export_audit_logs (export_type, created_at DESC);

CREATE INDEX resume_export_audit_logs_validation_idx
  ON public.resume_export_audit_logs (validation_passed, created_at DESC);

ALTER TABLE public.resume_export_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated insert resume_export_audit_logs"
  ON public.resume_export_audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anonymous insert resume_export_audit_logs"
  ON public.resume_export_audit_logs
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Service role manages resume_export_audit_logs"
  ON public.resume_export_audit_logs
  FOR ALL
  TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
