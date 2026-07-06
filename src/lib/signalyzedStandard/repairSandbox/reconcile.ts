import { STANDARD_CODES } from "../diagnosticCodes.ts";
import type { RecommendedFutureAction, RepairCandidateType } from "../repairCandidates/types.ts";

export type ReconcileSkipReason =
  | "has_sandbox_row"
  | "monitor_only"
  | "needs_human_review"
  | "do_not_repair"
  | "excluded_true_blocker"
  | "missing_sandbox_row"
  | "pre_sandbox_row"
  | "insert_failed_unknown";

export interface ReconcileRepairRow {
  request_id: string | null;
  export_id: string | null;
  candidate: boolean;
  candidate_type: RepairCandidateType | string;
  recommended_future_action: RecommendedFutureAction | string;
  source_diagnostic_codes?: string[] | null;
  created_at?: string | null;
}

export interface ReconcileSandboxRow {
  request_id: string | null;
  export_id: string | null;
  candidate_type: string;
  sandbox_repair_type: string;
  source_candidate_action?: string | null;
  created_at?: string | null;
}

export interface ReconcileRowDetail {
  request_id: string | null;
  export_id: string | null;
  candidate_type: string;
  recommended_future_action: string;
  created_at: string | null;
  created_at_bucket: "before_sandbox_deploy" | "after_sandbox_deploy";
  expects_sandbox_row: boolean;
  has_sandbox_row: boolean;
  skip_reason: ReconcileSkipReason;
}

export interface ReconcileTypeSummary {
  total: number;
  /** Rows in the post-deploy era (sandbox event time when joined, else repair created_at). */
  post_deploy_era: number;
  /** Repair rows with a matching signalyzed_repair_sandbox_events row. */
  with_sandbox_row: number;
  /** Repair rows without a matching sandbox row. */
  missing_sandbox_row: number;
  /** Eligible post-deploy-era rows still missing a sandbox row (bug signal). */
  missing_post_deploy_eligible: number;
  /** Joined rows whose repair created_at predates deploy but sandbox event exists (same-batch edge case). */
  pre_deploy_repair_with_sandbox_row: number;
}

export interface ReconcileReport {
  generated_at: string;
  window_days: number;
  last: number;
  sandbox_deploy_at: string | null;
  total_repair_rows: number;
  eligible_sandbox_candidates: number;
  sandbox_rows_found: number;
  sandbox_rows_missing: number;
  missing_by_candidate_type: Record<string, number>;
  missing_by_source_candidate_action: Record<string, number>;
  missing_by_created_at_bucket: {
    before_sandbox_deploy: number;
    after_sandbox_deploy: number;
  };
  skipped_reason_counts: Record<ReconcileSkipReason, number>;
  preserve_high_value_bullet: ReconcileTypeSummary;
  post_deploy_missing_eligible: number;
  verdict: "expected" | "bug_suspected";
  verdict_note: string;
  rows: ReconcileRowDetail[];
}

const TRUE_BLOCKER_CODES = new Set([
  STANDARD_CODES.QA_UNSUPPORTED_CLAIM,
  STANDARD_CODES.QA_ROLE_CONTAMINATION,
  STANDARD_CODES.QA_CROSS_JOB_CONTAMINATION,
]);

/** Mirrors runRepairSandbox null path: monitor-only / not-candidate rows emit no sandbox event. */
export function expectsSandboxRow(row: ReconcileRepairRow): boolean {
  if (row.recommended_future_action === "do_not_repair") return true;
  if (!row.candidate || row.candidate_type === "none") return false;
  return true;
}

export function hasTrueBlockerDiagnostic(codes: string[] | null | undefined): boolean {
  return (codes ?? []).some((code) => TRUE_BLOCKER_CODES.has(code));
}

function resolveEffectiveTimestampMs(
  repairCreatedAt: string | null,
  sandbox: ReconcileSandboxRow | undefined,
): number | null {
  const sandboxMs = sandbox?.created_at ? Date.parse(sandbox.created_at) : null;
  if (sandboxMs != null) return sandboxMs;
  return repairCreatedAt ? Date.parse(repairCreatedAt) : null;
}

function isPostDeployEra(
  deployAtMs: number | null,
  repairCreatedAt: string | null,
  sandbox: ReconcileSandboxRow | undefined,
): boolean {
  if (deployAtMs == null) return true;
  const effectiveMs = resolveEffectiveTimestampMs(repairCreatedAt, sandbox);
  if (effectiveMs == null) return true;
  return effectiveMs >= deployAtMs;
}

function resolveMissingSkipReason(row: ReconcileRepairRow): ReconcileSkipReason {
  if (row.recommended_future_action === "do_not_repair" || hasTrueBlockerDiagnostic(row.source_diagnostic_codes)) {
    return row.recommended_future_action === "do_not_repair"
      ? "do_not_repair"
      : "excluded_true_blocker";
  }
  if (row.recommended_future_action === "needs_human_review") return "needs_human_review";
  if (row.recommended_future_action === "monitor_only" || !row.candidate || row.candidate_type === "none") {
    return "monitor_only";
  }
  return "missing_sandbox_row";
}

export function buildReconciliationReport(input: {
  repairRows: ReconcileRepairRow[];
  sandboxRows: ReconcileSandboxRow[];
  sandboxDeployAt: string | null;
  windowDays: number;
  last: number;
}): ReconcileReport {
  const sandboxByExport = new Map<string, ReconcileSandboxRow>();
  for (const row of input.sandboxRows) {
    if (row.export_id) sandboxByExport.set(row.export_id, row);
  }

  const deployAtMs = input.sandboxDeployAt ? Date.parse(input.sandboxDeployAt) : null;

  const missingByCandidateType: Record<string, number> = {};
  const missingByAction: Record<string, number> = {};
  const skippedReasonCounts = {} as Record<ReconcileSkipReason, number>;
  for (const reason of [
    "has_sandbox_row",
    "monitor_only",
    "needs_human_review",
    "do_not_repair",
    "excluded_true_blocker",
    "missing_sandbox_row",
    "pre_sandbox_row",
    "insert_failed_unknown",
  ] as ReconcileSkipReason[]) {
    skippedReasonCounts[reason] = 0;
  }

  const bucketCounts = {
    before_sandbox_deploy: 0,
    after_sandbox_deploy: 0,
  };

  const details: ReconcileRowDetail[] = [];
  let eligibleCount = 0;
  let foundCount = 0;
  let missingCount = 0;
  let postDeployMissingEligible = 0;

  const phvb: ReconcileTypeSummary = {
    total: 0,
    post_deploy_era: 0,
    with_sandbox_row: 0,
    missing_sandbox_row: 0,
    missing_post_deploy_eligible: 0,
    pre_deploy_repair_with_sandbox_row: 0,
  };

  for (const row of input.repairRows) {
    const exportId = row.export_id ?? "";
    const sandbox = exportId ? sandboxByExport.get(exportId) : undefined;
    const hasSandbox = Boolean(sandbox);
    const expects = expectsSandboxRow(row);
    const createdAt = row.created_at ?? null;
    const createdAtMs = createdAt ? Date.parse(createdAt) : null;
    const postDeployEra = isPostDeployEra(deployAtMs, createdAt, sandbox);
    const repairBeforeDeploy =
      deployAtMs != null && createdAtMs != null && createdAtMs < deployAtMs;
    const bucket: ReconcileRowDetail["created_at_bucket"] = postDeployEra
      ? "after_sandbox_deploy"
      : "before_sandbox_deploy";

    if (expects) eligibleCount += 1;
    if (hasSandbox) foundCount += 1;

    let skipReason: ReconcileSkipReason;
    if (hasSandbox) {
      skipReason = "has_sandbox_row";
    } else if (!expects) {
      skipReason = "monitor_only";
    } else {
      missingCount += 1;
      if (!postDeployEra) {
        skipReason = "pre_sandbox_row";
        bucketCounts.before_sandbox_deploy += 1;
      } else {
        const derived = resolveMissingSkipReason(row);
        if (derived === "missing_sandbox_row") {
          skipReason = "missing_sandbox_row";
          postDeployMissingEligible += 1;
        } else if (derived === "needs_human_review" || derived === "do_not_repair") {
          skipReason = "insert_failed_unknown";
          postDeployMissingEligible += 1;
        } else {
          skipReason = derived;
          postDeployMissingEligible += 1;
        }
        bucketCounts.after_sandbox_deploy += 1;
      }
      missingByCandidateType[row.candidate_type ?? "none"] =
        (missingByCandidateType[row.candidate_type ?? "none"] ?? 0) + 1;
      missingByAction[row.recommended_future_action ?? "unknown"] =
        (missingByAction[row.recommended_future_action ?? "unknown"] ?? 0) + 1;
    }

    skippedReasonCounts[skipReason] += 1;

    if (row.candidate_type === "preserve_high_value_bullet") {
      phvb.total += 1;
      if (postDeployEra) phvb.post_deploy_era += 1;
      if (hasSandbox) {
        phvb.with_sandbox_row += 1;
        if (repairBeforeDeploy) phvb.pre_deploy_repair_with_sandbox_row += 1;
      } else {
        phvb.missing_sandbox_row += 1;
        if (postDeployEra && expects) phvb.missing_post_deploy_eligible += 1;
      }
    }

    details.push({
      request_id: row.request_id,
      export_id: row.export_id,
      candidate_type: row.candidate_type ?? "none",
      recommended_future_action: row.recommended_future_action ?? "unknown",
      created_at: createdAt,
      created_at_bucket: bucket,
      expects_sandbox_row: expects,
      has_sandbox_row: hasSandbox,
      skip_reason: skipReason,
    });
  }

  const verdict =
    phvb.missing_post_deploy_eligible > 0 ||
    details.some((row) => row.skip_reason === "missing_sandbox_row")
      ? "bug_suspected"
      : "expected";

  const verdictNote =
    verdict === "expected"
      ? "Missing sandbox rows are explained by pre-sandbox repair events and monitor-only rows that intentionally emit no sandbox event."
      : "Post-Phase-3H eligible repair rows are missing sandbox events — inspect sandbox trigger/persistence path.";

  return {
    generated_at: new Date().toISOString(),
    window_days: input.windowDays,
    last: input.last,
    sandbox_deploy_at: input.sandboxDeployAt,
    total_repair_rows: input.repairRows.length,
    eligible_sandbox_candidates: eligibleCount,
    sandbox_rows_found: foundCount,
    sandbox_rows_missing: missingCount,
    missing_by_candidate_type: missingByCandidateType,
    missing_by_source_candidate_action: missingByAction,
    missing_by_created_at_bucket: bucketCounts,
    skipped_reason_counts: skippedReasonCounts,
    preserve_high_value_bullet: phvb,
    post_deploy_missing_eligible: postDeployMissingEligible,
    verdict,
    verdict_note: verdictNote,
    rows: details,
  };
}
