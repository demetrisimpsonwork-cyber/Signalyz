import { supabase } from "@/integrations/supabase/client";
import { isSignalyzedStandardShadowEnabled } from "@/lib/signalyzedStandardShadow";
import type { SignalyzedStandardInput, SignalyzedStandardResult } from "../types.ts";
import { classifyRepairCandidate } from "./classifyRepairCandidate.ts";
import { buildRepairCandidateSignals } from "./repairCandidateSignals.ts";
import {
  assertNoPiiInRepairCandidatePayload,
  buildRepairCandidateReport,
  toRepairCandidateEventRow,
} from "./sanitizeRepairCandidate.ts";
import type { RepairCandidateReport, RepairCandidateResult } from "./types.ts";

export function logRepairCandidateReport(report: RepairCandidateReport): void {
  if (!isSignalyzedStandardShadowEnabled()) return;
  if (!assertNoPiiInRepairCandidatePayload(report as unknown as Record<string, unknown>)) return;
  console.info("[signalyzed_repair_candidate_report]", report);
}

export interface PersistRepairCandidateInput {
  result: SignalyzedStandardResult;
  sourceReports: SignalyzedStandardInput;
  requestId?: string;
  exportId?: string;
  exportType?: string;
}

function buildCandidateResult(input: PersistRepairCandidateInput): RepairCandidateResult {
  const signals = buildRepairCandidateSignals({
    result: input.result,
    ast: input.sourceReports.ast,
    qa: input.sourceReports.qa,
    link: input.sourceReports.link,
    bullet: input.sourceReports.bullet,
    export: input.sourceReports.export,
  });

  return classifyRepairCandidate({
    request_id: input.requestId,
    export_id: input.exportId,
    export_type: input.exportType,
    verdict: input.result.verdict,
    hard_blocker_count: input.result.hard_blocker_count,
    diagnostic_codes: input.result.diagnostic_codes,
    qa: input.sourceReports.qa,
    link: input.sourceReports.link,
    bullet: input.sourceReports.bullet,
    signals,
  });
}

/** Fire-and-forget repair candidate persistence. Never throws; never blocks export. */
export function persistRepairCandidateObservatory(input: PersistRepairCandidateInput): void {
  if (!isSignalyzedStandardShadowEnabled()) return;

  try {
    const candidateResult = buildCandidateResult(input);

    const row = toRepairCandidateEventRow({
      result: candidateResult,
      standard_score: input.result.signalyzed_score,
      standard_verdict: input.result.verdict,
      hard_blocker_count: input.result.hard_blocker_count,
    });

    if (!assertNoPiiInRepairCandidatePayload(row as unknown as Record<string, unknown>)) return;

    void supabase
      .from("signalyzed_repair_candidate_events")
      .upsert(row, { onConflict: "export_id" })
      .then(({ error }) => {
        if (error) {
          /* swallow — table may not exist until migration applied */
        }
      });
  } catch {
    /* skip silently */
  }
}

export function buildAndLogRepairCandidate(input: PersistRepairCandidateInput): RepairCandidateReport | null {
  if (!isSignalyzedStandardShadowEnabled()) return null;

  try {
    const candidateResult = buildCandidateResult(input);
    const report = buildRepairCandidateReport(candidateResult);
    logRepairCandidateReport(report);
    persistRepairCandidateObservatory(input);
    return report;
  } catch {
    return null;
  }
}
