import type { RepairSandboxEventRow, RepairSandboxOutput, RepairSandboxReport } from "./types.ts";

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const URL_RE = /https?:\/\/[^\s|]+/gi;

const FORBIDDEN_FIELD_RE =
  /resume_text|jd_text|bullet_text|claim_text|generated_resume|original_resume|repaired_text|raw_/i;

export function buildRepairSandboxReport(output: RepairSandboxOutput): RepairSandboxReport {
  return {
    event: "signalyzed_repair_sandbox_report",
    request_id: output.request_id,
    export_id: output.export_id,
    candidate_type: output.candidate_type,
    sandbox_repair_type: output.sandbox_repair_type,
    before_score: output.before_score,
    after_score: output.after_score,
    score_delta: output.score_delta,
    before_verdict: output.before_verdict,
    after_verdict: output.after_verdict,
    hard_blocker_delta: output.hard_blocker_delta,
    warning_delta: output.warning_delta,
    risk_level: output.risk_level,
    sandbox_result: output.sandbox_result,
    recommended_next_step: output.recommended_next_step,
  };
}

export function toRepairSandboxEventRow(output: RepairSandboxOutput): RepairSandboxEventRow {
  return {
    request_id: output.request_id,
    export_id: output.export_id,
    candidate_type: output.candidate_type,
    sandbox_repair_type: output.sandbox_repair_type,
    before_score: output.before_score,
    after_score: output.after_score,
    score_delta: output.score_delta,
    before_verdict: output.before_verdict,
    after_verdict: output.after_verdict,
    hard_blocker_delta: output.hard_blocker_delta,
    warning_delta: output.warning_delta,
    risk_level: output.risk_level,
    sandbox_result: output.sandbox_result,
    recommended_next_step: output.recommended_next_step,
    diagnostic_codes_before: output.diagnostic_codes_before,
    diagnostic_codes_after: output.diagnostic_codes_after,
    source_candidate_action: output.source_candidate_action,
    sanitizer_version: output.sanitizer_version,
  };
}

export function assertNoPiiInSandboxPayload(payload: Record<string, unknown>): boolean {
  const serialized = JSON.stringify(payload);
  if (EMAIL_RE.test(serialized)) return false;
  if (URL_RE.test(serialized)) return false;
  if (/@/.test(serialized)) return false;
  if (FORBIDDEN_FIELD_RE.test(serialized)) return false;
  return true;
}
