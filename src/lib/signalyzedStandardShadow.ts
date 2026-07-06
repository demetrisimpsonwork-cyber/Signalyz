import {
  evaluateSignalyzedStandard,
  type ExportValidationSummary,
} from "@/lib/signalyzedStandard";
import { buildAndLogSignalyzedStandard } from "@/lib/signalyzedStandard/observability";
import { buildAndLogRepairCandidate } from "@/lib/signalyzedStandard/repairCandidates/observability";
import { buildAndLogRepairSandbox } from "@/lib/signalyzedStandard/repairSandbox/observability";
import type { ExportValidationReport } from "@/lib/exportValidation";
import {
  getSignalyzedSourceReports,
  rememberSignalyzedSourceReports,
} from "@/lib/signalyzedStandardContext";

export function isSignalyzedStandardShadowEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_SIGNALYZED_STANDARD_SHADOW === "true";
}

/** Phase 3H repair sandbox — default false; enable in Vercel Production after migration. */
export function isRepairSandboxShadowEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_REPAIR_SANDBOX_SHADOW === "true";
}

export function toExportValidationSummary(
  report: ExportValidationReport,
  diagnosticCodes?: string[],
): ExportValidationSummary {
  return {
    event: "resume_export_validation_report",
    request_id: report.request_id,
    export_id: report.export_id,
    export_type: report.export_type,
    template_version: report.template_version,
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
    error_class: report.error_class,
    diagnostic_codes: diagnosticCodes,
  };
}

export interface RunSignalyzedStandardShadowInput {
  exportReport: ExportValidationReport;
  exportDiagnosticCodes?: string[];
}

/** Observational Signalyzed Standard evaluation. Never throws; never blocks export. */
export function runSignalyzedStandardShadow(input: RunSignalyzedStandardShadowInput): void {
  if (!isSignalyzedStandardShadowEnabled()) return;

  try {
    const requestId = input.exportReport.request_id;
    const cached = getSignalyzedSourceReports(requestId);
    const exportSummary = toExportValidationSummary(
      input.exportReport,
      input.exportDiagnosticCodes,
    );

    if (exportSummary.export_type === "docx") {
      rememberSignalyzedSourceReports(requestId, { docxExport: exportSummary });
    }

    const evaluatorInput = {
      requestId,
      exportId: exportSummary.export_id,
      exportType: exportSummary.export_type,
      templateVersion: exportSummary.template_version,
      ast: cached.ast ?? null,
      qa: cached.qa ?? null,
      link: cached.link ?? null,
      bullet: cached.bullet ?? null,
      export: exportSummary,
      docxExport: cached.docxExport ?? null,
    };

    const result = evaluateSignalyzedStandard(evaluatorInput);
    const persistInput = {
      result,
      sourceReports: evaluatorInput,
      requestId,
      exportId: exportSummary.export_id,
      exportType: exportSummary.export_type,
      templateVersion: exportSummary.template_version,
    };
    buildAndLogSignalyzedStandard(persistInput);
    buildAndLogRepairCandidate(persistInput);
    if (isRepairSandboxShadowEnabled()) {
      buildAndLogRepairSandbox({
        sourceReports: evaluatorInput,
        beforeResult: result,
      });
    }
  } catch {
    /* shadow must never block */
  }
}
