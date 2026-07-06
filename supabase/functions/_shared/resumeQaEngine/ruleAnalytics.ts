import type { QaIssue, QaIssueLog, RuleAnalyticsSummary } from "./types.ts";

export interface LabeledRun {
  label: "clean" | "contaminated";
  issues: QaIssue[];
  issueLogs: QaIssueLog[];
}

export function buildRuleAnalytics(runs: LabeledRun[]): RuleAnalyticsSummary {
  const ruleTriggers = new Map<string, number>();
  const ruleCleanTriggers = new Map<string, number>();
  const ruleContaminatedTriggers = new Map<string, number>();
  const contaminationTerms = new Map<string, number>();
  const falsePositiveCandidates = new Map<string, number>();

  for (const run of runs) {
    const seenRules = new Set<string>();
    for (const issue of run.issues) {
      const ruleId = issue.ruleId ?? issue.code;
      if (seenRules.has(ruleId)) continue;
      seenRules.add(ruleId);

      ruleTriggers.set(ruleId, (ruleTriggers.get(ruleId) ?? 0) + 1);
      if (run.label === "clean") {
        ruleCleanTriggers.set(ruleId, (ruleCleanTriggers.get(ruleId) ?? 0) + 1);
        if (issue.severity === "critical" || issue.severity === "high") {
          falsePositiveCandidates.set(ruleId, (falsePositiveCandidates.get(ruleId) ?? 0) + 1);
        }
      } else {
        ruleContaminatedTriggers.set(ruleId, (ruleContaminatedTriggers.get(ruleId) ?? 0) + 1);
      }

      if (issue.code === "cross_jd_contamination") {
        for (const term of issue.matchedTerms ?? []) {
          const key = term.toLowerCase();
          contaminationTerms.set(key, (contaminationTerms.get(key) ?? 0) + 1);
        }
      }
    }
  }

  const topTriggeringRules = [...ruleTriggers.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([rule_id, count]) => ({
      rule_id,
      count,
      precision_estimate: estimatePrecision(
        rule_id,
        ruleCleanTriggers.get(rule_id) ?? 0,
        ruleContaminatedTriggers.get(rule_id) ?? 0,
      ),
    }));

  const contaminationFrequency = [...contaminationTerms.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([term, count]) => ({ term, count }));

  const false_positive_candidates = [...falsePositiveCandidates.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([rule_id, clean_critical_hits]) => ({ rule_id, clean_critical_hits }));

  return {
    false_positive_candidates,
    top_triggering_rules: topTriggeringRules,
    contamination_frequency: contaminationFrequency,
    rule_precision_estimates: topTriggeringRules.map((r) => ({
      rule_id: r.rule_id,
      precision_estimate: r.precision_estimate,
    })),
  };
}

function estimatePrecision(ruleId: string, cleanHits: number, contaminatedHits: number): number {
  const total = cleanHits + contaminatedHits;
  if (total === 0) return 1;
  if (contaminatedHits === 0 && cleanHits > 0) return 0;
  return Math.round((contaminatedHits / total) * 100) / 100;
}
