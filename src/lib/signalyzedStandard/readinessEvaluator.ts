import { buildSignalyzedDashboardMetrics, type SignalyzedDashboardMetrics } from "./aggregates.ts";
import { isAdvisoryDiagnosticCode } from "./diagnosticGrouping.ts";
import { isLegacyStandardRow, isPhase3eOrLaterRow, type StandardEventRowWithMeta } from "./dashboardFilters.ts";
import type { SignalyzedStandardEventRow } from "./types.ts";

export type InternalReadinessStatus =
  | "ready_for_internal_warning"
  | "keep_shadow"
  | "investigate_before_warning";

export interface ReadinessThresholds {
  maxUnsafeRate: number;
  minExportPassRate: number;
  maxBrokenLinkRate: number;
  maxHardBlockerFalsePositiveRate: number;
  minSampleSize: number;
}

export const DEFAULT_READINESS_THRESHOLDS: ReadinessThresholds = {
  maxUnsafeRate: 0.1,
  minExportPassRate: 0.98,
  maxBrokenLinkRate: 0.02,
  maxHardBlockerFalsePositiveRate: 0.05,
  minSampleSize: 10,
};

export interface ReadinessEvaluationInput {
  rows: StandardEventRowWithMeta[];
  /** Latest N rows used for rate calculations (default 50). */
  sampleLimit?: number;
  exportValidationPassRate?: number | null;
  brokenLinkRate?: number | null;
  noPiiVerified?: boolean;
  trueBlockerControlsPass?: boolean;
  thresholds?: Partial<ReadinessThresholds>;
}

export interface ReadinessEvaluationResult {
  status: InternalReadinessStatus;
  reasons: string[];
  sample_size: number;
  unsafe_rate: number | null;
  export_pass_rate: number | null;
  broken_link_rate: number | null;
  hard_blocker_false_positive_rate: number | null;
  true_blocker_controls_pass: boolean;
  no_pii_verified: boolean;
  metrics: SignalyzedDashboardMetrics;
}

function rate(n: number, d: number): number | null {
  if (d === 0) return null;
  return Math.round((n / d) * 1000) / 1000;
}

/** Rows with hard_blockers but only advisory/artifact codes — likely false positives. */
export function estimateHardBlockerFalsePositiveRate(
  rows: SignalyzedStandardEventRow[],
): number | null {
  const withBlockers = rows.filter((r) => r.hard_blocker_count > 0);
  if (withBlockers.length === 0) return 0;

  const likelyFalsePositives = withBlockers.filter((r) => {
    const codes = r.diagnostic_codes ?? [];
    if (codes.length === 0) return false;
    return codes.every(
      (c) =>
        isAdvisoryDiagnosticCode(c) ||
        c === "STANDARD.QA.CONTAMINATION_ARTIFACT" ||
        c === "STANDARD.AST.LOW_BULLET_PRESERVATION",
    );
  });

  return rate(likelyFalsePositives.length, withBlockers.length);
}

export function deriveExportPassRateFromRows(rows: StandardEventRowWithMeta[]): number | null {
  const withExport = rows.filter((r) => r.source_reports_present?.export === true);
  if (withExport.length === 0) return null;
  const passed = withExport.filter((r) => r.verdict !== "unsafe" || r.hard_blocker_count === 0).length;
  return rate(passed, withExport.length);
}

export function evaluateInternalReadiness(input: ReadinessEvaluationInput): ReadinessEvaluationResult {
  const thresholds = { ...DEFAULT_READINESS_THRESHOLDS, ...input.thresholds };
  const sampleLimit = input.sampleLimit ?? 50;

  const phase3eRows = input.rows.filter(isPhase3eOrLaterRow).slice(0, sampleLimit);
  const nonLegacyRows = input.rows.filter((r) => !isLegacyStandardRow(r)).slice(0, sampleLimit);
  const sample = phase3eRows.length >= thresholds.minSampleSize ? phase3eRows : nonLegacyRows.slice(0, sampleLimit);

  const unsafeCount = sample.filter((r) => r.verdict === "unsafe").length;
  const unsafeRate = rate(unsafeCount, sample.length);
  const exportPassRate = input.exportValidationPassRate ?? deriveExportPassRateFromRows(sample);
  const brokenLinkRate = input.brokenLinkRate ?? null;
  const falsePositiveRate = estimateHardBlockerFalsePositiveRate(sample);
  const noPii = input.noPiiVerified ?? false;
  const controlsPass = input.trueBlockerControlsPass ?? false;

  const reasons: string[] = [];
  let status: InternalReadinessStatus = "ready_for_internal_warning";

  if (sample.length < thresholds.minSampleSize) {
    reasons.push(`sample_size_below_min:${sample.length}<${thresholds.minSampleSize}`);
    status = "keep_shadow";
  }

  if (!controlsPass) {
    reasons.push("true_blocker_controls_failed");
    status = "investigate_before_warning";
  }

  if (!noPii) {
    reasons.push("no_pii_verification_failed");
    status = "investigate_before_warning";
  }

  if (unsafeRate != null && unsafeRate >= thresholds.maxUnsafeRate) {
    reasons.push(`unsafe_rate_high:${unsafeRate}>=${thresholds.maxUnsafeRate}`);
    status = status === "investigate_before_warning" ? status : "keep_shadow";
  }

  if (exportPassRate != null && exportPassRate < thresholds.minExportPassRate) {
    reasons.push(`export_pass_rate_low:${exportPassRate}<${thresholds.minExportPassRate}`);
    status = status === "investigate_before_warning" ? status : "keep_shadow";
  }

  if (brokenLinkRate != null && brokenLinkRate >= thresholds.maxBrokenLinkRate) {
    reasons.push(`broken_link_rate_high:${brokenLinkRate}>=${thresholds.maxBrokenLinkRate}`);
    status = status === "investigate_before_warning" ? status : "keep_shadow";
  }

  if (
    falsePositiveRate != null &&
    falsePositiveRate > thresholds.maxHardBlockerFalsePositiveRate
  ) {
    reasons.push(
      `hard_blocker_false_positive_rate_high:${falsePositiveRate}>${thresholds.maxHardBlockerFalsePositiveRate}`,
    );
    status = status === "investigate_before_warning" ? status : "keep_shadow";
  }

  if (reasons.length === 0) {
    reasons.push("all_thresholds_met");
  }

  return {
    status,
    reasons,
    sample_size: sample.length,
    unsafe_rate: unsafeRate,
    export_pass_rate: exportPassRate,
    broken_link_rate: brokenLinkRate,
    hard_blocker_false_positive_rate: falsePositiveRate,
    true_blocker_controls_pass: controlsPass,
    no_pii_verified: noPii,
    metrics: buildSignalyzedDashboardMetrics(sample),
  };
}
