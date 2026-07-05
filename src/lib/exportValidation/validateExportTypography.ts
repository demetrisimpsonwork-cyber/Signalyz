import type { ExportValidationContext, ExportValidationDiagnostic } from "./types";

const SPACED_HEADING_RE =
  /\b(?:P\s+R\s+O\s+F\s+E\s+S\s+S\s+I\s+O\s+N\s+A\s+L|W\s+O\s+R\s+K\s+E\s+X\s+P\s+E\s+R\s+I\s+E\s+N\s+C|E\s+D\s+U\s+C\s+A\s+T\s+I\s+O\s+N)\b/i;

export function validateExportTypography(ctx: ExportValidationContext): ExportValidationDiagnostic[] {
  const diagnostics: ExportValidationDiagnostic[] = [];
  const text = ctx.extractedText;

  if (SPACED_HEADING_RE.test(text)) {
    diagnostics.push({
      code: "spaced_heading",
      severity: "error",
      message: "Detected spaced-out heading letters (e.g. P R O F E S S I O N A L).",
    });
  }

  if (/\*\*[^*]+\*\*|__[^_]+__|^#\s+\w/m.test(text)) {
    diagnostics.push({
      code: "markdown_artifact",
      severity: "error",
      message: "Markdown formatting artifacts detected in export.",
    });
  }

  if (/\[\s*[^\]]+\]\(\s*https?:\/\//.test(text)) {
    diagnostics.push({
      code: "markdown_link_artifact",
      severity: "error",
      message: "Markdown link syntax detected in export.",
    });
  }

  if (/\{[\s\S]{0,200}":\s*"/.test(text) || /"\w+":\s*\{/.test(text)) {
    diagnostics.push({
      code: "json_artifact",
      severity: "error",
      message: "Raw JSON artifact detected in export text.",
    });
  }

  if (/\[object Object\]/i.test(text)) {
    diagnostics.push({
      code: "object_serialization_artifact",
      severity: "error",
      message: "[object Object] serialization artifact detected.",
    });
  }

  return diagnostics;
}
