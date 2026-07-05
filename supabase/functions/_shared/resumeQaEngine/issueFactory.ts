import type { QaConfidence, QaIssue, QaIssueSource, QaSeverity } from "./types.ts";

export interface BuildIssueInput {
  ruleId: string;
  detector: string;
  code: string;
  confidence: QaConfidence;
  matchedTerms: string[];
  source: QaIssueSource;
  evidenceCount?: number;
  message: string;
  section?: string;
  suggestedFix?: string;
  /** Internal debugging only — stripped from confusion logs. */
  evidence?: string;
  /** Proposed severity before confidence calibration. */
  proposedSeverity?: QaSeverity;
  /** Phase 3D — contamination precision taxonomy (no raw text). */
  contaminationSubtype?: import("./contaminationArtifactClassifier.ts").ContaminationSubtype;
}

const BLOCKER_CODES = new Set([
  "cross_jd_contamination",
  "unsupported_claim",
  "role_contamination",
  "bullet_regression",
  "formatting_spaced_letters",
]);

/** Only very_high and high confidence may become critical. */
export function confidenceToSeverity(
  confidence: QaConfidence,
  code: string,
  proposed: QaSeverity = "critical",
): QaSeverity {
  const wantsCritical = proposed === "critical" && BLOCKER_CODES.has(code);

  if (confidence === "very_high") {
    return wantsCritical ? "critical" : proposed;
  }
  if (confidence === "high") {
    if (wantsCritical) return "critical";
    return proposed === "low" ? "low" : "high";
  }
  if (confidence === "medium") {
    if (proposed === "critical" || proposed === "high") return "medium";
    return proposed;
  }
  return "low";
}

export function buildIssue(input: BuildIssueInput): QaIssue {
  const proposed = input.proposedSeverity ?? defaultProposedSeverity(input.code, input.confidence);
  const severity = confidenceToSeverity(input.confidence, input.code, proposed);

  return {
    code: input.code,
    severity,
    message: input.message,
    evidence: input.evidence,
    section: input.section,
    suggestedFix: input.suggestedFix,
    ruleId: input.ruleId,
    detector: input.detector,
    confidence: input.confidence,
    evidenceCount: input.evidenceCount ?? input.matchedTerms.length,
    matchedTerms: input.matchedTerms,
    source: input.source,
    contaminationSubtype: input.contaminationSubtype,
  };
}

function defaultProposedSeverity(code: string, confidence: QaConfidence): QaSeverity {
  if (BLOCKER_CODES.has(code) && (confidence === "very_high" || confidence === "high")) {
    return "critical";
  }
  if (confidence === "very_high") return "high";
  if (confidence === "high") return "high";
  if (confidence === "medium") return "medium";
  return "low";
}
