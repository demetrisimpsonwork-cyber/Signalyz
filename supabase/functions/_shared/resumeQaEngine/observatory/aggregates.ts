import { inferResumeQaRoleFamily } from "./roleFamily.ts";

export interface ResumeQaShadowEvent {
  id?: string;
  created_at?: string;
  request_id?: string | null;
  run_id?: string | null;
  target_role: string;
  qa_score: number;
  verdict: string;
  critical_issue_count: number;
  warning_count: number;
  contamination_count: number;
  keyword_loss_count: number;
  unsupported_claim_count: number;
  role_contamination_count: number;
  bullet_regression_count: number;
  formatting_issue_count: number;
  identity_drift_count: number;
  average_confidence?: number | null;
  highest_confidence?: string | null;
  critical_rate: number;
  top_rules?: Array<{
    rule_id: string;
    count: number;
    confidence?: string;
    matched_terms?: string[];
  }>;
  likely_false_positive_rules?: Array<{ rule_id: string; clean_critical_hits: number }>;
  generation_time_ms?: number | null;
}

export interface ResumeQaDashboardMetrics {
  sample_size: number;
  average_qa_score: number | null;
  verdict_distribution: {
    pass_pct: number;
    needs_review_pct: number;
    block_pct: number;
  };
  average_confidence: number | null;
  average_critical_rate: number | null;
  top_triggering_rules: Array<{ rule_id: string; count: number }>;
  top_false_positives: Array<{ rule_id: string; count: number }>;
  top_contamination_phrases: Array<{ term: string; count: number }>;
  top_keyword_losses: Array<{ term: string; count: number }>;
  role_family_breakdown: Array<{ role_family: string; count: number; pass_pct: number }>;
  critical_rate_trend: Array<{ date: string; critical_rate: number; runs: number }>;
}

export interface ResumeQaDriftAlert {
  code: string;
  severity: "high" | "medium";
  message: string;
  current: number;
  baseline: number;
  threshold: number;
}

export interface ResumeQaDriftReport {
  healthy: boolean;
  alerts: ResumeQaDriftAlert[];
  window_sample_size: number;
  baseline_sample_size: number;
}

export interface ResumeQaWeeklyReport {
  generated_at: string;
  period: string;
  sample_size: number;
  executive_summary: string;
  production_health: Record<string, unknown>;
  rule_precision: Array<{ rule_id: string; triggers: number; precision_estimate: number }>;
  false_positive_candidates: Array<{ rule_id: string; count: number }>;
  contamination_trends: Array<{ term: string; count: number }>;
  bullet_regression_trends: { total_runs: number; regression_runs: number; rate_pct: number };
  keyword_preservation_trends: { total_losses: number; top_losses: Array<{ term: string; count: number }> };
  recommendation: "keep_shadow" | "tighten_thresholds" | "ready_for_enforcement";
  drift: ResumeQaDriftReport;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function pct(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function topCounts(items: string[], limit = 10): Array<{ term: string; count: number }> {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!item) continue;
    const key = item.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term, count]) => ({ term, count }));
}

function collectMatchedTerms(
  events: ResumeQaShadowEvent[],
  rulePrefix: string,
): string[] {
  const terms: string[] = [];
  for (const event of events) {
    for (const rule of event.top_rules ?? []) {
      if (!rule.rule_id.startsWith(rulePrefix)) continue;
      terms.push(...(rule.matched_terms ?? []));
    }
  }
  return terms;
}

export function buildResumeQaDashboardMetrics(events: ResumeQaShadowEvent[]): ResumeQaDashboardMetrics {
  const scores = events.map((e) => e.qa_score).filter(Number.isFinite);
  const pass = events.filter((e) => e.verdict === "pass").length;
  const needsReview = events.filter((e) => e.verdict === "needs_review").length;
  const block = events.filter((e) => e.verdict === "block_regeneration").length;

  const ruleCounts = new Map<string, number>();
  const fpCounts = new Map<string, number>();

  for (const event of events) {
    for (const rule of event.top_rules ?? []) {
      ruleCounts.set(rule.rule_id, (ruleCounts.get(rule.rule_id) ?? 0) + rule.count);
    }
    for (const fp of event.likely_false_positive_rules ?? []) {
      fpCounts.set(fp.rule_id, (fpCounts.get(fp.rule_id) ?? 0) + fp.clean_critical_hits);
    }
  }

  const roleFamilies = new Map<string, { total: number; pass: number }>();
  for (const event of events) {
    const family = inferResumeQaRoleFamily(event.target_role);
    const row = roleFamilies.get(family) ?? { total: 0, pass: 0 };
    row.total += 1;
    if (event.verdict === "pass") row.pass += 1;
    roleFamilies.set(family, row);
  }

  const byDate = new Map<string, { criticalSum: number; runs: number }>();
  for (const event of events) {
    const date = (event.created_at ?? new Date().toISOString()).slice(0, 10);
    const row = byDate.get(date) ?? { criticalSum: 0, runs: 0 };
    row.criticalSum += event.critical_issue_count;
    row.runs += 1;
    byDate.set(date, row);
  }

  return {
    sample_size: events.length,
    average_qa_score: scores.length ? Math.round(mean(scores)! * 10) / 10 : null,
    verdict_distribution: {
      pass_pct: pct(pass, events.length),
      needs_review_pct: pct(needsReview, events.length),
      block_pct: pct(block, events.length),
    },
    average_confidence:
      events.length > 0
        ? Math.round(
            (mean(events.map((e) => e.average_confidence ?? 0).filter((v) => v > 0)) ?? 0) * 1000,
          ) / 1000
        : null,
    average_critical_rate:
      events.length > 0
        ? Math.round(mean(events.map((e) => e.critical_rate))! * 10000) / 10000
        : null,
    top_triggering_rules: [...ruleCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([rule_id, count]) => ({ rule_id, count })),
    top_false_positives: [...fpCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([rule_id, count]) => ({ rule_id, count })),
    top_contamination_phrases: topCounts(collectMatchedTerms(events, "contamination.")),
    top_keyword_losses: topCounts(collectMatchedTerms(events, "keyword_preservation.")),
    role_family_breakdown: [...roleFamilies.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .map(([role_family, stats]) => ({
        role_family,
        count: stats.total,
        pass_pct: pct(stats.pass, stats.total),
      })),
    critical_rate_trend: [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, stats]) => ({
        date,
        critical_rate: Math.round((stats.criticalSum / stats.runs) * 100) / 100,
        runs: stats.runs,
      })),
  };
}

export function detectResumeQaDrift(
  current: ResumeQaShadowEvent[],
  baseline: ResumeQaShadowEvent[],
): ResumeQaDriftReport {
  const alerts: ResumeQaDriftAlert[] = [];

  const currentPassRate = pct(current.filter((e) => e.verdict === "pass").length, current.length);
  const baselinePassRate = pct(baseline.filter((e) => e.verdict === "pass").length, baseline.length);
  if (baseline.length >= 5 && baselinePassRate - currentPassRate > 20) {
    alerts.push({
      code: "pass_rate_drop",
      severity: "high",
      message: `Pass rate dropped ${Math.round(baselinePassRate - currentPassRate)}% vs prior window`,
      current: currentPassRate,
      baseline: baselinePassRate,
      threshold: 20,
    });
  }

  const currentCriticalRate = mean(current.map((e) => e.critical_rate)) ?? 0;
  const baselineCriticalRate = mean(baseline.map((e) => e.critical_rate)) ?? 0;
  if (
    baseline.length >= 5 &&
    currentCriticalRate - baselineCriticalRate > 0.15
  ) {
    alerts.push({
      code: "critical_rate_rise",
      severity: "high",
      message: `Critical rate rose by ${Math.round((currentCriticalRate - baselineCriticalRate) * 100)}% vs prior window`,
      current: currentCriticalRate,
      baseline: baselineCriticalRate,
      threshold: 0.15,
    });
  }

  const ruleHits = new Map<string, number>();
  for (const event of current) {
    const seen = new Set<string>();
    for (const rule of event.top_rules ?? []) {
      if (seen.has(rule.rule_id)) continue;
      seen.add(rule.rule_id);
      ruleHits.set(rule.rule_id, (ruleHits.get(rule.rule_id) ?? 0) + 1);
    }
  }

  for (const [ruleId, hits] of ruleHits.entries()) {
    const rate = pct(hits, current.length);
    if (current.length >= 5 && rate > 35) {
      alerts.push({
        code: "rule_dominance",
        severity: "medium",
        message: `Rule ${ruleId} fired on ${rate}% of runs`,
        current: rate,
        baseline: 35,
        threshold: 35,
      });
    }
  }

  const contaminationTerms = topCounts(collectMatchedTerms(current, "contamination."));
  const baselineTerms = new Set(collectMatchedTerms(baseline, "contamination."));
  for (const { term, count } of contaminationTerms) {
    if (!baselineTerms.has(term) && count > 5) {
      alerts.push({
        code: "new_contamination_phrase",
        severity: "high",
        message: `New contamination phrase "${term}" appeared ${count} times`,
        current: count,
        baseline: 0,
        threshold: 5,
      });
    }
  }

  return {
    healthy: alerts.length === 0,
    alerts,
    window_sample_size: current.length,
    baseline_sample_size: baseline.length,
  };
}

export function buildResumeQaWeeklyReport(
  events: ResumeQaShadowEvent[],
  metrics: ResumeQaDashboardMetrics,
  drift: ResumeQaDriftReport,
  period: string,
): ResumeQaWeeklyReport {
  const rulePrecision = metrics.top_triggering_rules.map((rule) => {
    const fp = metrics.top_false_positives.find((f) => f.rule_id === rule.rule_id)?.count ?? 0;
    const precision = rule.count === 0 ? 1 : Math.max(0, (rule.count - fp) / rule.count);
    return {
      rule_id: rule.rule_id,
      triggers: rule.count,
      precision_estimate: Math.round(precision * 100) / 100,
    };
  });

  const regressionRuns = events.filter((e) => e.bullet_regression_count > 0).length;
  const blockRate = metrics.verdict_distribution.block_pct;

  let recommendation: ResumeQaWeeklyReport["recommendation"] = "keep_shadow";
  if (
    blockRate < 5 &&
    metrics.average_qa_score != null &&
    metrics.average_qa_score >= 80 &&
    drift.healthy &&
    regressionRuns / Math.max(events.length, 1) < 0.1
  ) {
    recommendation = "ready_for_enforcement";
  } else if (blockRate > 25 || !drift.healthy || metrics.top_false_positives.length > 3) {
    recommendation = "tighten_thresholds";
  }

  const executive_summary = [
    `${events.length} shadow QA runs in ${period}.`,
    `Average QA score ${metrics.average_qa_score ?? "n/a"}.`,
    `Pass ${metrics.verdict_distribution.pass_pct}% · Needs review ${metrics.verdict_distribution.needs_review_pct}% · Block ${metrics.verdict_distribution.block_pct}%.`,
    drift.healthy ? "No drift alerts." : `${drift.alerts.length} drift alert(s).`,
    `Recommendation: ${recommendation.replace(/_/g, " ")}.`,
  ].join(" ");

  return {
    generated_at: new Date().toISOString(),
    period,
    sample_size: events.length,
    executive_summary,
    production_health: {
      average_qa_score: metrics.average_qa_score,
      verdict_distribution: metrics.verdict_distribution,
      average_confidence: metrics.average_confidence,
      average_critical_rate: metrics.average_critical_rate,
      critical_rate_trend: metrics.critical_rate_trend,
    },
    rule_precision: rulePrecision.slice(0, 15),
    false_positive_candidates: metrics.top_false_positives,
    contamination_trends: metrics.top_contamination_phrases,
    bullet_regression_trends: {
      total_runs: events.length,
      regression_runs: regressionRuns,
      rate_pct: pct(regressionRuns, events.length),
    },
    keyword_preservation_trends: {
      total_losses: events.reduce((sum, e) => sum + e.keyword_loss_count, 0),
      top_losses: metrics.top_keyword_losses,
    },
    recommendation,
    drift,
  };
}

export function formatResumeQaWeeklyMarkdown(report: ResumeQaWeeklyReport): string {
  const lines = [
    "# Resume QA Weekly Report",
    "",
    `**Period:** ${report.period}`,
    `**Generated:** ${report.generated_at}`,
    `**Sample size:** ${report.sample_size}`,
    "",
    "## Executive Summary",
    report.executive_summary,
    "",
    "## Production Health",
    `- Average QA score: ${report.production_health.average_qa_score ?? "n/a"}`,
    `- Pass: ${(report.production_health.verdict_distribution as { pass_pct: number }).pass_pct}%`,
    `- Needs review: ${(report.production_health.verdict_distribution as { needs_review_pct: number }).needs_review_pct}%`,
    `- Block: ${(report.production_health.verdict_distribution as { block_pct: number }).block_pct}%`,
    `- Average confidence: ${report.production_health.average_confidence ?? "n/a"}`,
    `- Average critical rate: ${report.production_health.average_critical_rate ?? "n/a"}`,
    "",
    "## Rule Precision",
    ...report.rule_precision.slice(0, 10).map(
      (r) => `- \`${r.rule_id}\` — triggers ${r.triggers}, precision est. ${r.precision_estimate}`,
    ),
    "",
    "## False-Positive Candidates",
    ...(report.false_positive_candidates.length
      ? report.false_positive_candidates.map((f) => `- \`${f.rule_id}\` (${f.count})`)
      : ["- None flagged"]),
    "",
    "## Contamination Trends",
    ...report.contamination_trends.slice(0, 10).map((c) => `- ${c.term} (${c.count})`),
    "",
    "## Bullet Regression Trends",
    `- Runs with regression: ${report.bullet_regression_trends.regression_runs} / ${report.bullet_regression_trends.total_runs} (${report.bullet_regression_trends.rate_pct}%)`,
    "",
    "## Keyword Preservation Trends",
    `- Total keyword-loss hits: ${report.keyword_preservation_trends.total_losses}`,
    ...report.keyword_preservation_trends.top_losses.slice(0, 10).map((k) => `- ${k.term} (${k.count})`),
    "",
    "## Drift Alerts",
    ...(report.drift.alerts.length
      ? report.drift.alerts.map((a) => `- **[${a.severity}]** ${a.message}`)
      : ["- None — within thresholds"]),
    "",
    "## Recommendation",
    `**${report.recommendation.replace(/_/g, " ")}**`,
  ];
  return lines.join("\n");
}
