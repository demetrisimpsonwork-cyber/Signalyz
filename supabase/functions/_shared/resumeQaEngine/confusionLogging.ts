import type { QaIssue, QaIssueLog } from "./types.ts";

/** Sanitized per-issue confusion log — no raw resume/JD text. */
export function buildConfusionLogs(issues: QaIssue[]): QaIssueLog[] {
  return issues.map((issue) => ({
    rule_id: issue.ruleId ?? issue.code,
    detector: issue.detector ?? "unknown",
    confidence: issue.confidence ?? "medium",
    evidence_count: issue.evidenceCount ?? issue.matchedTerms?.length ?? 0,
    matched_terms: (issue.matchedTerms ?? []).slice(0, 8),
    severity: issue.severity,
    source: issue.source ?? "generated_resume",
    code: issue.code,
    contamination_subtype: issue.contaminationSubtype,
  }));
}
