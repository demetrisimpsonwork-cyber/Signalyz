/** Shared bullet regression patterns — used by QA detector and bullet preservation guard. */

export const BULLET_REGRESSION_PATTERNS: Array<{
  sourceRx: RegExp;
  weakenedRx: RegExp;
  label: string;
  ruleId: string;
}> = [
  {
    sourceRx: /converts?\s+resumes?\s+and\s+jds?\s+into\s+structured\s+outputs?/i,
    weakenedRx: /parses?\s+resumes?/i,
    label: "structured output conversion weakened to resume parsing only",
    ruleId: "bullet_regression.structured_to_parse",
  },
  {
    sourceRx: /production\s+ai\s+platform/i,
    weakenedRx: /parses?\s+resumes?/i,
    label: "production AI platform scope collapsed",
    ruleId: "bullet_regression.platform_scope_collapse",
  },
];

/** High-value Signalyz/platform concepts — source-supported scope that must not collapse. */
export const PROTECTED_BULLET_CONCEPTS: RegExp[] = [
  /production\s+ai\s+platform/i,
  /structured\s+outputs?/i,
  /deterministic\s+(scoring|evaluation)/i,
  /\brag\b/i,
  /document\s+chunks?/i,
  /vector\s+search/i,
  /llm\s+orchestration/i,
  /\bclaude\b/i,
  /\bsupabase\b/i,
  /postgresql/i,
  /edge\s+functions?/i,
  /\bstripe\b/i,
  /webhooks?/i,
  /export\s+pipeline/i,
  /observability/i,
  /reliability/i,
];

export function countProtectedConcepts(text: string): number {
  return PROTECTED_BULLET_CONCEPTS.filter((rx) => rx.test(text)).length;
}
