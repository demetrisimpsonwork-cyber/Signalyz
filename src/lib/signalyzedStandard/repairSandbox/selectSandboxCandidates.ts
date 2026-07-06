import { STANDARD_CODES } from "../diagnosticCodes.ts";
import {
  buildQaAdvisorySummary,
  hasTrueUnsupportedClaimSubtype,
} from "../repairCandidates/qaAdvisorySummary.ts";
import { hasHighRiskDiagnostic } from "../repairCandidates/riskScoring.ts";
import type { RepairCandidateResult } from "../repairCandidates/types.ts";
import type { QaShadowSummary } from "../types.ts";
import type { SandboxRepairType, SandboxSelection } from "./types.ts";

const SANDBOX_SIMULATABLE_TYPES = new Set<SandboxRepairType>([
  "preserve_high_value_bullet",
  "restore_source_link",
  "dedupe_bullets",
  "formatting_cleanup",
]);

const MAJOR_IDENTITY_DRIFT_SUBTYPES = new Set([
  "identity_drift.chronology_distorted",
  "identity_drift.metric_loss",
  "identity_drift.missing_employers",
]);

function hasChronologyDistortion(qa?: QaShadowSummary | null): boolean {
  return (qa?.issue_logs ?? []).some(
    (i) =>
      i.identity_drift_subtype === "identity_drift.chronology_distorted" ||
      i.rule_id === "identity_drift.chronology_distorted",
  );
}

function hasMajorIdentityDrift(qa?: QaShadowSummary | null): boolean {
  const advisory = buildQaAdvisorySummary(qa);
  if (!advisory?.identity_drift_subtypes.length) return false;
  return advisory.identity_drift_subtypes.some((s) => MAJOR_IDENTITY_DRIFT_SUBTYPES.has(s));
}

function resolveExclusionFromDiagnostics(
  codes: string[],
  qa?: QaShadowSummary | null,
): SandboxSelection["exclusion_reason"] | null {
  if (codes.includes(STANDARD_CODES.QA_UNSUPPORTED_CLAIM) && hasTrueUnsupportedClaimSubtype(buildQaAdvisorySummary(qa))) {
    return "true_unsupported_claim";
  }
  if (codes.includes(STANDARD_CODES.QA_ROLE_CONTAMINATION)) return "role_contamination";
  if (codes.includes(STANDARD_CODES.QA_CROSS_JOB_CONTAMINATION)) return "cross_job_contamination";
  if (hasChronologyDistortion(qa)) return "chronology_distortion";
  if (hasMajorIdentityDrift(qa)) return "major_identity_drift";
  if (hasHighRiskDiagnostic(codes) && candidateHasHardBlockerCodes(codes)) {
    return "true_unsupported_claim";
  }
  return null;
}

function candidateHasHardBlockerCodes(codes: string[]): boolean {
  return (
    codes.includes(STANDARD_CODES.QA_UNSUPPORTED_CLAIM) ||
    codes.includes(STANDARD_CODES.QA_ROLE_CONTAMINATION) ||
    codes.includes(STANDARD_CODES.QA_CROSS_JOB_CONTAMINATION)
  );
}

/** Decide whether a repair candidate row is eligible for in-memory sandbox simulation. */
export function selectSandboxCandidate(input: {
  candidate: RepairCandidateResult;
  qa?: QaShadowSummary | null;
}): SandboxSelection {
  const { candidate, qa } = input;
  const codes = candidate.source_diagnostic_codes ?? [];

  if (candidate.recommended_future_action === "do_not_repair") {
    return {
      eligible: false,
      simulate: false,
      sandbox_repair_type: "none",
      exclusion_reason: "do_not_repair",
    };
  }

  const diagnosticExclusion = resolveExclusionFromDiagnostics(codes, qa);
  if (diagnosticExclusion) {
    return {
      eligible: false,
      simulate: false,
      sandbox_repair_type: "none",
      exclusion_reason: diagnosticExclusion,
    };
  }

  if (!candidate.candidate || candidate.candidate_type === "none") {
    return {
      eligible: false,
      simulate: false,
      sandbox_repair_type: "none",
      exclusion_reason: "not_candidate",
    };
  }

  if (candidate.candidate_type === "keyword_preservation_review") {
    return {
      eligible: true,
      simulate: false,
      sandbox_repair_type: "none",
      human_review_only: true,
    };
  }

  if (!SANDBOX_SIMULATABLE_TYPES.has(candidate.candidate_type as SandboxRepairType)) {
    return {
      eligible: false,
      simulate: false,
      sandbox_repair_type: "none",
      exclusion_reason: "not_sandbox_repair_type",
    };
  }

  return {
    eligible: true,
    simulate: true,
    sandbox_repair_type: candidate.candidate_type as SandboxRepairType,
  };
}
