import type { ExportAuditLogRow } from "./types";

export interface ExportAuditLogRecord extends ExportAuditLogRow {
  created_at?: string;
}

export interface ExportDashboardMetrics {
  export_success_rate: number | null;
  docx_validation_pass_rate: number | null;
  pdf_validation_pass_rate: number | null;
  average_render_ms: number | null;
  p95_render_ms: number | null;
  broken_link_rate: number | null;
  missing_expected_link_rate: number | null;
  duplicate_link_rate: number | null;
  top_validation_warnings: Array<{ code: string; count: number }>;
  top_validation_errors: Array<{ code: string; count: number }>;
  template_version_breakdown: Array<{ template_version: string; count: number; pass_rate: number | null }>;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

function rate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 1000;
}

export function buildExportDashboardMetrics(rows: ExportAuditLogRecord[]): ExportDashboardMetrics {
  const total = rows.length;
  const docxRows = rows.filter((r) => r.export_type === "docx");
  const pdfRows = rows.filter((r) => r.export_type === "pdf");
  const renderMs = rows.map((r) => r.render_ms).filter((n) => Number.isFinite(n));

  const warningCounts = new Map<string, number>();
  const errorCounts = new Map<string, number>();
  for (const row of rows) {
    if (row.validation_warning_count > 0) {
      const code = row.error_class ? `${row.error_class}_warning` : "validation_warning";
      warningCounts.set(code, (warningCounts.get(code) ?? 0) + row.validation_warning_count);
    }
    if (row.validation_error_count > 0 && row.error_class) {
      errorCounts.set(row.error_class, (errorCounts.get(row.error_class) ?? 0) + 1);
    }
  }

  const versionMap = new Map<string, { count: number; passed: number }>();
  for (const row of rows) {
    const key = row.template_version || "unknown";
    const entry = versionMap.get(key) ?? { count: 0, passed: 0 };
    entry.count += 1;
    if (row.validation_passed) entry.passed += 1;
    versionMap.set(key, entry);
  }

  const withLinks = rows.filter((r) => r.link_count > 0);
  const withExpectedMissing = rows.filter((r) => r.missing_expected_link_count > 0);
  const withBroken = rows.filter((r) => r.broken_link_count > 0);
  const withDuplicate = rows.filter((r) => r.duplicate_link_count > 0);

  return {
    export_success_rate: rate(rows.filter((r) => r.artifact_bytes > 0).length, total),
    docx_validation_pass_rate: rate(
      docxRows.filter((r) => r.validation_passed).length,
      docxRows.length,
    ),
    pdf_validation_pass_rate: rate(
      pdfRows.filter((r) => r.validation_passed).length,
      pdfRows.length,
    ),
    average_render_ms:
      renderMs.length > 0
        ? Math.round(renderMs.reduce((a, b) => a + b, 0) / renderMs.length)
        : null,
    p95_render_ms: percentile(renderMs, 95),
    broken_link_rate: rate(withBroken.length, withLinks.length || total),
    missing_expected_link_rate: rate(withExpectedMissing.length, total),
    duplicate_link_rate: rate(withDuplicate.length, withLinks.length || total),
    top_validation_warnings: [...warningCounts.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    top_validation_errors: [...errorCounts.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    template_version_breakdown: [...versionMap.entries()]
      .map(([template_version, stats]) => ({
        template_version,
        count: stats.count,
        pass_rate: rate(stats.passed, stats.count),
      }))
      .sort((a, b) => b.count - a.count),
  };
}
