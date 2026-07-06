import { STANDARD_CODES } from "../diagnosticCodes.ts";
import type {
  BulletPreservationSummary,
  LinkPreservationSummary,
  QaShadowSummary,
} from "../types.ts";
import {
  ADVISORY_UNSUPPORTED_CLAIM_SUBTYPES,
  hasKeywordLossSignals,
  hasTrueUnsupportedClaimSubtype,
} from "./qaAdvisorySummary.ts";
import type { RepairCandidateSignals } from "./repairCandidateSignals.ts";
import { hasHighRiskDiagnostic, scoreRiskForCandidateType } from "./riskScoring.ts";
import { resolveRecommendedFutureAction } from "./repairActions.ts";
import {
  REPAIR_CANDIDATE_SANITIZER_VERSION,
  type RepairCandidateObservabilityContext,
  type RepairCandidateResult,
  type RepairCandidateType,
  type RepairConfidence,
} from "./types.ts";

export interface RepairCandidateInput {
  request_id?: string | null;
  export_id?: string | null;
  export_type?: string | null;
  verdict?: string | null;
  hard_blocker_count?: number;
  diagnostic_codes?: string[];
  qa?: QaShadowSummary | null;
  link?: LinkPreservationSummary | null;
  bullet?: BulletPreservationSummary | null;
  signals?: RepairCandidateSignals | null;
}

function qaIssueCodes(qa?: QaShadowSummary | null): string[] {
  return (qa?.issue_logs ?? []).map((i) => i.code);
}

function hasKeywordLoss(qa?: QaShadowSummary | null, signals?: RepairCandidateSignals | null): boolean {
  if (hasKeywordLossSignals(signals?.qa_advisory)) return true;
  return (
    (qa?.issue_categories?.keyword_loss ?? 0) > 0 ||
    qaIssueCodes(qa).includes("keyword_loss")
  );
}

function hasDuplicateBullets(qa?: QaShadowSummary | null): boolean {
  return (
    qaIssueCodes(qa).includes("formatting_duplicate_bullets") ||
    (qa?.issue_logs ?? []).some((i) => i.rule_id === "formatting.duplicate_bullets")
  );
}

function hasFormattingCleanup(qa?: QaShadowSummary | null): boolean {
  return (qa?.issue_logs ?? []).some(
    (i) =>
      i.rule_id.startsWith("formatting.") &&
      i.code !== "formatting_duplicate_bullets" &&
      i.code !== "formatting_duplicate_sections",
  );
}

function linkRestoreSupported(link?: LinkPreservationSummary | null): boolean {
  if (!link) return false;
  if (link.source_link_count <= 0) return false;
  if (link.restored_link_count > 0) return true;
  if (link.generated_link_count_before < link.source_link_count) return true;
  return !link.preservation_ok && link.source_link_count > link.generated_link_count_after;
}

function bulletPreserveSupported(
  bullet?: BulletPreservationSummary | null,
  signals?: RepairCandidateSignals | null,
): boolean {
  if (!bullet) return false;
  if (!bullet.hallucination_guard_passed) return false;
  if (bullet.weakened_bullet_count > 0 || bullet.restored_bullet_count > 0) return true;
  if ((signals?.bullet_preservation_restored_count ?? 0) > 0) return true;
  return bullet.protected_bullet_count > 0 && !bullet.preservation_ok;
}

function resolveConfidence(input: {
  candidate: boolean;
  candidate_type: RepairCandidateType;
  high_risk: boolean;
}): RepairConfidence {
  if (input.high_risk) return "high";
  if (!input.candidate) return "high";
  if (
    input.candidate_type === "preserve_high_value_bullet" ||
    input.candidate_type === "restore_source_link" ||
    input.candidate_type === "dedupe_bullets"
  ) {
    return "high";
  }
  if (input.candidate_type === "pdf_link_validation_review") return "medium";
  return "medium";
}

function isPdfLinkExtractionWeakOnly(codes: string[]): boolean {
  return (
    codes.includes(STANDARD_CODES.PDF_LINK_EXTRACTION_WEAK) &&
    !codes.includes(STANDARD_CODES.LINKS_MISSING_EXPECTED)
  );
}

function hasRepairBlocker(input: RepairCandidateInput, codes: string[]): boolean {
  const hardBlockers = input.hard_blocker_count ?? 0;
  const advisory = input.signals?.qa_advisory;

  if (codes.includes(STANDARD_CODES.QA_UNSUPPORTED_CLAIM)) {
    if (hardBlockers > 0 || input.verdict === "unsafe") {
      if (advisory && advisory.unsupported_claim_subtypes.length > 0) {
        if (!hasTrueUnsupportedClaimSubtype(advisory)) {
          return false;
        }
      }
      return true;
    }
    if (hasTrueUnsupportedClaimSubtype(advisory)) return true;
    return false;
  }

  if (hasHighRiskDiagnostic(codes)) return true;
  return hardBlockers > 0;
}

function unsupportedClaimReasonCode(advisory?: RepairCandidateSignals["qa_advisory"]): string {
  if (advisory?.unsupported_claim_subtypes.includes("true_unsupported_claim")) {
    return "high_risk_unsupported_claim";
  }
  return "high_risk_unsupported_claim";
}

function withObservability(
  result: Omit<RepairCandidateResult, "observability">,
  observability?: RepairCandidateObservabilityContext,
): RepairCandidateResult {
  return { ...result, observability };
}

export function classifyRepairCandidate(input: RepairCandidateInput): RepairCandidateResult {
  const codes = input.diagnostic_codes ?? [];
  const signals = input.signals ?? null;
  const observability = signals?.observability;
  const highRisk = hasRepairBlocker(input, codes);

  const base = {
    request_id: input.request_id ?? null,
    export_id: input.export_id ?? null,
    export_type: input.export_type ?? null,
    source_diagnostic_codes: [...codes],
    sanitizer_version: REPAIR_CANDIDATE_SANITIZER_VERSION,
  };

  if (highRisk) {
    const risk_level = "high" as const;
    return withObservability(
      {
        ...base,
        candidate: false,
        candidate_type: "none",
        risk_level,
        confidence: "high",
        recommended_future_action: resolveRecommendedFutureAction({
          candidate: false,
          candidate_type: "none",
          risk_level,
          high_risk_blocked: true,
        }),
        reason_code: codes.includes(STANDARD_CODES.QA_UNSUPPORTED_CLAIM)
          ? unsupportedClaimReasonCode(signals?.qa_advisory)
          : codes.includes(STANDARD_CODES.QA_ROLE_CONTAMINATION)
            ? "high_risk_role_contamination"
            : codes.includes(STANDARD_CODES.QA_CROSS_JOB_CONTAMINATION)
              ? "high_risk_cross_job_contamination"
              : "high_risk_diagnostic",
      },
      observability,
    );
  }

  if (codes.length === 0 && (input.verdict === "ready" || !input.verdict)) {
    return withObservability(
      {
        ...base,
        candidate: false,
        candidate_type: "none",
        risk_level: "low",
        confidence: "high",
        recommended_future_action: "monitor_only",
        reason_code: "ready_no_diagnostics",
      },
      observability,
    );
  }

  let candidate_type: RepairCandidateType = "none";
  let reason_code = "no_actionable_diagnostics";

  if (
    codes.includes(STANDARD_CODES.AST_LOW_BULLET_PRESERVATION) &&
    bulletPreserveSupported(input.bullet, signals)
  ) {
    candidate_type = "preserve_high_value_bullet";
    reason_code = "low_bullet_preservation_guard_verified";
  } else if (
    codes.includes(STANDARD_CODES.LINKS_MISSING_EXPECTED) &&
    linkRestoreSupported(input.link)
  ) {
    candidate_type = "restore_source_link";
    reason_code = "missing_link_restorable_from_source";
  } else if (hasDuplicateBullets(input.qa)) {
    candidate_type = "dedupe_bullets";
    reason_code = "duplicate_bullets_detected";
  } else if (hasFormattingCleanup(input.qa)) {
    candidate_type = "formatting_cleanup";
    reason_code = "formatting_artifact";
  } else if (
    codes.includes(STANDARD_CODES.QA_ADVISORY_WARNING) &&
    hasKeywordLoss(input.qa, signals)
  ) {
    candidate_type = "keyword_preservation_review";
    reason_code = "keyword_loss_advisory";
  } else if (hasKeywordLoss(input.qa, signals)) {
    candidate_type = "keyword_preservation_review";
    reason_code = "keyword_loss_advisory";
  }

  if (candidate_type === "none" && isPdfLinkExtractionWeakOnly(codes)) {
    candidate_type = "pdf_link_validation_review";
    reason_code = "pdf_link_extraction_weak";
  } else if (
    candidate_type === "none" &&
    codes.includes(STANDARD_CODES.LINKS_MISSING_EXPECTED)
  ) {
    candidate_type = "pdf_link_validation_review";
    reason_code = "missing_link_needs_review";
  }

  const candidate = candidate_type !== "none";
  const risk_level = scoreRiskForCandidateType(candidate_type, codes);
  const recommended_future_action = resolveRecommendedFutureAction({
    candidate,
    candidate_type,
    risk_level,
    high_risk_blocked: false,
  });

  return withObservability(
    {
      ...base,
      candidate,
      candidate_type,
      risk_level,
      confidence: resolveConfidence({ candidate, candidate_type, high_risk: false }),
      recommended_future_action,
      reason_code,
    },
    observability,
  );
}

/** True when unsupported claim subtypes are advisory-only (not repair blockers). */
export function isAdvisoryOnlyUnsupportedClaim(subtypes: string[]): boolean {
  return subtypes.length > 0 && subtypes.every((s) => ADVISORY_UNSUPPORTED_CLAIM_SUBTYPES.has(s));
}
