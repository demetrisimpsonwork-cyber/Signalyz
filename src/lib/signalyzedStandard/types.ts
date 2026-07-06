/** Signalyzed Standard v0 — Initiative 002 Phase 3C. */

export const SIGNALYZED_STANDARD_VERSION = "0.1.0";
export const STANDARD_SANITIZER_VERSION = "1.0";

export type SignalyzedVerdict = "ready" | "needs_review" | "unsafe";
export type SignalyzedConfidence = "low" | "medium" | "high";
export type RecommendedAction =
  | "keep_shadow"
  | "ready_for_internal_warning"
  | "ready_for_auto_repair_candidate"
  | "do_not_enforce";

export type ExportType = "docx" | "pdf";

export interface SignalyzedCategoryScores {
  grounding: number;
  identity: number;
  links: number;
  export_integrity: number;
  formatting: number;
  ats_structure: number;
  stability_placeholder: number;
}

/** Sanitized AST shadow summary — no resume text. */
export interface AstShadowSummary {
  event: "resume_ast_shadow_report";
  request_id?: string;
  source_parse_ok: boolean;
  generated_parse_ok: boolean;
  validation_error_count: number;
  warning_count: number;
  round_trip_fidelity: number;
  bullet_preservation_score: number;
  keyword_preservation_score: number;
  missing_section_count: number;
  added_section_count: number;
  source_sections: number;
  generated_sections: number;
  source_bullets: number;
  generated_bullets: number;
}

/** Sanitized QA shadow summary — issue logs contain codes/terms only. */
export interface QaShadowSummary {
  event: "resume_qa_shadow_report";
  request_id?: string;
  qa_score: number;
  verdict: string;
  critical_issue_count: number;
  warning_count: number;
  issue_categories: Record<string, number>;
  issue_logs?: Array<{
    rule_id: string;
    code: string;
    confidence: string;
    severity: string;
    matched_terms?: string[];
    contamination_subtype?: string;
    unsupported_claim_subtype?: string;
    identity_drift_subtype?: string;
  }>;
}

/** Sanitized link preservation summary. */
export interface LinkPreservationSummary {
  event: "resume_link_preservation_report";
  request_id?: string;
  source_link_count: number;
  generated_link_count_before: number;
  generated_link_count_after: number;
  restored_link_count: number;
  link_types_restored: string[];
  duplicate_link_count: number;
  broken_link_count: number;
  preservation_ok: boolean;
}

/** Sanitized bullet preservation summary — no raw bullet text. */
export interface BulletPreservationSummary {
  event: "resume_bullet_preservation_report";
  request_id?: string;
  protected_bullet_count: number;
  weakened_bullet_count: number;
  restored_bullet_count: number;
  duplicate_bullet_count: number;
  hallucination_guard_passed: boolean;
  preservation_ok: boolean;
  affected_sections: string[];
}

/** Sanitized export validation summary. */
export interface ExportValidationSummary {
  event: "resume_export_validation_report";
  request_id?: string;
  export_id: string;
  export_type: ExportType;
  template_version: string;
  validation_passed: boolean;
  validation_warning_count: number;
  validation_error_count: number;
  link_count: number;
  broken_link_count: number;
  missing_expected_link_count: number;
  duplicate_link_count: number;
  section_count: number;
  bullet_count: number;
  page_count: number | null;
  error_class?: string;
  diagnostic_codes?: string[];
}

export interface SignalyzedStandardInput {
  requestId?: string;
  exportId?: string;
  exportType?: ExportType;
  templateVersion?: string;
  ast?: AstShadowSummary | null;
  qa?: QaShadowSummary | null;
  link?: LinkPreservationSummary | null;
  bullet?: BulletPreservationSummary | null;
  export?: ExportValidationSummary | null;
  /** Optional DOCX export summary for PDF weak-link comparison. */
  docxExport?: ExportValidationSummary | null;
}

export interface SignalyzedStandardResult {
  standard_version: typeof SIGNALYZED_STANDARD_VERSION;
  signalyzed_score: number;
  verdict: SignalyzedVerdict;
  confidence: SignalyzedConfidence;
  hard_blocker_count: number;
  warning_count: number;
  categories: SignalyzedCategoryScores;
  diagnostic_codes: string[];
  recommended_action: RecommendedAction;
}

export interface SignalyzedStandardReport {
  event: "signalyzed_standard_report";
  request_id?: string;
  export_id?: string;
  standard_version: string;
  export_type?: ExportType;
  template_version?: string;
  signalyzed_score: number;
  verdict: SignalyzedVerdict;
  confidence: SignalyzedConfidence;
  hard_blocker_count: number;
  warning_count: number;
  diagnostic_codes: string[];
  recommended_action: RecommendedAction;
}

export interface SignalyzedStandardEventRow {
  request_id: string | null;
  export_id: string | null;
  standard_version: string;
  export_type: string | null;
  template_version: string | null;
  signalyzed_score: number;
  verdict: SignalyzedVerdict;
  confidence: SignalyzedConfidence;
  hard_blocker_count: number;
  warning_count: number;
  diagnostic_codes: string[];
  category_scores: SignalyzedCategoryScores;
  recommended_action: RecommendedAction;
  source_reports_present: Record<string, boolean>;
  sanitizer_version: string;
}

export interface DiagnosticFinding {
  code: string;
  severity: "hard_blocker" | "warning";
  category: keyof SignalyzedCategoryScores;
}
