import { buildConfusionLogs } from "./confusionLogging.ts";
import { buildRuleAnalytics, type LabeledRun } from "./ruleAnalytics.ts";
import type { QaConfidence, ResumeQaResult, ShadowDashboardSummary } from "./types.ts";

const CONFIDENCE_RANK: Record<QaConfidence, number> = {
  very_high: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export function buildShadowDashboardSummary(
  results: Array<{ result: ResumeQaResult; label?: "clean" | "contaminated" }>,
): ShadowDashboardSummary {
  const allIssues = results.flatMap((r) => r.result.criticalIssues.concat(r.result.warnings));

  const ruleCounts = new Map<string, { count: number; confidenceSum: number; critical: number }>();
  let criticalTotal = 0;
  let issueTotal = 0;

  for (const result of results) {
    const issues = result.result.criticalIssues.concat(result.result.warnings);
    issueTotal += issues.length;
    criticalTotal += result.result.criticalIssues.length;

    for (const issue of issues) {
      const ruleId = issue.ruleId ?? issue.code;
      const row = ruleCounts.get(ruleId) ?? { count: 0, confidenceSum: 0, critical: 0 };
      row.count += 1;
      row.confidenceSum += CONFIDENCE_RANK[issue.confidence ?? "medium"];
      if (issue.severity === "critical") row.critical += 1;
      ruleCounts.set(ruleId, row);
    }
  }

  const topRules = [...ruleCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20)
    .map(([rule_id, stats]) => ({
      rule_id,
      trigger_count: stats.count,
      average_confidence_rank: Math.round((stats.confidenceSum / stats.count) * 100) / 100,
      critical_count: stats.critical,
    }));

  const labeledRuns: LabeledRun[] = results.map((r) => ({
    label: r.label ?? "clean",
    issues: r.result.criticalIssues.concat(r.result.warnings),
    issueLogs: buildConfusionLogs(r.result.criticalIssues.concat(r.result.warnings)),
  }));

  const ruleAnalytics = buildRuleAnalytics(labeledRuns);

  const avgConfidenceRank =
    allIssues.length === 0
      ? 0
      : Math.round(
          (allIssues.reduce((sum, i) => sum + CONFIDENCE_RANK[i.confidence ?? "medium"], 0) /
            allIssues.length) *
            100,
        ) / 100;

  return {
    top_rules: topRules,
    average_confidence_rank: avgConfidenceRank,
    critical_rate: results.length === 0 ? 0 : Math.round((criticalTotal / results.length) * 100) / 100,
    likely_false_positives: ruleAnalytics.false_positive_candidates,
    rule_analytics: ruleAnalytics,
    run_count: results.length,
    total_issues: issueTotal,
  };
}
