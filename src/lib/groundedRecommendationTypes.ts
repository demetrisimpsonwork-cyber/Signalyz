/** Configurable classification thresholds — used by groundedRecommendations only. */
export const PRESENT_SIMILARITY_THRESHOLD = 0.65;
export const PARTIAL_SIMILARITY_THRESHOLD = 0.55;
export const PRESENT_OVERLAP_THRESHOLD = 0.35;
export const PARTIAL_OVERLAP_THRESHOLD = 0.2;
export const TRANSFERABILITY_CONFIDENCE_THRESHOLD = 0.4;
/** Lower transfer gate for routing / intake / queue adjacency only. */
export const ROUTING_INTAKE_TRANSFERABILITY_THRESHOLD = 0.12;

export type GroundedRecommendationClassification = "present" | "partial" | "missing";

export interface DefensibilityFactors {
  evidence_directness: number;
  translation_distance: number;
  tool_domain_specificity: number;
  follow_up_defensibility: number;
}

export interface GroundedRecommendation {
  classification: GroundedRecommendationClassification;
  classification_reason: string;
  signal_name: string;
  recommendation: string;
  evidence_used: string[];
  evidence_confidence: number;
  transferability_confidence: number;
  grounded: boolean;
  /** Lower index = higher JD importance (from gap registry order). */
  jd_importance_rank?: number;
  /** Internal calibration score (0–100); not shown in UI by default. */
  defensibility_score?: number;
  defensibility_factors?: DefensibilityFactors;
}

export interface GroundedRecommendationDisplayEvidence {
  text: string;
  is_duplicate: boolean;
  duplicate_of_signal?: string;
}

export interface GroundedRecommendationInsights {
  featured_repositioning: GroundedRecommendation | null;
  highest_impact: GroundedRecommendation[];
  already_supported: GroundedRecommendation[];
  additional_gaps: GroundedRecommendation[];
  display_evidence: Record<string, GroundedRecommendationDisplayEvidence[]>;
}

export interface AlignmentGapsInput {
  top_missing_signal?: string | null;
  missing_keywords?: string[] | null;
  score_rationale?: string[] | null;
  primary_blocker?: string | null;
}
