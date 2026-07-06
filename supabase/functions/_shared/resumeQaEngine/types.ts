/** Resume QA Engine v1 — shared types (pure, no I/O). */

export type QaSeverity = "critical" | "high" | "medium" | "low";

export type QaConfidence = "very_high" | "high" | "medium" | "low";

export type QaVerdict = "pass" | "needs_review" | "block_regeneration";

export type QaIssueSource =
  | "source_resume"
  | "job_description"
  | "generated_resume";

export interface QaIssue {
  code: string;
  severity: QaSeverity;
  message: string;
  evidence?: string;
  section?: string;
  suggestedFix?: string;
  ruleId?: string;
  detector?: string;
  confidence?: QaConfidence;
  evidenceCount?: number;
  matchedTerms?: string[];
  source?: QaIssueSource;
  /** Phase 3D — contamination precision taxonomy. */
  contaminationSubtype?: string;
  /** Phase 3E — unsupported claim precision taxonomy. */
  unsupportedClaimSubtype?: string;
  /** Phase 3E — identity drift precision taxonomy. */
  identityDriftSubtype?: string;
}

export interface QaIssueLog {
  rule_id: string;
  detector: string;
  confidence: QaConfidence;
  evidence_count: number;
  matched_terms: string[];
  severity: QaSeverity;
  source: QaIssueSource;
  code: string;
  /** Phase 3D — contamination precision taxonomy (sanitized). */
  contamination_subtype?: string;
  /** Phase 3E — unsupported claim precision taxonomy (sanitized). */
  unsupported_claim_subtype?: string;
  /** Phase 3E — identity drift precision taxonomy (sanitized). */
  identity_drift_subtype?: string;
}

export interface RulePrecisionEstimate {
  rule_id: string;
  precision_estimate: number;
}

export interface RuleAnalyticsSummary {
  false_positive_candidates: Array<{ rule_id: string; clean_critical_hits: number }>;
  top_triggering_rules: Array<{ rule_id: string; count: number; precision_estimate: number }>;
  contamination_frequency: Array<{ term: string; count: number }>;
  rule_precision_estimates: RulePrecisionEstimate[];
}

export interface ShadowDashboardSummary {
  top_rules: Array<{
    rule_id: string;
    trigger_count: number;
    average_confidence_rank: number;
    critical_count: number;
  }>;
  average_confidence_rank: number;
  critical_rate: number;
  likely_false_positives: Array<{ rule_id: string; clean_critical_hits: number }>;
  rule_analytics: RuleAnalyticsSummary;
  run_count: number;
  total_issues: number;
}

export interface ResumeQaInput {
  sourceResumeText: string;
  jobDescriptionText: string;
  generatedResumeText: string;
  targetRoleLabel: string;
  runId?: string;
  requestId?: string;
}

export interface ResumeQaResult {
  qaScore: number;
  verdict: QaVerdict;
  criticalIssues: QaIssue[];
  warnings: QaIssue[];
  keywordLoss: QaIssue[];
  unsupportedClaims: QaIssue[];
  roleContamination: QaIssue[];
  bulletRegressions: QaIssue[];
  formattingIssues: QaIssue[];
  identityDrift: QaIssue[];
  suggestedFixes: string[];
  observabilitySummary: ResumeQaObservabilitySummary;
  issueLogs: QaIssueLog[];
  shadowDashboard?: ShadowDashboardSummary;
}

export interface ResumeQaObservabilitySummary {
  runId?: string;
  requestId?: string;
  targetRoleLabel: string;
  checksRun: string[];
  issueCounts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
  };
  categoryCounts: Record<string, number>;
  sourceCharCount: number;
  generatedCharCount: number;
  jdCharCount: number;
  confusionLogCount: number;
  ruleAnalytics?: RuleAnalyticsSummary;
}

export interface ResumeSection {
  heading: string;
  company?: string;
  body: string;
  bullets: string[];
}

export interface DetectorContext {
  sourceResumeText: string;
  jobDescriptionText: string;
  generatedResumeText: string;
  targetRoleLabel: string;
  referenceCorpus: string;
  sourceCorpus: string;
  jdCorpus: string;
  generatedCorpus: string;
}

// ─── Shared text helpers (used by detectors; no cross-imports) ───────────────

export function normalizeCorpus(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function tokenizeMeaningful(text: string): string[] {
  return (normalizeCorpus(text).match(/[a-z0-9][a-z0-9+.#/\-]{1,}/g) ?? []).filter(
    (t) => t.length >= 3 && !STOP_WORDS.has(t),
  );
}

export function extractBulletsFromLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-•*]\s+/.test(line))
    .map((line) => line.replace(/^[-•*]\s+/, "").trim())
    .filter(Boolean);
}

export function extractMetrics(text: string): string[] {
  return text.match(/\b\d+(?:\.\d+)?%|\$\d[\d,]*|\b\d{2,}\+?\b/g) ?? [];
}

export function parseResumeSections(text: string): ResumeSection[] {
  const lines = text.split(/\r?\n/);
  const sections: ResumeSection[] = [];
  let current: ResumeSection | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const roleMatch = line.match(/^(.+?)\s*\|\s*(.+?)\s*\|\s*((?:19|20)\d{2}.+)$/i);
    if (roleMatch) {
      if (current) sections.push(current);
      current = {
        heading: roleMatch[1].trim(),
        company: roleMatch[2].trim(),
        body: line,
        bullets: [],
      };
      continue;
    }

    if (/^(experience|education|skills|summary)\b/i.test(line)) {
      if (current) sections.push(current);
      current = { heading: line, body: line, bullets: [] };
      continue;
    }

    if (!current) {
      current = { heading: "Header", body: line, bullets: [] };
      continue;
    }

    current.body += `\n${line}`;
    if (/^[-•*]\s+/.test(line)) {
      current.bullets.push(line.replace(/^[-•*]\s+/, "").trim());
    }
  }

  if (current) sections.push(current);
  return sections;
}

const STOP_WORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "from",
  "that",
  "this",
  "into",
  "using",
  "over",
  "across",
  "within",
  "their",
  "have",
  "been",
  "were",
  "also",
]);
