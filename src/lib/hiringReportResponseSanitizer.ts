import type { DirectorCalibrationResult } from "@/components/DirectorCalibrationBlock";

/** Patch 1 pipeline metadata — optional, must not break client render. */
export interface HiringReportPipelineMetadata {
  pipeline_version?: string;
  _pipeline_degraded?: boolean;
  _report_completeness_pct?: number;
  _omitted_sections?: string[];
  _calibration_status?: string;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return items.length > 0 ? items : [];
}

function asCompletenessPct(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Coerce Patch 1 metadata without assuming shape — invalid values are dropped, not thrown.
 */
export function extractHiringReportPipelineMetadata(
  raw: Record<string, unknown>,
): HiringReportPipelineMetadata {
  return {
    pipeline_version: asString(raw.pipeline_version),
    _pipeline_degraded: asBoolean(raw._pipeline_degraded),
    _report_completeness_pct: asCompletenessPct(raw._report_completeness_pct),
    _omitted_sections: asStringArray(raw._omitted_sections),
    _calibration_status: asString(raw._calibration_status),
  };
}

/**
 * Strip non-render API fields and normalize optional metadata before DirectorCalibrationBlock.
 */
export function sanitizeHiringReportResponseForRender(
  raw: DirectorCalibrationResult | Record<string, unknown>,
): DirectorCalibrationResult {
  const input = raw as Record<string, unknown>;
  const metadata = extractHiringReportPipelineMetadata(input);

  const sanitized: DirectorCalibrationResult = {
    ...(raw as DirectorCalibrationResult),
    ...metadata,
    _omitted_sections: metadata._omitted_sections ?? [],
  };

  return sanitized;
}

export function isDegradedHiringReportResponse(meta: HiringReportPipelineMetadata): boolean {
  return (
    meta._pipeline_degraded === true ||
    meta._calibration_status === "degraded" ||
    (Array.isArray(meta._omitted_sections) && meta._omitted_sections.length > 0)
  );
}
