import type { ExportResumeModel } from "@/lib/resumeExportModel";
import {
  DOCX_RENDERER,
  EXPORT_SANITIZER_VERSION,
  EXPORT_TEMPLATE_FAMILY,
  EXPORT_TEMPLATE_VERSION,
  PDF_RENDERER,
  buildExportValidationContextFromModel,
  buildExportValidationReport,
  fingerprintExportBytes,
  summarizeValidation,
  validateDocxExport,
  validatePdfExport,
  type ExportType,
} from "@/lib/exportValidation";
import { logExportValidationReport, persistExportAuditObservatory } from "@/lib/exportAuditObservatory";

export function isExportValidationShadowEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_EXPORT_VALIDATION_SHADOW === "true";
}

export interface RunExportValidationShadowInput {
  exportType: ExportType;
  bytes: ArrayBuffer;
  model: ExportResumeModel;
  exportId?: string;
  requestId?: string;
  renderMs: number;
  userId?: string | null;
  qaScore?: number | null;
  qaVerdict?: string | null;
  astFingerprint?: string | null;
}

/** Observational export validation. Never throws; never blocks export. */
export async function runExportValidationShadow(input: RunExportValidationShadowInput): Promise<void> {
  if (!isExportValidationShadowEnabled()) return;

  try {
    const ctx = buildExportValidationContextFromModel(input.model);
    const result =
      input.exportType === "docx"
        ? await validateDocxExport(input.bytes, ctx)
        : await validatePdfExport(input.bytes, ctx);

    const summary = summarizeValidation(result);
    const exportId = input.exportId ?? crypto.randomUUID();
    const renderer = input.exportType === "docx" ? DOCX_RENDERER : PDF_RENDERER;

    const report = buildExportValidationReport({
      requestId: input.requestId,
      exportId,
      exportType: input.exportType,
      templateFamily: EXPORT_TEMPLATE_FAMILY,
      templateVersion: EXPORT_TEMPLATE_VERSION,
      renderer,
      artifactBytes: input.bytes.byteLength,
      renderMs: input.renderMs,
      validationPassed: result.passed,
      validationWarningCount: summary.warningCount,
      validationErrorCount: summary.errorCount,
      linkCount: result.linkCount,
      brokenLinkCount: result.brokenLinkCount,
      missingExpectedLinkCount: result.missingExpectedLinkCount,
      duplicateLinkCount: result.duplicateLinkCount,
      sectionCount: result.sectionCount,
      bulletCount: result.bulletCount,
      pageCount: result.pageCount,
      errorClass: summary.errorClass,
    });

    logExportValidationReport(report);
    const artifactSha256 = await fingerprintExportBytes(input.bytes);
    persistExportAuditObservatory({
      report,
      artifactSha256,
      userId: input.userId,
      qaScore: input.qaScore,
      qaVerdict: input.qaVerdict,
      astFingerprint: input.astFingerprint,
      sanitizerVersion: EXPORT_SANITIZER_VERSION,
    });

    const { runSignalyzedStandardShadow } = await import("@/lib/signalyzedStandardShadow");
    runSignalyzedStandardShadow({
      exportReport: report,
      exportDiagnosticCodes: result.diagnostics.map((d) => d.code),
    });
  } catch {
    /* shadow must never block or surface */
  }
}
