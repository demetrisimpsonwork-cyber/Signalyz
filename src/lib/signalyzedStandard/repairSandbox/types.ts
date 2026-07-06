import type { RepairCandidateType, RepairRiskLevel, RecommendedFutureAction } from "../repairCandidates/types.ts";
import type { SignalyzedVerdict } from "../types.ts";

export const REPAIR_SANDBOX_SANITIZER_VERSION = "1.0";

export type SandboxRepairType =
  | "preserve_high_value_bullet"
  | "restore_source_link"
  | "dedupe_bullets"
  | "formatting_cleanup"
  | "none";

export type SandboxResult = "improved" | "no_change" | "regressed" | "unsafe_to_apply";

export type RecommendedNextStep =
  | "eligible_for_future_auto_repair"
  | "keep_human_review"
  | "do_not_apply"
  | "needs_more_data";

export type SandboxExclusionReason =
  | "do_not_repair"
  | "true_unsupported_claim"
  | "role_contamination"
  | "cross_job_contamination"
  | "major_identity_drift"
  | "chronology_distortion"
  | "not_candidate"
  | "not_sandbox_repair_type";

export interface RepairSandboxOutput {
  request_id: string | null;
  export_id: string | null;
  candidate_type: RepairCandidateType;
  sandbox_repair_type: SandboxRepairType;
  before_score: number;
  after_score: number;
  score_delta: number;
  before_verdict: SignalyzedVerdict;
  after_verdict: SignalyzedVerdict;
  hard_blocker_delta: number;
  warning_delta: number;
  risk_level: RepairRiskLevel;
  sandbox_result: SandboxResult;
  recommended_next_step: RecommendedNextStep;
  diagnostic_codes_before: string[];
  diagnostic_codes_after: string[];
  source_candidate_action: RecommendedFutureAction;
  sanitizer_version: string;
  excluded?: boolean;
  exclusion_reason?: SandboxExclusionReason;
}

export interface RepairSandboxReport {
  event: "signalyzed_repair_sandbox_report";
  request_id: string | null;
  export_id: string | null;
  candidate_type: RepairCandidateType;
  sandbox_repair_type: SandboxRepairType;
  before_score: number;
  after_score: number;
  score_delta: number;
  before_verdict: SignalyzedVerdict;
  after_verdict: SignalyzedVerdict;
  hard_blocker_delta: number;
  warning_delta: number;
  risk_level: RepairRiskLevel;
  sandbox_result: SandboxResult;
  recommended_next_step: RecommendedNextStep;
}

export interface RepairSandboxEventRow {
  request_id: string | null;
  export_id: string | null;
  candidate_type: RepairCandidateType;
  sandbox_repair_type: SandboxRepairType;
  before_score: number;
  after_score: number;
  score_delta: number;
  before_verdict: SignalyzedVerdict;
  after_verdict: SignalyzedVerdict;
  hard_blocker_delta: number;
  warning_delta: number;
  risk_level: RepairRiskLevel;
  sandbox_result: SandboxResult;
  recommended_next_step: RecommendedNextStep;
  diagnostic_codes_before: string[];
  diagnostic_codes_after: string[];
  source_candidate_action: RecommendedFutureAction;
  sanitizer_version: string;
}

export interface SandboxSelection {
  eligible: boolean;
  simulate: boolean;
  sandbox_repair_type: SandboxRepairType;
  exclusion_reason?: SandboxExclusionReason;
  human_review_only?: boolean;
}

export interface RepairSandboxDashboardMetrics {
  sandbox_run_count: number;
  improved_pct: number | null;
  no_change_pct: number | null;
  regressed_pct: number | null;
  unsafe_to_apply_pct: number | null;
  average_score_delta: number | null;
  eligible_for_future_auto_repair_count: number;
  keep_human_review_count: number;
  do_not_apply_count: number;
  needs_more_data_count: number;
  repair_type_success_rate: Array<{
    sandbox_repair_type: SandboxRepairType;
    improved_or_stable_count: number;
    total: number;
    success_rate: number | null;
  }>;
  risk_breakdown: Array<{ risk_level: RepairRiskLevel; count: number }>;
  top_diagnostic_codes_before: Array<{ code: string; count: number }>;
  top_diagnostic_codes_after: Array<{ code: string; count: number }>;
}
