import type { SignalyzedStandardEventRow } from "./types";

export interface SignalyzedDashboardMetrics {
  average_signalyzed_score: number | null;
  ready_pct: number | null;
  needs_review_pct: number | null;
  unsafe_pct: number | null;
  top_diagnostic_codes: Array<{ code: string; count: number }>;
  hard_blocker_frequency: Array<{ code: string; count: number }>;
  average_score_by_export_type: Array<{ export_type: string; avg_score: number; count: number }>;
  average_score_by_template_version: Array<{ template_version: string; avg_score: number; count: number }>;
  trend_by_day: Array<{ date: string; avg_score: number; count: number; ready_pct: number }>;
  recommendation_summary: Array<{ recommended_action: string; count: number }>;
}

function rate(n: number, d: number): number | null {
  if (d === 0) return null;
  return Math.round((n / d) * 1000) / 1000;
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

export function buildSignalyzedDashboardMetrics(rows: SignalyzedStandardEventRow[]): SignalyzedDashboardMetrics {
  const scores = rows.map((r) => r.signalyzed_score);
  const ready = rows.filter((r) => r.verdict === "ready").length;
  const needsReview = rows.filter((r) => r.verdict === "needs_review").length;
  const unsafe = rows.filter((r) => r.verdict === "unsafe").length;

  const codeCounts = new Map<string, number>();
  const hardBlockerCodes = new Map<string, number>();
  for (const row of rows) {
    for (const code of row.diagnostic_codes ?? []) {
      codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
      if (row.hard_blocker_count > 0 && code.startsWith("STANDARD.")) {
        hardBlockerCodes.set(code, (hardBlockerCodes.get(code) ?? 0) + 1);
      }
    }
  }

  const byExportType = new Map<string, number[]>();
  const byTemplate = new Map<string, number[]>();
  for (const row of rows) {
    const et = row.export_type ?? "unknown";
    byExportType.set(et, [...(byExportType.get(et) ?? []), row.signalyzed_score]);
    const tv = row.template_version ?? "unknown";
    byTemplate.set(tv, [...(byTemplate.get(tv) ?? []), row.signalyzed_score]);
  }

  const recommendationSummary = new Map<string, number>();
  for (const row of rows) {
    recommendationSummary.set(
      row.recommended_action,
      (recommendationSummary.get(row.recommended_action) ?? 0) + 1,
    );
  }

  return {
    average_signalyzed_score: avg(scores),
    ready_pct: rate(ready, rows.length),
    needs_review_pct: rate(needsReview, rows.length),
    unsafe_pct: rate(unsafe, rows.length),
    top_diagnostic_codes: [...codeCounts.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15),
    hard_blocker_frequency: [...hardBlockerCodes.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    average_score_by_export_type: [...byExportType.entries()].map(([export_type, vals]) => ({
      export_type,
      avg_score: avg(vals) ?? 0,
      count: vals.length,
    })),
    average_score_by_template_version: [...byTemplate.entries()].map(([template_version, vals]) => ({
      template_version,
      avg_score: avg(vals) ?? 0,
      count: vals.length,
    })),
    trend_by_day: [],
    recommendation_summary: [...recommendationSummary.entries()].map(([recommended_action, count]) => ({
      recommended_action,
      count,
    })),
  };
}

export function buildSignalyzedTrendByDay(
  rows: Array<SignalyzedStandardEventRow & { created_at?: string }>,
): SignalyzedDashboardMetrics["trend_by_day"] {
  const byDay = new Map<string, { scores: number[]; ready: number }>();
  for (const row of rows) {
    if (!row.created_at) continue;
    const date = row.created_at.slice(0, 10);
    const entry = byDay.get(date) ?? { scores: [], ready: 0 };
    entry.scores.push(row.signalyzed_score);
    if (row.verdict === "ready") entry.ready += 1;
    byDay.set(date, entry);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, stats]) => ({
      date,
      avg_score: avg(stats.scores) ?? 0,
      count: stats.scores.length,
      ready_pct: rate(stats.ready, stats.scores.length) ?? 0,
    }));
}
