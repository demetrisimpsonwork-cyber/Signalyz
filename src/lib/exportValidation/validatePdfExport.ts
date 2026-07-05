import { extractPdfPageCount, extractPdfPlainText, isPdfValidationAvailable } from "./extractPdfMeta";
import type { ExportValidationContext, ExportValidationResult } from "./types";
import { summarizeValidation, validateDocxExport } from "./validateDocxExport";
import { validateExportLinks } from "./validateExportLinks";
import { validateExportStructure } from "./validateExportStructure";
import { validateExportTypography } from "./validateExportTypography";

export { summarizeValidation };

export async function validatePdfExport(
  bytes: ArrayBuffer,
  ctx: Omit<ExportValidationContext, "exportType" | "artifactBytes" | "extractedText" | "pageCount">,
): Promise<ExportValidationResult & { pdf_validation_available: boolean }> {
  const pdfValidationAvailable = isPdfValidationAvailable();

  if (!pdfValidationAvailable) {
    return {
      passed: true,
      diagnostics: [
        {
          code: "pdf_validation_unavailable",
          severity: "info",
          message: "PDF validation capability not available; skipped.",
        },
      ],
      linkCount: 0,
      brokenLinkCount: 0,
      missingExpectedLinkCount: 0,
      duplicateLinkCount: 0,
      sectionCount: ctx.expectedSectionLabels.length,
      bulletCount: ctx.expectedBulletCount,
      pageCount: null,
      pdf_validation_available: false,
    };
  }

  if (!bytes || bytes.byteLength === 0) {
    return {
      passed: false,
      diagnostics: [{ code: "empty_file", severity: "error", message: "PDF export is empty." }],
      linkCount: 0,
      brokenLinkCount: 0,
      missingExpectedLinkCount: ctx.expectedLinkCount,
      duplicateLinkCount: 0,
      sectionCount: 0,
      bulletCount: 0,
      pageCount: null,
      pdf_validation_available: true,
    };
  }

  const pageCount = extractPdfPageCount(bytes);
  const extractedText = extractPdfPlainText(bytes);
  const fullCtx: ExportValidationContext = {
    ...ctx,
    exportType: "pdf",
    artifactBytes: bytes.byteLength,
    extractedText,
    pageCount,
    pdfValidationAvailable: true,
  };

  const baseDiagnostics: import("./types").ExportValidationDiagnostic[] = [];
  if (pageCount === 0) {
    baseDiagnostics.push({
      code: "blank_pdf",
      severity: "error",
      message: "PDF appears to have zero pages.",
    });
  }

  const structure = validateExportStructure(fullCtx);
  const typography = validateExportTypography(fullCtx);
  const links = validateExportLinks(fullCtx);
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
    pageCount,
    pdf_validation_available: true,
  };
}

export { validateDocxExport };
