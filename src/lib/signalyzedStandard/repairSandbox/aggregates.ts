import type { RepairSandboxOutput, RepairSandboxOutputWithMeta } from "./types.ts";
import { buildAllRepairTypeReadinessGates } from "./readinessGate.ts";

function rate(n: number, d: number): number | null {
  if (d === 0) return null;
  return Math.round((n / d) * 1000) / 1000;
}

function countTopCodes(rows: RepairSandboxOutput[], field: "diagnostic_codes_before" | "diagnostic_codes_after") {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const code of row[field]) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
}

export function buildRepairSandboxDashboardMetrics(
  rows: RepairSandboxOutputWithMeta[],
  options?: { pii_check_passed?: boolean },
): import("./types.ts").RepairSandboxDashboardMetrics {
  const simulated = rows.filter((r) => r.sandbox_repair_type !== "none" || r.recommended_next_step === "keep_human_review");
  const runCount = rows.length;

  const improved = rows.filter((r) => r.sandbox_result === "improved").length;
  const noChange = rows.filter((r) => r.sandbox_result === "no_change").length;
  const regressed = rows.filter((r) => r.sandbox_result === "regressed").length;
  const unsafe = rows.filter((r) => r.sandbox_result === "unsafe_to_apply").length;

  const scoreDeltas = rows.map((r) => r.score_delta);
  const average_score_delta =
    scoreDeltas.length > 0
      ? Math.round((scoreDeltas.reduce((a, b) => a + b, 0) / scoreDeltas.length) * 100) / 100
      : null;

  const typeMap = new Map<string, { improved_or_stable: number; total: number }>();
  for (const row of rows) {
    if (row.sandbox_repair_type === "none" && row.recommended_next_step !== "keep_human_review") continue;
    const key = row.sandbox_repair_type;
    const entry = typeMap.get(key) ?? { improved_or_stable: 0, total: 0 };
    entry.total += 1;
    if (row.sandbox_result === "improved" || row.sandbox_result === "no_change") {
      entry.improved_or_stable += 1;
    }
    typeMap.set(key, entry);
  }

  const riskCounts = new Map<string, number>();
  for (const row of rows) {
    riskCounts.set(row.risk_level, (riskCounts.get(row.risk_level) ?? 0) + 1);
  }

  return {
    sandbox_run_count: runCount,
    improved_pct: rate(improved, runCount),
    no_change_pct: rate(noChange, runCount),
    regressed_pct: rate(regressed, runCount),
    unsafe_to_apply_pct: rate(unsafe, runCount),
    average_score_delta,
    eligible_for_future_auto_repair_count: rows.filter(
      (r) => r.recommended_next_step === "eligible_for_future_auto_repair",
    ).length,
    keep_human_review_count: rows.filter((r) => r.recommended_next_step === "keep_human_review").length,
    do_not_apply_count: rows.filter((r) => r.recommended_next_step === "do_not_apply").length,
    needs_more_data_count: rows.filter((r) => r.recommended_next_step === "needs_more_data").length,
    repair_type_success_rate: [...typeMap.entries()].map(([sandbox_repair_type, stats]) => ({
      sandbox_repair_type: sandbox_repair_type as RepairSandboxOutput["sandbox_repair_type"],
      improved_or_stable_count: stats.improved_or_stable,
      total: stats.total,
      success_rate: rate(stats.improved_or_stable, stats.total),
    })),
    risk_breakdown: [...riskCounts.entries()].map(([risk_level, count]) => ({
      risk_level: risk_level as RepairSandboxOutput["risk_level"],
      count,
    })),
    top_diagnostic_codes_before: countTopCodes(simulated, "diagnostic_codes_before"),
    top_diagnostic_codes_after: countTopCodes(simulated, "diagnostic_codes_after"),
    repair_type_readiness: buildAllRepairTypeReadinessGates({
      rows,
      pii_check_passed: options?.pii_check_passed ?? true,
    }),
  };
}
