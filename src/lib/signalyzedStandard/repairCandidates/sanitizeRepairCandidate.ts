import { mapInternalQualityLabel } from "../internalLabels.ts";
import type { SignalyzedVerdict } from "../types.ts";
import type {
  RepairCandidateEventRow,
  RepairCandidateReport,
  RepairCandidateResult,
} from "./types.ts";

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const URL_RE = /https?:\/\/[^\s|]+/gi;

const EMPTY_OBSERVABILITY = {
  qa_signal_present: false,
  keyword_loss_count: 0,
  unsupported_claim_subtype_count: 0,
  bullet_preservation_restored_count: 0,
  identity_drift_subtype_count: 0,
} as const;

export function buildRepairCandidateReport(result: RepairCandidateResult): RepairCandidateReport {
  const obs = result.observability ?? EMPTY_OBSERVABILITY;
  return {
    event: "signalyzed_repair_candidate_report",
    request_id: result.request_id,
    export_id: result.export_id,
    export_type: result.export_type,
    candidate: result.candidate,
    candidate_type: result.candidate_type,
    risk_level: result.risk_level,
    confidence: result.confidence,
    source_diagnostic_codes: result.source_diagnostic_codes,
    recommended_future_action: result.recommended_future_action,
    reason_code: result.reason_code,
    qa_signal_present: obs.qa_signal_present,
    keyword_loss_count: obs.keyword_loss_count,
    unsupported_claim_subtype_count: obs.unsupported_claim_subtype_count,
    bullet_preservation_restored_count: obs.bullet_preservation_restored_count,
    identity_drift_subtype_count: obs.identity_drift_subtype_count,
  };
}

export function toRepairCandidateEventRow(input: {
  result: RepairCandidateResult;
  standard_score?: number | null;
  standard_verdict?: SignalyzedVerdict | null;
  hard_blocker_count?: number;
}): RepairCandidateEventRow {
  const { result } = input;
  const internal_label =
    input.standard_verdict != null
      ? mapInternalQualityLabel({
          verdict: input.standard_verdict,
          signalyzed_score: input.standard_score ?? 0,
          hard_blocker_count: input.hard_blocker_count ?? 0,
        })
      : null;

  return {
    request_id: result.request_id,
    export_id: result.export_id,
    export_type: result.export_type,
    candidate: result.candidate,
    candidate_type: result.candidate_type,
    risk_level: result.risk_level,
    confidence: result.confidence,
    source_diagnostic_codes: result.source_diagnostic_codes,
    recommended_future_action: result.recommended_future_action,
    reason_code: result.reason_code,
    standard_score: input.standard_score ?? null,
    standard_verdict: input.standard_verdict ?? null,
    internal_label,
    sanitizer_version: result.sanitizer_version,
  };
}

export function assertNoPiiInRepairCandidatePayload(payload: Record<string, unknown>): boolean {
  const serialized = JSON.stringify(payload);
  if (EMAIL_RE.test(serialized)) return false;
  if (URL_RE.test(serialized)) return false;
  if (/@/.test(serialized)) return false;
  if (/resume_text|jd_text|bullet_text|claim_text|generated_resume|original_resume/i.test(serialized)) {
    return false;
  }
  return true;
}
