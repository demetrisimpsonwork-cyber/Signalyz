import type { DirectorCalibrationResult } from "@/components/DirectorCalibrationBlock";

/** Successful Camden-scale Hiring Report response shape (Patch 1 metadata included). */
export const CAMDEN_SUCCESS_HIRING_REPORT_FIXTURE: DirectorCalibrationResult = {
  status: "success",
  request_id: "d6e668f3-010c-42d7-ba78-de424431c6da",
  pipeline_version: "1.3",
  _pipeline_degraded: false,
  _report_completeness_pct: 100,
  _omitted_sections: [],
  _calibration_status: "ok",
  _detected_role_tier: "ic",
  _role_tier_label: "Individual Contributor",
  dimensions: [
    {
      name: "Technical Depth",
      classification: "Near Director Threshold",
      strength_signal: "Production ML and LLM integration experience with TypeScript and Python.",
      risk_signal: "Limited healthcare-specific regulated deployment evidence.",
    },
    {
      name: "Production Ownership",
      classification: "Below Director Threshold",
      strength_signal: "Built embedding pipelines and observability hooks.",
      risk_signal: "On-call and SLA ownership not explicit at Camden scale.",
    },
    {
      name: "Cross-Functional Influence",
      classification: "Near Director Threshold",
      strength_signal: "API integrations across product workflows.",
      risk_signal: "Clinical stakeholder partnership not evidenced.",
    },
    {
      name: "Risk & Compliance Framing",
      classification: "Below Director Threshold",
      strength_signal: "Deterministic scoring and audit-friendly patterns.",
      risk_signal: "HIPAA/PHI handling not demonstrated.",
    },
  ],
  director_signal_tier: {
    tier: "Senior IC Signal",
    rationale: "Strong applied AI engineering signal with gaps in regulated healthcare production context.",
  },
  hiring_stage_friction: {
    recruiter_filter_risk: {
      level: "Moderate",
      observation: "Title and stack align; healthcare domain may trigger recruiter screen.",
    },
    hiring_manager_friction: {
      level: "Moderate",
      observation: "Production ML present; EHR/PHI experience thin.",
    },
    executive_skepticism: { level: "Low", observation: "Limited exec-facing scope in resume." },
    primary_friction_stage: "Hiring Manager Friction",
    primary_friction_explanation: "HM will probe regulated production ML and clinical integration depth.",
  },
  pattern_detection: {
    undersignaling_patterns: ["Healthcare domain impact not quantified."],
    ownership_inflation_patterns: ["No inflation risk detected."],
  },
  recalibration_directives: [
    "Anchor ML claims to measurable latency, cost, and reliability outcomes.",
    "Surface any regulated-data handling patterns explicitly.",
  ],
  signal_classifier: {
    target_level_inferred: "Senior AI Engineer",
    dimension_scores: {
      commercial: { score: 12, gap: "commercial impact", missing: ["revenue attribution"] },
      ownership: { score: 14, gap: "ownership scope", missing: ["on-call ownership"] },
      authority: { score: 10, gap: "decision authority", missing: [] },
      cross_functional: { score: 13, gap: "cross-functional", missing: ["clinical partners"] },
      lifecycle: { score: 11, gap: "lifecycle", missing: ["model registry"] },
      risk: { score: 9, gap: "risk framing", missing: ["HIPAA"] },
      narrative: { score: 15, gap: "narrative", missing: [] },
    },
    overall_seniority_alignment: "Near senior IC bar with domain gaps",
    total_score: 84,
    top_3_gaps: ["HIPAA production context", "EHR integration", "on-call ownership"],
  },
  gap_analyzer: {
    priority_order: ["risk", "ownership", "cross_functional"],
    rewrite_targets: [
      {
        bullet_reference:
          "Designed RAG-style retrieval over document chunks with vector similarity search and evaluation harnesses.",
        upgrade_type: "risk_compression",
        reason: "Add regulated-data handling and evaluation rigor where evidenced.",
        version_a: "Designed RAG retrieval with evaluation harnesses and regression checks for production document chunks.",
        version_b: "Built RAG-style retrieval with vector search and evaluation harnesses under documented data-handling constraints.",
      },
    ],
  },
  consistency_validator: { status: "pass", issues: [] },
  export_builder: {
    final_resume_text: "Demetri Simpson\nAI Engineer...",
    changes_diff: [],
    rejected_changes: [],
  },
} as DirectorCalibrationResult & Record<string, unknown>;
