import { STANDARD_CODES } from "../diagnosticCodes.ts";
import type { DashboardFilterOptions, StandardEventRowWithMeta } from "../dashboardFilters.ts";
import { classifyRepairCandidate } from "./classifyRepairCandidate.ts";
import type {
  RepairCandidateEventRow,
  RepairCandidateResult,
  RepairConfidence,
} from "./types.ts";

export type RepairDashboardSourceMode = "auto" | "repair-events" | "standard-inferred";
export type RepairDashboardDataSource = "repair_candidate_events" | "standard_inferred" | "mixed";
export type RepairClassificationSource = "repair_queue" | "standard_heuristic";

export interface RepairCandidateEventRowWithMeta extends RepairCandidateEventRow {
  id?: string;
  created_at?: string;
}

export interface RepairDashboardCandidateRow extends RepairCandidateResult {
  classification_source: RepairClassificationSource;
}

export interface RepairDashboardBuildResult {
  candidates: RepairDashboardCandidateRow[];
  data_source: RepairDashboardDataSource;
  repair_rows_used: number;
  standard_rows_inferred: number;
  missing_repair_rows: number;
  repair_queue_available: boolean;
  repair_queue_row_count: number;
  classification_source: RepairDashboardDataSource | "repair_queue" | "standard_heuristic" | "mixed";
}

export function repairEventToCandidateResult(row: RepairCandidateEventRow): RepairCandidateResult {
  return {
    request_id: row.request_id,
    export_id: row.export_id,
    export_type: row.export_type,
    candidate: row.candidate,
    candidate_type: row.candidate_type,
    risk_level: row.risk_level,
    confidence: row.confidence,
    source_diagnostic_codes: [...(row.source_diagnostic_codes ?? [])],
    recommended_future_action: row.recommended_future_action,
    reason_code: row.reason_code,
    sanitizer_version: row.sanitizer_version,
  };
}

export function inferCandidateFromStandardRow(row: StandardEventRowWithMeta): RepairCandidateResult {
  const codes = row.diagnostic_codes ?? [];
  const flags = row.source_reports_present ?? {};

  return classifyRepairCandidate({
    request_id: row.request_id,
    export_id: row.export_id,
    export_type: row.export_type,
    verdict: row.verdict,
    hard_blocker_count: row.hard_blocker_count,
    diagnostic_codes: codes,
    link:
      flags.link && codes.includes(STANDARD_CODES.LINKS_MISSING_EXPECTED)
        ? {
            event: "resume_link_preservation_report",
            source_link_count: 1,
            generated_link_count_before: 0,
            generated_link_count_after: 0,
            restored_link_count: 0,
            link_types_restored: [],
            duplicate_link_count: 0,
            broken_link_count: 0,
            preservation_ok: false,
          }
        : null,
    bullet:
      flags.bullet && codes.includes(STANDARD_CODES.AST_LOW_BULLET_PRESERVATION)
        ? {
            event: "resume_bullet_preservation_report",
            protected_bullet_count: 2,
            weakened_bullet_count: 1,
            restored_bullet_count: 1,
            duplicate_bullet_count: 0,
            hallucination_guard_passed: true,
            preservation_ok: true,
            affected_sections: ["experience"],
          }
        : null,
  });
}

function toDashboardRow(
  result: RepairCandidateResult,
  classification_source: RepairClassificationSource,
): RepairDashboardCandidateRow {
  return { ...result, classification_source };
}

function indexRepairRowsByExportId(
  rows: RepairCandidateEventRowWithMeta[],
): Map<string, RepairCandidateEventRowWithMeta> {
  const map = new Map<string, RepairCandidateEventRowWithMeta>();
  for (const row of rows) {
    if (row.export_id) map.set(row.export_id, row);
  }
  return map;
}

export function buildRepairDashboardCandidates(input: {
  sourceMode: RepairDashboardSourceMode;
  standardRows: StandardEventRowWithMeta[];
  repairRows: RepairCandidateEventRowWithMeta[];
  repairFetchError?: string | null;
}): RepairDashboardBuildResult {
  const repairByExportId = indexRepairRowsByExportId(input.repairRows);
  const repair_queue_available = input.repairFetchError == null;
  const repair_queue_row_count = input.repairRows.length;

  if (input.sourceMode === "repair-events") {
    if (!repair_queue_available) {
      throw new Error(
        `Repair candidate table unavailable: ${input.repairFetchError ?? "unknown error"}. ` +
          "Apply migration 20260706200000_signalyzed_repair_candidate_events or use --source=standard-inferred.",
      );
    }

    const candidates = input.repairRows.map((row) =>
      toDashboardRow(repairEventToCandidateResult(row), "repair_queue"),
    );

    return {
      candidates,
      data_source: "repair_candidate_events",
      repair_rows_used: candidates.length,
      standard_rows_inferred: 0,
      missing_repair_rows: 0,
      repair_queue_available,
      repair_queue_row_count,
      classification_source: "repair_queue",
    };
  }

  if (input.sourceMode === "standard-inferred") {
    const candidates = input.standardRows.map((row) =>
      toDashboardRow(inferCandidateFromStandardRow(row), "standard_heuristic"),
    );

    return {
      candidates,
      data_source: "standard_inferred",
      repair_rows_used: 0,
      standard_rows_inferred: candidates.length,
      missing_repair_rows: candidates.length,
      repair_queue_available,
      repair_queue_row_count,
      classification_source: "standard_heuristic",
    };
  }

  // auto — standard rows define sample; repair rows override when present
  let repair_rows_used = 0;
  let standard_rows_inferred = 0;
  let missing_repair_rows = 0;

  const candidates = input.standardRows.map((standardRow) => {
    const exportId = standardRow.export_id ?? "";
    const repairRow = exportId ? repairByExportId.get(exportId) : undefined;

    if (repairRow && repair_queue_available) {
      repair_rows_used += 1;
      return toDashboardRow(repairEventToCandidateResult(repairRow), "repair_queue");
    }

    missing_repair_rows += 1;
    standard_rows_inferred += 1;
    return toDashboardRow(inferCandidateFromStandardRow(standardRow), "standard_heuristic");
  });

  const data_source: RepairDashboardDataSource =
    repair_rows_used === 0
      ? "standard_inferred"
      : standard_rows_inferred === 0
        ? "repair_candidate_events"
        : "mixed";

  const classification_source =
    data_source === "mixed"
      ? "mixed"
      : data_source === "repair_candidate_events"
        ? "repair_queue"
        : "standard_heuristic";

  return {
    candidates,
    data_source,
    repair_rows_used,
    standard_rows_inferred,
    missing_repair_rows,
    repair_queue_available,
    repair_queue_row_count,
    classification_source,
  };
}

export function countTopSourceDiagnosticCodes(
  rows: RepairCandidateResult[],
  limit = 15,
): Array<{ code: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const code of row.source_diagnostic_codes ?? []) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function buildConfidenceBreakdown(
  rows: RepairCandidateResult[],
): Array<{ confidence: RepairConfidence; count: number }> {
  const counts = new Map<RepairConfidence, number>();
  for (const row of rows) {
    counts.set(row.confidence, (counts.get(row.confidence) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([confidence, count]) => ({ confidence, count }))
    .sort((a, b) => b.count - a.count);
}

export function resolveRepairDashboardSourceMode(
  options: DashboardFilterOptions,
): RepairDashboardSourceMode {
  return options.source ?? "auto";
}
