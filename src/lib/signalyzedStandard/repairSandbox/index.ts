import { evaluateSignalyzedStandard } from "../evaluateSignalyzedStandard.ts";
import { classifyRepairCandidate } from "../repairCandidates/classifyRepairCandidate.ts";
import { buildRepairCandidateSignals } from "../repairCandidates/repairCandidateSignals.ts";
import type { RepairCandidateResult } from "../repairCandidates/types.ts";
import type { SignalyzedStandardInput, SignalyzedStandardResult } from "../types.ts";
import {
  buildExcludedSandboxOutput,
  buildHumanReviewSandboxOutput,
  evaluateSandboxResult,
} from "./evaluateSandboxResult.ts";
import { selectSandboxCandidate } from "./selectSandboxCandidates.ts";
import { simulateRepair } from "./simulateRepair.ts";
import type { RepairSandboxOutput } from "./types.ts";

export interface RunRepairSandboxInput {
  sourceReports: SignalyzedStandardInput;
  candidate?: RepairCandidateResult | null;
  beforeResult?: SignalyzedStandardResult;
}

function buildCandidateResult(
  sourceReports: SignalyzedStandardInput,
  before: SignalyzedStandardResult,
): RepairCandidateResult {
  const signals = buildRepairCandidateSignals({
    result: before,
    ast: sourceReports.ast,
    qa: sourceReports.qa,
    link: sourceReports.link,
    bullet: sourceReports.bullet,
    export: sourceReports.export,
  });

  return classifyRepairCandidate({
    request_id: sourceReports.requestId,
    export_id: sourceReports.exportId,
    export_type: sourceReports.exportType,
    verdict: before.verdict,
    hard_blocker_count: before.hard_blocker_count,
    diagnostic_codes: before.diagnostic_codes,
    qa: sourceReports.qa,
    link: sourceReports.link,
    bullet: sourceReports.bullet,
    signals,
  });
}

/**
 * Simulate a repair candidate in memory and compare before/after Standard evaluation.
 * Never modifies exported resume text and never persists repaired content.
 */
export function runRepairSandbox(input: RunRepairSandboxInput): RepairSandboxOutput | null {
  const before =
    input.beforeResult ?? evaluateSignalyzedStandard(input.sourceReports);

  const candidate = input.candidate ?? buildCandidateResult(input.sourceReports, before);
  const selection = selectSandboxCandidate({
    candidate,
    qa: input.sourceReports.qa,
  });

  if (!selection.eligible) {
    if (selection.exclusion_reason === "not_candidate") {
      return null;
    }
    return buildExcludedSandboxOutput({ candidate, before, selection });
  }

  if (selection.human_review_only) {
    return buildHumanReviewSandboxOutput({ candidate, before });
  }

  if (!selection.simulate || selection.sandbox_repair_type === "none") {
    return null;
  }

  const afterInput = simulateRepair(input.sourceReports, selection.sandbox_repair_type);
  const after = evaluateSignalyzedStandard(afterInput);

  return evaluateSandboxResult({
    candidate,
    before,
    after,
    sandbox_repair_type: selection.sandbox_repair_type,
  });
}
