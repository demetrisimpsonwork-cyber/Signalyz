import { STANDARD_CODES } from "../diagnosticCodes.ts";
import type {
  RepairSandboxOutputWithMeta,
  RepairSandboxReadinessStatus,
  RepairTypeReadinessGate,
  SandboxRepairType,
} from "./types.ts";

/** Minimum production sandbox samples before internal auto-repair pilot consideration. */
export const REPAIR_SANDBOX_PILOT_MIN_SAMPLE = 20;

export const PILOT_TRACKED_REPAIR_TYPES: SandboxRepairType[] = [
  "preserve_high_value_bullet",
  "restore_source_link",
  "dedupe_bullets",
  "formatting_cleanup",
];

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
}

function latestTimestamp(rows: RepairSandboxOutputWithMeta[]): string | null {
  const timestamps = rows
    .map((r) => r.created_at)
    .filter((t): t is string => typeof t === "string" && t.length > 0)
    .sort();
  return timestamps.length > 0 ? timestamps[timestamps.length - 1]! : null;
}

function isTrueBlockerRow(row: RepairSandboxOutputWithMeta): boolean {
  if (row.excluded === true) return true;
  if (row.source_candidate_action === "do_not_repair") return true;
  if (row.recommended_next_step === "do_not_apply" && row.sandbox_repair_type !== "none") {
    return true;
  }
  const codes = row.diagnostic_codes_before ?? [];
  return codes.some(
    (c) =>
      c === STANDARD_CODES.QA_UNSUPPORTED_CLAIM ||
      c === STANDARD_CODES.QA_ROLE_CONTAMINATION ||
      c === STANDARD_CODES.QA_CROSS_JOB_CONTAMINATION,
  );
}

function buildHoldNote(input: {
  regressed_count: number;
  unsafe_to_apply_count: number;
  pii_check_passed: boolean;
  true_blockers_excluded: boolean;
  avg_score_delta: number | null;
}): string {
  const reasons: string[] = [];
  if (input.regressed_count > 0) reasons.push(`${input.regressed_count} regressed`);
  if (input.unsafe_to_apply_count > 0) reasons.push(`${input.unsafe_to_apply_count} unsafe_to_apply`);
  if (!input.pii_check_passed) reasons.push("PII check failed");
  if (!input.true_blockers_excluded) reasons.push("true blockers present in sample");
  if (input.avg_score_delta != null && input.avg_score_delta < 0) {
    reasons.push(`negative avg score delta (${input.avg_score_delta})`);
  }
  return reasons.length > 0 ? `hold: ${reasons.join(", ")}` : "hold: criteria not met";
}

function buildNotEnoughDataNote(input: {
  sample_count: number;
  regressed_count: number;
  unsafe_to_apply_count: number;
  avg_score_delta: number | null;
}): string {
  if (input.sample_count === 0) return "no production samples in window";
  if (
    input.regressed_count === 0 &&
    input.unsafe_to_apply_count === 0 &&
    (input.avg_score_delta ?? 0) >= 0
  ) {
    return "promising, needs more production volume";
  }
  return "insufficient volume for pilot evaluation";
}

function resolveReadinessStatus(input: {
  sample_count: number;
  regressed_count: number;
  unsafe_to_apply_count: number;
  pii_check_passed: boolean;
  true_blockers_excluded: boolean;
  avg_score_delta: number | null;
}): { status: RepairSandboxReadinessStatus; note: string } {
  if (input.sample_count < REPAIR_SANDBOX_PILOT_MIN_SAMPLE) {
    return {
      status: "not_enough_data",
      note: buildNotEnoughDataNote(input),
    };
  }

  const meetsCriteria =
    input.regressed_count === 0 &&
    input.unsafe_to_apply_count === 0 &&
    input.pii_check_passed &&
    input.true_blockers_excluded &&
    (input.avg_score_delta ?? -1) >= 0;

  if (meetsCriteria) {
    return {
      status: "eligible_for_internal_pilot",
      note: "meets internal pilot volume and safety criteria",
    };
  }

  return {
    status: "hold",
    note: buildHoldNote(input),
  };
}

export function buildRepairTypeReadinessGate(input: {
  sandbox_repair_type: SandboxRepairType;
  rows: RepairSandboxOutputWithMeta[];
  pii_check_passed?: boolean;
}): RepairTypeReadinessGate {
  const typeRows = input.rows.filter((r) => r.sandbox_repair_type === input.sandbox_repair_type);
  const pii_check_passed = input.pii_check_passed ?? true;
  const true_blockers_excluded = !typeRows.some(isTrueBlockerRow);

  const stats = {
    sample_count: typeRows.length,
    improved_count: typeRows.filter((r) => r.sandbox_result === "improved").length,
    no_change_count: typeRows.filter((r) => r.sandbox_result === "no_change").length,
    regressed_count: typeRows.filter((r) => r.sandbox_result === "regressed").length,
    unsafe_to_apply_count: typeRows.filter((r) => r.sandbox_result === "unsafe_to_apply").length,
    avg_score_delta: avg(typeRows.map((r) => r.score_delta)),
    eligible_for_future_auto_repair_count: typeRows.filter(
      (r) => r.recommended_next_step === "eligible_for_future_auto_repair",
    ).length,
    keep_human_review_count: typeRows.filter((r) => r.recommended_next_step === "keep_human_review").length,
    do_not_apply_count: typeRows.filter((r) => r.recommended_next_step === "do_not_apply").length,
    latest_event_at: latestTimestamp(typeRows),
    pii_check_passed,
    true_blockers_excluded,
  };

  const { status, note } = resolveReadinessStatus({
    sample_count: stats.sample_count,
    regressed_count: stats.regressed_count,
    unsafe_to_apply_count: stats.unsafe_to_apply_count,
    pii_check_passed,
    true_blockers_excluded,
    avg_score_delta: stats.avg_score_delta,
  });

  return {
    sandbox_repair_type: input.sandbox_repair_type,
    ...stats,
    readiness_status: status,
    readiness_note: note,
  };
}

export function buildAllRepairTypeReadinessGates(input: {
  rows: RepairSandboxOutputWithMeta[];
  pii_check_passed?: boolean;
  types?: SandboxRepairType[];
}): RepairTypeReadinessGate[] {
  const types = input.types ?? [
    ...PILOT_TRACKED_REPAIR_TYPES,
    "none" as SandboxRepairType,
  ];
  return types.map((sandbox_repair_type) =>
    buildRepairTypeReadinessGate({
      sandbox_repair_type,
      rows: input.rows,
      pii_check_passed: input.pii_check_passed,
    }),
  );
}
