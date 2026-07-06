import { STANDARD_CODES } from "./diagnosticCodes.ts";
import type { RepairCandidateEventRow } from "./repairCandidates/types.ts";

export interface UnsupportedClaimAuditRow {
  export_id: string | null;
  request_id: string | null;
  target_role: string | null;
  standard_verdict: string | null;
  hard_blocker: boolean;
  diagnostic_codes: string[];
  inferred_subtype: string | null;
  repair_action: string | null;
  false_positive_candidate: boolean;
  true_blocker_control: boolean;
}

export interface UnsupportedClaimAuditMetrics {
  sample_size: number;
  unsupported_claim_diagnostics: number;
  hard_blocker_count: number;
  advisory_count: number;
  subtype_breakdown: Array<{ subtype: string; count: number }>;
  repair_action_breakdown: Array<{ action: string; count: number }>;
  role_family_breakdown: Array<{ role_family: string; count: number }>;
  false_positive_candidate_count: number;
  true_blocker_control_pass_rate: number | null;
  unsafe_verdict_count: number;
}

const FALSE_POSITIVE_SUBTYPES = new Set([
  "role_language_rewrite",
  "generic_business_phrase",
  "transferable_rewrite",
  "synonym_gap",
  "parser_artifact",
  "unclear_needs_human_review",
]);

function inferRoleFamily(targetRole: string | null): string {
  const role = (targetRole ?? "unknown").toLowerCase();
  if (role.includes("customer success") || role.includes("csm")) return "customer_success";
  if (role.includes("engineer") || role.includes("developer") || role.includes("ai")) return "engineering";
  if (role.includes("account manager") || role.includes("sales")) return "account_sales";
  if (role.includes("dol") || role.includes("labor") || role.includes("care")) return "public_sector_care";
  return "other";
}

function inferSubtypeFromRepairRow(repair: RepairCandidateEventRow | null): string | null {
  if (!repair) return null;
  switch (repair.reason_code) {
    case "high_risk_unsupported_claim":
      return "true_unsupported_claim";
    case "keyword_loss_advisory":
      return null;
    case "no_actionable_diagnostics":
      if (repair.source_diagnostic_codes.includes(STANDARD_CODES.QA_UNSUPPORTED_CLAIM)) {
        return "inferred_advisory_unsupported";
      }
      return null;
    default:
      return repair.reason_code;
  }
}

function isFalsePositiveCandidate(row: UnsupportedClaimAuditRow): boolean {
  if (row.hard_blocker && row.inferred_subtype && FALSE_POSITIVE_SUBTYPES.has(row.inferred_subtype)) {
    return true;
  }
  if (
    row.standard_verdict === "unsafe" &&
    row.inferred_subtype != null &&
    FALSE_POSITIVE_SUBTYPES.has(row.inferred_subtype)
  ) {
    return true;
  }
  if (
    row.repair_action === "do_not_repair" &&
    row.inferred_subtype != null &&
    row.inferred_subtype !== "true_unsupported_claim"
  ) {
    return true;
  }
  return false;
}

function isTrueBlockerControl(row: UnsupportedClaimAuditRow): boolean {
  if (row.inferred_subtype !== "true_unsupported_claim") return false;
  return row.hard_blocker || row.repair_action === "do_not_repair" || row.standard_verdict === "unsafe";
}

export function buildUnsupportedClaimAuditRows(input: {
  standardRows: Array<{
    request_id?: string | null;
    export_id?: string | null;
    verdict?: string | null;
    hard_blocker_count?: number;
    diagnostic_codes?: string[];
  }>;
  repairByExportId: Map<string, RepairCandidateEventRow>;
  targetRoleByRequestId?: Map<string, string>;
}): UnsupportedClaimAuditRow[] {
  return input.standardRows
    .filter((row) => {
      const codes = row.diagnostic_codes ?? [];
      return (
        codes.includes(STANDARD_CODES.QA_UNSUPPORTED_CLAIM) ||
        codes.includes(STANDARD_CODES.QA_ADVISORY_WARNING)
      );
    })
    .map((row) => {
      const codes = row.diagnostic_codes ?? [];
      const repair = row.export_id ? input.repairByExportId.get(row.export_id) ?? null : null;
      const inferred_subtype = inferSubtypeFromRepairRow(repair);
      const hard_blocker =
        (row.hard_blocker_count ?? 0) > 0 && codes.includes(STANDARD_CODES.QA_UNSUPPORTED_CLAIM);

      const auditRow: UnsupportedClaimAuditRow = {
        export_id: row.export_id ?? null,
        request_id: row.request_id ?? null,
        target_role: row.request_id
          ? input.targetRoleByRequestId?.get(row.request_id) ?? null
          : null,
        standard_verdict: row.verdict ?? null,
        hard_blocker,
        diagnostic_codes: codes,
        inferred_subtype,
        repair_action: repair?.recommended_future_action ?? null,
        false_positive_candidate: false,
        true_blocker_control: false,
      };

      auditRow.false_positive_candidate = isFalsePositiveCandidate(auditRow);
      auditRow.true_blocker_control = isTrueBlockerControl(auditRow);
      return auditRow;
    });
}

export function buildUnsupportedClaimAuditMetrics(
  rows: UnsupportedClaimAuditRow[],
): UnsupportedClaimAuditMetrics {
  const subtypeCounts = new Map<string, number>();
  const repairCounts = new Map<string, number>();
  const roleCounts = new Map<string, number>();

  let hard_blocker_count = 0;
  let advisory_count = 0;
  let false_positive_candidate_count = 0;
  let true_blocker_controls = 0;
  let true_blocker_expected = 0;
  let unsafe_verdict_count = 0;

  for (const row of rows) {
    if (row.hard_blocker) hard_blocker_count += 1;
    if (row.diagnostic_codes.includes(STANDARD_CODES.QA_ADVISORY_WARNING)) advisory_count += 1;
    if (row.standard_verdict === "unsafe") unsafe_verdict_count += 1;
    if (row.false_positive_candidate) false_positive_candidate_count += 1;

    const subtype = row.inferred_subtype ?? "unknown";
    subtypeCounts.set(subtype, (subtypeCounts.get(subtype) ?? 0) + 1);

    if (row.repair_action) {
      repairCounts.set(row.repair_action, (repairCounts.get(row.repair_action) ?? 0) + 1);
    }

    const family = inferRoleFamily(row.target_role);
    roleCounts.set(family, (roleCounts.get(family) ?? 0) + 1);

    if (row.inferred_subtype === "true_unsupported_claim") {
      true_blocker_expected += 1;
      if (row.true_blocker_control) true_blocker_controls += 1;
    }
  }

  return {
    sample_size: rows.length,
    unsupported_claim_diagnostics: rows.length,
    hard_blocker_count,
    advisory_count,
    subtype_breakdown: [...subtypeCounts.entries()]
      .map(([subtype, count]) => ({ subtype, count }))
      .sort((a, b) => b.count - a.count),
    repair_action_breakdown: [...repairCounts.entries()]
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count),
    role_family_breakdown: [...roleCounts.entries()]
      .map(([role_family, count]) => ({ role_family, count }))
      .sort((a, b) => b.count - a.count),
    false_positive_candidate_count,
    true_blocker_control_pass_rate:
      true_blocker_expected === 0 ? null : Math.round((true_blocker_controls / true_blocker_expected) * 1000) / 1000,
    unsafe_verdict_count,
  };
}

export function assertNoPiiInUnsupportedAuditPayload(payload: Record<string, unknown>): boolean {
  const serialized = JSON.stringify(payload);
  if (/resume_text|jd_text|bullet_text|claim_text|generated_resume|original_resume/i.test(serialized)) {
    return false;
  }
  if (/https?:\/\//i.test(serialized)) return false;
  if (/@[a-z0-9.]+\.[a-z]{2,}/i.test(serialized)) return false;
  return true;
}
