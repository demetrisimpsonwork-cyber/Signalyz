import { detectCrossJdContamination } from "./contaminationDetector.ts";
import { detectKeywordLoss } from "./keywordPreservation.ts";
import { detectUnsupportedClaims } from "./hallucinationDetector.ts";
import { detectRoleContamination } from "./roleBoundaryDetector.ts";
import { detectBulletRegressions } from "./bulletRegressionDetector.ts";
import { detectFormattingIssues } from "./formattingQa.ts";
import { detectIdentityDrift } from "./identityDriftDetector.ts";
import { buildObservabilitySummary } from "./resumeQaObservability.ts";
import {
  normalizeCorpus,
  type DetectorContext,
  type QaIssue,
  type QaSeverity,
  type QaVerdict,
  type ResumeQaInput,
  type ResumeQaResult,
} from "./types.ts";

const SEVERITY_PENALTY: Record<QaSeverity, number> = {
  critical: 25,
  high: 15,
  medium: 5,
  low: 2,
};

const BLOCKER_CODES = new Set([
  "cross_jd_contamination",
  "unsupported_claim",
  "role_contamination",
  "bullet_regression",
  "formatting_spaced_letters",
]);

/** Run internal QA pass on a generated calibrated resume. Engine-only — not wired to production. */
export function runResumeQa(input: ResumeQaInput): ResumeQaResult {
  const ctx = buildDetectorContext(input);

  const contamination = detectCrossJdContamination(ctx);
  const keywordLoss = detectKeywordLoss(ctx);
  const unsupportedClaims = detectUnsupportedClaims(ctx);
  const roleContamination = detectRoleContamination(ctx);
  const bulletRegressions = detectBulletRegressions(ctx);
  const formattingIssues = detectFormattingIssues(ctx);
  const identityDrift = detectIdentityDrift(ctx);

  const categories = {
    contamination,
    keywordLoss,
    unsupportedClaims,
    roleContamination,
    bulletRegressions,
    formattingIssues,
    identityDrift,
  };

  const allIssues = Object.values(categories).flat();
  const criticalIssues = allIssues.filter((i) => i.severity === "critical");
  const warnings = allIssues.filter((i) => i.severity === "medium" || i.severity === "low");
  const highIssues = allIssues.filter((i) => i.severity === "high");

  const qaScore = computeQaScore(allIssues);
  const verdict = computeVerdict(criticalIssues, highIssues, allIssues);

  const suggestedFixes = [
    ...new Set(
      allIssues
        .map((i) => i.suggestedFix)
        .filter((fix): fix is string => Boolean(fix)),
    ),
  ];

  return {
    qaScore,
    verdict,
    criticalIssues,
    warnings: [...warnings, ...highIssues],
    keywordLoss,
    unsupportedClaims,
    roleContamination,
    bulletRegressions,
    formattingIssues,
    identityDrift,
    suggestedFixes,
    observabilitySummary: buildObservabilitySummary(input, allIssues, {
      contamination,
      keywordLoss,
      unsupportedClaims,
      roleContamination,
      bulletRegressions,
      formattingIssues,
      identityDrift,
    }),
  };
}

function buildDetectorContext(input: ResumeQaInput): DetectorContext {
  const sourceCorpus = normalizeCorpus(input.sourceResumeText);
  const jdCorpus = normalizeCorpus(input.jobDescriptionText);
  const generatedCorpus = normalizeCorpus(input.generatedResumeText);

  return {
    sourceResumeText: input.sourceResumeText,
    jobDescriptionText: input.jobDescriptionText,
    generatedResumeText: input.generatedResumeText,
    targetRoleLabel: input.targetRoleLabel,
    sourceCorpus,
    jdCorpus,
    generatedCorpus,
    referenceCorpus: `${sourceCorpus} ${jdCorpus}`,
  };
}

function computeQaScore(issues: QaIssue[]): number {
  let score = 100;
  for (const issue of issues) {
    score -= SEVERITY_PENALTY[issue.severity];
  }
  return Math.max(0, Math.min(100, score));
}

function computeVerdict(
  criticalIssues: QaIssue[],
  highIssues: QaIssue[],
  allIssues: QaIssue[],
): QaVerdict {
  const hasBlocker = criticalIssues.some((i) => BLOCKER_CODES.has(i.code));
  if (hasBlocker) return "block_regeneration";

  const mediumCount = allIssues.filter((i) => i.severity === "medium").length;
  if (highIssues.length > 0 || criticalIssues.length > 0 || mediumCount >= 3) {
    return "needs_review";
  }

  return "pass";
}
