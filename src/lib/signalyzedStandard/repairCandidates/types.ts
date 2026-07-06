import type { ExportType, SignalyzedVerdict } from "../types.ts";
import type { InternalQualityLabel } from "../internalLabels.ts";

export const REPAIR_CANDIDATE_SANITIZER_VERSION = "1.0";

export type RepairCandidateType =
  | "preserve_high_value_bullet"
  | "restore_source_link"
  | "pdf_link_validation_review"
  | "keyword_preservation_review"
  | "dedupe_bullets"
  | "formatting_cleanup"
  | "none";

export type RepairRiskLevel = "low" | "medium" | "high";

export type RepairConfidence = "low" | "medium" | "high";

export type RecommendedFutureAction =
  | "monitor_only"
  | "safe_future_repair"
  | "needs_human_review"
  | "do_not_repair";

export interface RepairCandidateResult {
  request_id: string | null;
  export_id: string | null;
  export_type: string | null;
  candidate: boolean;
  candidate_type: RepairCandidateType;
  risk_level: RepairRiskLevel;
  confidence: RepairConfidence;
  source_diagnostic_codes: string[];
  recommended_future_action: RecommendedFutureAction;
  reason_code: string;
  sanitizer_version: string;
}

export interface RepairCandidateReport {
  event: "signalyzed_repair_candidate_report";
  request_id: string | null;
  export_id: string | null;
  export_type: string | null;
  candidate: boolean;
  candidate_type: RepairCandidateType;
  risk_level: RepairRiskLevel;
  confidence: RepairConfidence;
  source_diagnostic_codes: string[];
  recommended_future_action: RecommendedFutureAction;
  reason_code: string;
}

export interface RepairCandidateEventRow {
  request_id: string | null;
  export_id: string | null;
  export_type: string | null;
  candidate: boolean;
  candidate_type: RepairCandidateType;
  risk_level: RepairRiskLevel;
  confidence: RepairConfidence;
  source_diagnostic_codes: string[];
  recommended_future_action: RecommendedFutureAction;
  reason_code: string;
  standard_score: number | null;
  standard_verdict: SignalyzedVerdict | null;
  internal_label: InternalQualityLabel | null;
  sanitizer_version: string;
}

export interface RepairCandidateDashboardMetrics {
  sample_size: number;
  candidate_rate: number | null;
  candidate_count: number;
  candidate_count_by_type: Array<{ candidate_type: RepairCandidateType; count: number }>;
  risk_breakdown: Array<{ risk_level: RepairRiskLevel; count: number }>;
  safe_future_repair_count: number;
  needs_human_review_count: number;
  do_not_repair_count: number;
  monitor_only_count: number;
  top_reason_codes: Array<{ reason_code: string; count: number }>;
  export_type_breakdown: Array<{ export_type: string; candidate_count: number; total: number }>;
}
