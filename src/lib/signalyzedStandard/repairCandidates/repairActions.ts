import type {
  RecommendedFutureAction,
  RepairCandidateType,
  RepairRiskLevel,
} from "./types.ts";

export function resolveRecommendedFutureAction(input: {
  candidate: boolean;
  candidate_type: RepairCandidateType;
  risk_level: RepairRiskLevel;
  high_risk_blocked: boolean;
}): RecommendedFutureAction {
  if (input.high_risk_blocked) {
    return input.candidate ? "needs_human_review" : "do_not_repair";
  }

  if (!input.candidate || input.candidate_type === "none") {
    return "monitor_only";
  }

  switch (input.candidate_type) {
    case "preserve_high_value_bullet":
    case "restore_source_link":
    case "dedupe_bullets":
    case "formatting_cleanup":
      return input.risk_level === "low" ? "safe_future_repair" : "needs_human_review";
    case "keyword_preservation_review":
      return "needs_human_review";
    case "pdf_link_validation_review":
      return "monitor_only";
    default:
      return "monitor_only";
  }
}
