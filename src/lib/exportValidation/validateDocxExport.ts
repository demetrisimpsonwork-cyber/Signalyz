import type { ExportValidationContext, ExportValidationDiagnostic, ExportValidationResult } from "./types";
import { validateExportLinks } from "./validateExportLinks";
import { validateExportStructure } from "./validateExportStructure";
import { validateExportTypography } from "./validateExportTypography";

function assembleResult(
  ctx: ExportValidationContext,
  baseDiagnostics: ExportValidationDiagnostic[],
): ExportValidationResult {
  const structure = validateExportStructure(ctx);
  const typography = validateExportTypography(ctx);
  const links = validateExportLinks(ctx);

  const diagnostics = [...baseDiagnostics, ...structure.diagnostics, ...typography, ...links.diagnostics];
  const errors = diagnostics.filter((d) => d.severity === "error");

  return {
    passed: errors.length === 0,
    diagnostics,
    linkCount: links.linkCount,
    brokenLinkCount: links.brokenLinkCount,
    missingExpectedLinkCount: links.missingExpectedLinkCount,
    duplicateLinkCount: links.duplicateLinkCount,
    sectionCount: structure.sectionCount,
    bulletCount: structure.bulletCount,
    pageCount: ctx.pageCount ?? null,
  };
}

export async function validateDocxExport(
  bytes: ArrayBuffer,
  ctx: Omit<ExportValidationContext, "exportType" | "artifactBytes" | "extractedText">,
): Promise<ExportValidationResult> {
  const { extractDocxPlainText } = await import("./extractDocxText");

  if (!bytes || bytes.byteLength === 0) {
    return {
      passed: false,
      diagnostics: [{ code: "empty_file", severity: "error", message: "DOCX export is empty." }],
      linkCount: 0,
      brokenLinkCount: 0,
      missingExpectedLinkCount: ctx.expectedLinkCount,
      duplicateLinkCount: 0,
      sectionCount: 0,
      bulletCount: 0,
      pageCount: null,
    };
  }

  const extractedText = await extractDocxPlainText(bytes);
  const fullCtx: ExportValidationContext = {
    ...ctx,
    exportType: "docx",
    artifactBytes: bytes.byteLength,
    extractedText,
  };

  const baseDiagnostics: ExportValidationDiagnostic[] = [];
  if (bytes.byteLength < 100) {
    baseDiagnostics.push({
      code: "suspicious_file_size",
      severity: "error",
      message: "DOCX export is unexpectedly small.",
    });
  }

  return assembleResult(fullCtx, baseDiagnostics);
}

export function summarizeValidation(result: ExportValidationResult): {
  warningCount: number;
  errorCount: number;
  errorClass?: string;
} {
  const warnings = result.diagnostics.filter((d) => d.severity === "warning").length;
  const errors = result.diagnostics.filter((d) => d.severity === "error").length;
  const errorClass = result.diagnostics.find((d) => d.severity === "error")?.code;
  return { warningCount: warnings, errorCount: errors, errorClass };
}
