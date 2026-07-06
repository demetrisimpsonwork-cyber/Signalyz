import type { RepairCandidateResult } from "../repairCandidates/types.ts";
import type { SignalyzedStandardResult } from "../types.ts";
import type {
  RecommendedNextStep,
  RepairSandboxOutput,
  SandboxResult,
  SandboxSelection,
} from "./types.ts";
import { REPAIR_SANDBOX_SANITIZER_VERSION } from "./types.ts";

function resolveSandboxResult(input: {
  before: SignalyzedStandardResult;
  after: SignalyzedStandardResult;
  score_delta: number;
  hard_blocker_delta: number;
  warning_delta: number;
}): SandboxResult {
  if (input.after.verdict === "unsafe" || input.hard_blocker_delta > 0) {
    return "unsafe_to_apply";
  }
  if (input.score_delta > 0 || input.hard_blocker_delta < 0) {
    return "improved";
  }
  if (input.score_delta < 0 || input.warning_delta > 0) {
    return "regressed";
  }
  return "no_change";
}

function resolveRecommendedNextStep(input: {
  sandbox_result: SandboxResult;
  risk_level: RepairCandidateResult["risk_level"];
  human_review_only?: boolean;
  excluded?: boolean;
}): RecommendedNextStep {
  if (input.human_review_only) return "keep_human_review";
  if (input.excluded) return "do_not_apply";
  if (input.sandbox_result === "unsafe_to_apply" || input.sandbox_result === "regressed") {
    return "do_not_apply";
  }
  if (input.sandbox_result === "improved" || input.sandbox_result === "no_change") {
    return input.risk_level === "low" ? "eligible_for_future_auto_repair" : "needs_more_data";
  }
  return "needs_more_data";
}

export function buildExcludedSandboxOutput(input: {
  candidate: RepairCandidateResult;
  before: SignalyzedStandardResult;
  selection: SandboxSelection;
}): RepairSandboxOutput {
  const { candidate, before, selection } = input;
  return {
    request_id: candidate.request_id,
    export_id: candidate.export_id,
    candidate_type: candidate.candidate_type,
    sandbox_repair_type: "none",
    before_score: before.signalyzed_score,
    after_score: before.signalyzed_score,
    score_delta: 0,
    before_verdict: before.verdict,
    after_verdict: before.verdict,
    hard_blocker_delta: 0,
    warning_delta: 0,
    risk_level: candidate.risk_level,
    sandbox_result: "unsafe_to_apply",
    recommended_next_step: "do_not_apply",
    diagnostic_codes_before: [...before.diagnostic_codes],
    diagnostic_codes_after: [...before.diagnostic_codes],
    source_candidate_action: candidate.recommended_future_action,
    sanitizer_version: REPAIR_SANDBOX_SANITIZER_VERSION,
    excluded: true,
    exclusion_reason: selection.exclusion_reason,
  };
}

export function buildHumanReviewSandboxOutput(input: {
  candidate: RepairCandidateResult;
  before: SignalyzedStandardResult;
}): RepairSandboxOutput {
  const { candidate, before } = input;
  return {
    request_id: candidate.request_id,
    export_id: candidate.export_id,
    candidate_type: candidate.candidate_type,
    sandbox_repair_type: "none",
    before_score: before.signalyzed_score,
    after_score: before.signalyzed_score,
    score_delta: 0,
    before_verdict: before.verdict,
    after_verdict: before.verdict,
    hard_blocker_delta: 0,
    warning_delta: 0,
    risk_level: candidate.risk_level,
    sandbox_result: "no_change",
    recommended_next_step: "keep_human_review",
    diagnostic_codes_before: [...before.diagnostic_codes],
    diagnostic_codes_after: [...before.diagnostic_codes],
    source_candidate_action: candidate.recommended_future_action,
    sanitizer_version: REPAIR_SANDBOX_SANITIZER_VERSION,
  };
}

export function evaluateSandboxResult(input: {
  candidate: RepairCandidateResult;
  before: SignalyzedStandardResult;
  after: SignalyzedStandardResult;
  sandbox_repair_type: RepairSandboxOutput["sandbox_repair_type"];
}): RepairSandboxOutput {
  const { candidate, before, after, sandbox_repair_type } = input;
  const score_delta = after.signalyzed_score - before.signalyzed_score;
  const hard_blocker_delta = after.hard_blocker_count - before.hard_blocker_count;
  const warning_delta = after.warning_count - before.warning_count;

  const sandbox_result = resolveSandboxResult({
    before,
    after,
    score_delta,
    hard_blocker_delta,
    warning_delta,
  });

  const recommended_next_step = resolveRecommendedNextStep({
    sandbox_result,
    risk_level: candidate.risk_level,
  });

  return {
    request_id: candidate.request_id,
    export_id: candidate.export_id,
    candidate_type: candidate.candidate_type,
    sandbox_repair_type,
    before_score: before.signalyzed_score,
    after_score: after.signalyzed_score,
    score_delta,
    before_verdict: before.verdict,
    after_verdict: after.verdict,
    hard_blocker_delta,
    warning_delta,
    risk_level: candidate.risk_level,
    sandbox_result,
    recommended_next_step,
    diagnostic_codes_before: [...before.diagnostic_codes],
    diagnostic_codes_after: [...after.diagnostic_codes],
    source_candidate_action: candidate.recommended_future_action,
    sanitizer_version: REPAIR_SANDBOX_SANITIZER_VERSION,
  };
}
