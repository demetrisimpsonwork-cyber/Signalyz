/**
 * Unified SignalModel — the single source of truth for all diagnostic modules.
 * Every section of the report reads from this object.
 * No module should generate independent conclusions.
 */

export interface SignalStrength {
  strength: "Strong" | "Moderate" | "Weak" | "Missing";
  evidence: string[];
}

export interface AlignmentEntry {
  category: string;
  alignment_level: "Strong" | "Moderate" | "Weak" | "Missing";
  current_signal: string;
  perception_gap: string;
  threshold_expectation: string;
}

export interface PipelineStage {
  stage: string;
  status: "PASS" | "MODERATE RISK" | "HIGH RISK";
  criteria: string[];
  explanation: string;
}

export interface SignalShift {
  before: number;
  after: number;
}

export interface RecommendedRewrite {
  text: string;
  variant: string;
  used_signals: string[];
  removed_or_softened: string[];
}

export interface SignalModel {
  /** Inferred role from JD */
  role: {
    title: string;
    level_inferred: string;
    confidence: "Strong" | "Moderate" | "Solid" | "Weak";
  };

  /** Dimension weights extracted from JD priorities */
  weights: {
    operational: number;
    stakeholder: number;
    strategic: number;
    performance: number;
    domain: number;
  };

  /** Detected strengths from resume */
  strengths: string[];

  /** Detected gaps relative to JD */
  gaps: string[];

  /** Keywords the resume under-signals relative to JD */
  under_signaled_keywords: string[];

  /** Evidence references from resume/JD backing each conclusion */
  evidence_ledger: Array<{
    claim: string;
    source: "resume" | "jd";
    evidence: string;
  }>;

  /** Hiring pipeline risk projection */
  risk_projection: {
    stages: PipelineStage[];
  };

  /** Recommended rewrites */
  recommended_rewrites: {
    bullets: RecommendedRewrite[];
  };

  /** Resume signal profile across 5 categories */
  resume_signal_profile: {
    operational_execution: SignalStrength;
    stakeholder_coordination: SignalStrength;
    strategic_influence: SignalStrength;
    performance_improvement: SignalStrength;
    domain_expertise: SignalStrength;
  };

  /** Employer priority signals extracted from JD */
  jd_signal_extraction: {
    role_identity_signals: string[];
    strategic_signals: string[];
    relationship_signals: string[];
    operational_signals: string[];
    leadership_signals: string[];
    priority_summary: string;
  };

  /** Category-level alignment analysis */
  signal_alignment_analysis: AlignmentEntry[];

  /** Executive insight summary */
  executive_insight_summary: {
    primary_insight: string;
    primary_strength: string;
    why_it_matters: string;
    strategic_repositioning_opportunity: string;
  };

  /** Transferable signal detection */
  transferable_signal_detection: {
    detected_capability: string;
    why_it_transfers: string;
    elevation_opportunity: string;
  };

  /** 6-dimension signal map (0-25 each) */
  signal_map: {
    role_identity: number;
    ownership_framing: number;
    commercial_impact: number;
    domain_expertise: number;
    stakeholder_influence: number;
    operational_execution: number;
  };

  /** Signal shift estimates after repositioning */
  signal_shift_estimates: {
    ownership_signal: SignalShift;
    commercial_impact_signal: SignalShift;
    role_identity_clarity: SignalShift;
    domain_alignment: SignalShift;
  };

  /** Identity Strength Index */
  identity_strength_index: {
    total_score: number;
    pillars: Array<{
      name: string;
      score: number;
      explanation: string;
      improvement_lever: string;
    }>;
  };

  /** Overall match score */
  match_score: {
    score: number;
    label: string;
    score_rationale: string[];
  };

  /** Scoring breakdown */
  scoring_breakdown: {
    role_outcomes_alignment: number;
    tools_and_workflow_alignment: number;
    domain_and_context_alignment: number;
    context_and_scale_alignment: number;
    communication_and_leadership_alignment: number;
  };

  /** Career Signal Map — roles the experience most strongly signals */
  career_signal_map?: {
    primary_alignment: Array<{
      role: string;
      score: number;
      signals: string[];
      explanation: string;
    }>;
    secondary_alignment: Array<{
      role: string;
      score: number;
      signals: string[];
      explanation: string;
    }>;
  };

  /** Hiring Signal Benchmark — comparison against typical candidates */
  hiring_signal_benchmark?: {
    user_score: number;
    median_candidate_score: number;
    top_candidate_threshold: number;
    dimension_comparison: Array<{
      dimension: string;
      user_score: number;
      median_score: number;
      gap_explanation: string;
    }>;
  };

  /** Interview Gap Diagnosis — why you're not getting interviews */
  interview_gap_diagnosis?: {
    primary_issue: string;
    what_hiring_managers_see: string[];
    what_this_creates: string;
    strategic_fixes: string[];
    current_score: number;
    predicted_score: number;
  };

  /** Predicted Signal Lift — estimated improvement after calibration */
  predicted_signal_lift?: {
    dimensions: Array<{
      dimension: string;
      lift: number;
    }>;
    current_score: number;
    predicted_score: number;
  };
}
