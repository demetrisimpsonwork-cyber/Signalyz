import type { RepairCandidateDashboardMetrics, RepairCandidateResult } from "./types.ts";
import {
  buildConfidenceBreakdown,
  countTopSourceDiagnosticCodes,
} from "./dashboardSource.ts";

function rate(n: number, d: number): number | null {
  if (d === 0) return null;
  return Math.round((n / d) * 1000) / 1000;
}

export function buildRepairCandidateDashboardMetrics(
  rows: RepairCandidateResult[],
): RepairCandidateDashboardMetrics {
  const candidates = rows.filter((r) => r.candidate);
  const typeCounts = new Map<string, number>();
  const riskCounts = new Map<string, number>();
  const reasonCounts = new Map<string, number>();
  const exportTypeMap = new Map<string, { candidate: number; total: number }>();

  for (const row of rows) {
    typeCounts.set(row.candidate_type, (typeCounts.get(row.candidate_type) ?? 0) + (row.candidate ? 1 : 0));
    riskCounts.set(row.risk_level, (riskCounts.get(row.risk_level) ?? 0) + 1);
    reasonCounts.set(row.reason_code, (reasonCounts.get(row.reason_code) ?? 0) + 1);

    const et = row.export_type ?? "unknown";
    const entry = exportTypeMap.get(et) ?? { candidate: 0, total: 0 };
    entry.total += 1;
    if (row.candidate) entry.candidate += 1;
    exportTypeMap.set(et, entry);
  }

  return {
    sample_size: rows.length,
    candidate_rate: rate(candidates.length, rows.length),
    candidate_count: candidates.length,
    candidate_count_by_type: [...typeCounts.entries()]
      .filter(([t]) => t !== "none")
      .map(([candidate_type, count]) => ({
        candidate_type: candidate_type as RepairCandidateDashboardMetrics["candidate_count_by_type"][0]["candidate_type"],
        count,
      }))
      .sort((a, b) => b.count - a.count),
    risk_breakdown: [...riskCounts.entries()]
      .map(([risk_level, count]) => ({
        risk_level: risk_level as RepairCandidateDashboardMetrics["risk_breakdown"][0]["risk_level"],
        count,
      }))
      .sort((a, b) => b.count - a.count),
    safe_future_repair_count: rows.filter((r) => r.recommended_future_action === "safe_future_repair").length,
    needs_human_review_count: rows.filter((r) => r.recommended_future_action === "needs_human_review").length,
    do_not_repair_count: rows.filter((r) => r.recommended_future_action === "do_not_repair").length,
    monitor_only_count: rows.filter((r) => r.recommended_future_action === "monitor_only").length,
    top_reason_codes: [...reasonCounts.entries()]
      .map(([reason_code, count]) => ({ reason_code, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15),
    top_source_diagnostic_codes: countTopSourceDiagnosticCodes(rows),
    confidence_breakdown: buildConfidenceBreakdown(rows),
    export_type_breakdown: [...exportTypeMap.entries()].map(([export_type, stats]) => ({
      export_type,
      candidate_count: stats.candidate,
      total: stats.total,
    })),
  };
}
