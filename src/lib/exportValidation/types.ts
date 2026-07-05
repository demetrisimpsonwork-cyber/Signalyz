/** Export validation — Initiative 002 Phase 3B. Observational only. */

export type ExportType = "docx" | "pdf";

export type ValidationSeverity = "error" | "warning" | "info";

export interface ExportValidationDiagnostic {
  code: string;
  severity: ValidationSeverity;
  message: string;
}

export interface ExportValidationContext {
  exportType: ExportType;
  artifactBytes: number;
  extractedText: string;
  expectedSectionLabels: string[];
  expectedLinkCount: number;
  expectedBulletCount: number;
  pageCount?: number | null;
  pdfValidationAvailable?: boolean;
}

export interface ExportValidationResult {
  passed: boolean;
  diagnostics: ExportValidationDiagnostic[];
  linkCount: number;
  brokenLinkCount: number;
  missingExpectedLinkCount: number;
  duplicateLinkCount: number;
  sectionCount: number;
  bulletCount: number;
  pageCount: number | null;
}

export interface ExportValidationReport {
  event: "resume_export_validation_report";
  request_id?: string;
  export_id: string;
  export_type: ExportType;
  template_family: string;
  template_version: string;
  renderer: string;
  artifact_bytes: number;
  render_ms: number;
  validation_passed: boolean;
  validation_warning_count: number;
  validation_error_count: number;
  link_count: number;
  broken_link_count: number;
  missing_expected_link_count: number;
  duplicate_link_count: number;
  section_count: number;
  bullet_count: number;
  page_count: number | null;
  error_class?: string;
}

export interface ExportAuditLogRow {
  request_id: string | null;
  export_id: string;
  user_id: string | null;
  export_type: ExportType;
  template_family: string;
  template_version: string;
  renderer: string;
  qa_score: number | null;
  qa_verdict: string | null;
  ast_fingerprint: string | null;
  artifact_sha256: string;
  artifact_bytes: number;
  render_ms: number;
  validation_passed: boolean;
  validation_warning_count: number;
  validation_error_count: number;
  link_count: number;
  broken_link_count: number;
  missing_expected_link_count: number;
  duplicate_link_count: number;
  section_count: number;
  bullet_count: number;
  page_count: number | null;
  error_class: string | null;
  sanitizer_version: string;
}
