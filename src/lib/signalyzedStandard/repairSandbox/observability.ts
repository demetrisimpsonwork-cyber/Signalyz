import { supabase } from "@/integrations/supabase/client";
import { isRepairSandboxShadowEnabled } from "@/lib/signalyzedStandardShadow";
import type { RepairCandidateResult } from "../repairCandidates/types.ts";
import type { SignalyzedStandardInput, SignalyzedStandardResult } from "../types.ts";
import { runRepairSandbox, type RunRepairSandboxInput } from "./index.ts";
import {
  assertNoPiiInSandboxPayload,
  buildRepairSandboxReport,
  toRepairSandboxEventRow,
} from "./sanitizeSandboxAudit.ts";
import type { RepairSandboxReport } from "./types.ts";

export function logRepairSandboxReport(report: RepairSandboxReport): void {
  if (!isRepairSandboxShadowEnabled()) return;
  if (!assertNoPiiInSandboxPayload(report as unknown as Record<string, unknown>)) return;
  console.info("[signalyzed_repair_sandbox_report]", report);
}

export interface PersistRepairSandboxInput extends RunRepairSandboxInput {
  candidate?: RepairCandidateResult | null;
  beforeResult?: SignalyzedStandardResult;
  sourceReports: SignalyzedStandardInput;
}

/** Fire-and-forget sandbox persistence. Never throws; never blocks export. */
export function persistRepairSandboxObservatory(input: PersistRepairSandboxInput): void {
  if (!isRepairSandboxShadowEnabled()) return;

  try {
    const output = runRepairSandbox(input);
    if (!output) return;

    const row = toRepairSandboxEventRow(output);
    if (!assertNoPiiInSandboxPayload(row as unknown as Record<string, unknown>)) return;

    void supabase
      .from("signalyzed_repair_sandbox_events")
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

export function buildAndLogRepairSandbox(input: PersistRepairSandboxInput): RepairSandboxReport | null {
  if (!isRepairSandboxShadowEnabled()) return null;

  try {
    const output = runRepairSandbox(input);
    if (!output) return null;

    const report = buildRepairSandboxReport(output);
    logRepairSandboxReport(report);
    persistRepairSandboxObservatory(input);
    return report;
  } catch {
    return null;
  }
}
