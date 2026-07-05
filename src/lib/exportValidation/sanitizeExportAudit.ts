import type { ExportAuditLogRow, ExportValidationReport } from "./types";

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/g;
const URL_RE = /https?:\/\/[^\s|]+/gi;
const NAME_LIKE_RE = /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g;

/** Strip PII and raw link values from free-text fields before logging. */
export function sanitizeExportAuditText(input: string): string {
  return input
    .replace(EMAIL_RE, "[redacted-email]")
    .replace(PHONE_RE, "[redacted-phone]")
    .replace(URL_RE, "[redacted-link]")
    .replace(NAME_LIKE_RE, "[redacted-name]");
}

export function buildExportValidationReport(input: {
  requestId?: string;
  exportId: string;
  exportType: ExportValidationReport["export_type"];
  templateFamily: string;
  templateVersion: string;
  renderer: string;
  artifactBytes: number;
  renderMs: number;
  validationPassed: boolean;
  validationWarningCount: number;
  validationErrorCount: number;
  linkCount: number;
  brokenLinkCount: number;
  missingExpectedLinkCount: number;
  duplicateLinkCount: number;
  sectionCount: number;
  bulletCount: number;
  pageCount: number | null;
  errorClass?: string;
}): ExportValidationReport {
  return {
    event: "resume_export_validation_report",
    request_id: input.requestId,
    export_id: input.exportId,
    export_type: input.exportType,
    template_family: input.templateFamily,
    template_version: input.templateVersion,
    renderer: input.renderer,
    artifact_bytes: input.artifactBytes,
    render_ms: input.renderMs,
    validation_passed: input.validationPassed,
    validation_warning_count: input.validationWarningCount,
    validation_error_count: input.validationErrorCount,
    link_count: input.linkCount,
    broken_link_count: input.brokenLinkCount,
    missing_expected_link_count: input.missingExpectedLinkCount,
    duplicate_link_count: input.duplicateLinkCount,
    section_count: input.sectionCount,
    bullet_count: input.bulletCount,
    page_count: input.pageCount,
    error_class: input.errorClass,
  };
}

export function toExportAuditLogRow(input: {
  report: ExportValidationReport;
  artifactSha256: string;
  userId?: string | null;
  qaScore?: number | null;
  qaVerdict?: string | null;
  astFingerprint?: string | null;
  sanitizerVersion: string;
}): ExportAuditLogRow {
  const { report } = input;
  return {
    request_id: report.request_id ?? null,
    export_id: report.export_id,
    user_id: input.userId ?? null,
    export_type: report.export_type,
    template_family: report.template_family,
    template_version: report.template_version,
    renderer: report.renderer,
    qa_score: input.qaScore ?? null,
    qa_verdict: input.qaVerdict ?? null,
    ast_fingerprint: input.astFingerprint ?? null,
    artifact_sha256: input.artifactSha256,
    artifact_bytes: report.artifact_bytes,
    render_ms: report.render_ms,
    validation_passed: report.validation_passed,
    validation_warning_count: report.validation_warning_count,
    validation_error_count: report.validation_error_count,
    link_count: report.link_count,
    broken_link_count: report.broken_link_count,
    missing_expected_link_count: report.missing_expected_link_count,
    duplicate_link_count: report.duplicate_link_count,
    section_count: report.section_count,
    bullet_count: report.bullet_count,
    page_count: report.page_count,
    error_class: report.error_class ?? null,
    sanitizer_version: input.sanitizerVersion,
  };
}

/** Verify report payload contains no obvious PII patterns. */
export function assertNoPiiInAuditPayload(payload: Record<string, unknown>): boolean {
  const serialized = JSON.stringify(payload);
  if (EMAIL_RE.test(serialized)) return false;
  if (/https?:\/\//i.test(serialized)) return false;
  if (/@/.test(serialized)) return false;
  return true;
}
