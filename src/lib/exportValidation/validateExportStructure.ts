import type { ExportValidationContext, ExportValidationDiagnostic } from "./types";

export function validateExportStructure(ctx: ExportValidationContext): {
  diagnostics: ExportValidationDiagnostic[];
  sectionCount: number;
  bulletCount: number;
} {
  const diagnostics: ExportValidationDiagnostic[] = [];
  const text = ctx.extractedText;
  const upper = text.toUpperCase();

  let sectionCount = 0;
  for (const label of ctx.expectedSectionLabels) {
    if (upper.includes(label.toUpperCase())) sectionCount += 1;
  }
  if (ctx.expectedSectionLabels.length > 0 && sectionCount < Math.min(2, ctx.expectedSectionLabels.length)) {
    diagnostics.push({
      code: "missing_expected_sections",
      severity: "error",
      message: "Expected resume sections were not found in export text.",
    });
  }

  const bulletCount = (text.match(/[•●▪◦\-–—]\s|\u2022/g) ?? []).length;
  if (ctx.expectedBulletCount > 0 && bulletCount === 0) {
    diagnostics.push({
      code: "no_bullets_detected",
      severity: "warning",
      message: "No bullet markers detected despite expected bullet content.",
    });
  } else if (ctx.expectedBulletCount > 0 && bulletCount < Math.floor(ctx.expectedBulletCount * 0.5)) {
    diagnostics.push({
      code: "low_bullet_count",
      severity: "warning",
      message: "Bullet count in export is significantly lower than source model.",
    });
  }

  if (/\[\s*Insert|\{\{|\}\}|undefined|null|\[object Object\]/i.test(text)) {
    diagnostics.push({
      code: "broken_placeholder",
      severity: "error",
      message: "Broken placeholder or serialization artifact detected.",
    });
  }

  if (/(?:^|\s)[•●▪◦\-–—]\s*(?:\||$)/.test(text) || /[•●▪◦]\s{0,2}$/.test(text)) {
    diagnostics.push({
      code: "empty_bullet",
      severity: "warning",
      message: "Empty bullet marker detected in export.",
    });
  }

  return { diagnostics, sectionCount, bulletCount: bulletCount || ctx.expectedBulletCount };
}
