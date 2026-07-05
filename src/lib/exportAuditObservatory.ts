import { supabase } from "@/integrations/supabase/client";
import {
  assertNoPiiInAuditPayload,
  toExportAuditLogRow,
  type ExportValidationReport,
} from "@/lib/exportValidation";
import { isExportValidationShadowEnabled } from "@/lib/exportValidationShadow";

export interface PersistExportAuditInput {
  report: ExportValidationReport;
  artifactSha256: string;
  userId?: string | null;
  qaScore?: number | null;
  qaVerdict?: string | null;
  astFingerprint?: string | null;
  sanitizerVersion: string;
}

/** Fire-and-forget export audit persistence. Never throws; never blocks export. */
export function persistExportAuditObservatory(input: PersistExportAuditInput): void {
  if (!isExportValidationShadowEnabled()) return;

  try {
    const row = toExportAuditLogRow(input);
    if (!assertNoPiiInAuditPayload(row as unknown as Record<string, unknown>)) return;

    void supabase
      .from("resume_export_audit_logs")
      .upsert(row, { onConflict: "export_id" })
      .then(({ error }) => {
        if (error) {
          /* swallow — observatory must never surface errors */
        }
      });
  } catch {
    /* invalid row — skip silently */
  }
}

export function logExportValidationReport(report: ExportValidationReport): void {
  if (!isExportValidationShadowEnabled()) return;
  if (!assertNoPiiInAuditPayload(report as unknown as Record<string, unknown>)) return;
  console.info("[resume_export_validation_report]", report);
}
