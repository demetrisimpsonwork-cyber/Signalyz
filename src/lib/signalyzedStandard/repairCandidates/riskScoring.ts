import { STANDARD_CODES } from "../diagnosticCodes.ts";
import type { RepairCandidateType, RepairRiskLevel } from "./types.ts";

/** Grounding / identity issues — never safe auto-repair. */
export const HIGH_RISK_DIAGNOSTIC_CODES = new Set<string>([
  STANDARD_CODES.QA_UNSUPPORTED_CLAIM,
  STANDARD_CODES.QA_ROLE_CONTAMINATION,
  STANDARD_CODES.QA_CROSS_JOB_CONTAMINATION,
  STANDARD_CODES.QA_SEVERE_BULLET_REGRESSION,
  STANDARD_CODES.EXPORT_BROKEN_PLACEHOLDER,
  STANDARD_CODES.EXPORT_JSON_ARTIFACT,
  STANDARD_CODES.AST_PARSE_FAILURE,
  STANDARD_CODES.AST_MALFORMED_SOURCE,
]);

export function hasHighRiskDiagnostic(codes: string[]): boolean {
  return codes.some((c) => HIGH_RISK_DIAGNOSTIC_CODES.has(c));
}

export function scoreRiskForCandidateType(
  candidateType: RepairCandidateType,
  codes: string[],
): RepairRiskLevel {
  if (candidateType === "none") {
    return hasHighRiskDiagnostic(codes) ? "high" : "low";
  }

  switch (candidateType) {
    case "preserve_high_value_bullet":
    case "restore_source_link":
    case "dedupe_bullets":
    case "formatting_cleanup":
      return "low";
    case "keyword_preservation_review":
      return "medium";
    case "pdf_link_validation_review":
      return "medium";
    default:
      return "medium";
  }
}
