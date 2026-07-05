import { supabase } from "@/integrations/supabase/client";
import {
  assertNoPiiInStandardPayload,
  buildSignalyzedStandardReport,
  toSignalyzedStandardEventRow,
  type SignalyzedStandardReport,
} from "@/lib/signalyzedStandard/sanitizeStandardAudit";
import type { SignalyzedStandardInput, SignalyzedStandardResult } from "@/lib/signalyzedStandard/types";
import { isSignalyzedStandardShadowEnabled } from "@/lib/signalyzedStandardShadow";

export function logSignalyzedStandardReport(report: SignalyzedStandardReport): void {
  if (!isSignalyzedStandardShadowEnabled()) return;
  if (!assertNoPiiInStandardPayload(report as unknown as Record<string, unknown>)) return;
  console.info("[signalyzed_standard_report]", report);
}

export interface PersistSignalyzedStandardInput {
  result: SignalyzedStandardResult;
  sourceReports: SignalyzedStandardInput;
  requestId?: string;
  exportId?: string;
  exportType?: string;
  templateVersion?: string;
}

/** Fire-and-forget standard event persistence. Never throws; never blocks export. */
export function persistSignalyzedStandardObservatory(input: PersistSignalyzedStandardInput): void {
  if (!isSignalyzedStandardShadowEnabled()) return;

  try {
    const row = toSignalyzedStandardEventRow({
      result: input.result,
      requestId: input.requestId,
      exportId: input.exportId,
      exportType: input.exportType,
      templateVersion: input.templateVersion,
      sourceReports: input.sourceReports,
    });
    if (!assertNoPiiInStandardPayload(row as unknown as Record<string, unknown>)) return;

    void supabase
      .from("signalyzed_standard_events")
      .upsert(row, { onConflict: "export_id" })
      .then(({ error }) => {
        if (error) {
          /* swallow */
        }
      });
  } catch {
    /* skip silently */
  }
}

export function buildAndLogSignalyzedStandard(input: PersistSignalyzedStandardInput): SignalyzedStandardReport {
  const report = buildSignalyzedStandardReport({
    result: input.result,
    requestId: input.requestId,
    exportId: input.exportId,
    exportType: input.exportType,
    templateVersion: input.templateVersion,
  });
  logSignalyzedStandardReport(report);
  persistSignalyzedStandardObservatory(input);
  return report;
}
