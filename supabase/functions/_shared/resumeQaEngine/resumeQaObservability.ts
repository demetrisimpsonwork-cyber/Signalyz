import type {
  QaIssue,
  ResumeQaInput,
  ResumeQaObservabilitySummary,
} from "./types.ts";

const CHECK_NAMES = [
  "contamination",
  "keyword_preservation",
  "hallucination",
  "role_boundary",
  "bullet_regression",
  "formatting",
  "identity_drift",
] as const;

export function buildObservabilitySummary(
  input: ResumeQaInput,
  allIssues: QaIssue[],
  categories: Record<string, QaIssue[]>,
): ResumeQaObservabilitySummary {
  const issueCounts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    total: allIssues.length,
  };

  for (const issue of allIssues) {
    issueCounts[issue.severity] += 1;
  }

  const categoryCounts: Record<string, number> = {};
  for (const [key, issues] of Object.entries(categories)) {
    categoryCounts[key] = issues.length;
  }

  return {
    runId: input.runId,
    requestId: input.requestId,
    targetRoleLabel: input.targetRoleLabel,
    checksRun: [...CHECK_NAMES],
    issueCounts,
    categoryCounts,
    sourceCharCount: input.sourceResumeText.length,
    generatedCharCount: input.generatedResumeText.length,
    jdCharCount: input.jobDescriptionText.length,
  };
}
