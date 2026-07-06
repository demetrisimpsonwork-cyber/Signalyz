import type {
  SignalyzedStandardEventRow,
  SignalyzedStandardReport,
  SignalyzedStandardResult,
  SignalyzedStandardInput,
} from "./types";
import { STANDARD_SANITIZER_VERSION, SIGNALYZED_STANDARD_VERSION } from "./types";

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const URL_RE = /https?:\/\/[^\s|]+/gi;

export function buildSignalyzedStandardReport(input: {
  result: SignalyzedStandardResult;
  requestId?: string;
  exportId?: string;
  exportType?: string;
  templateVersion?: string;
}): SignalyzedStandardReport {
  const { result } = input;
  return {
    event: "signalyzed_standard_report",
    request_id: input.requestId,
    export_id: input.exportId,
    standard_version: result.standard_version,
    export_type: input.exportType as SignalyzedStandardReport["export_type"],
    template_version: input.templateVersion,
    signalyzed_score: result.signalyzed_score,
    verdict: result.verdict,
    confidence: result.confidence,
    hard_blocker_count: result.hard_blocker_count,
    warning_count: result.warning_count,
    diagnostic_codes: result.diagnostic_codes,
    recommended_action: result.recommended_action,
  };
}

export function toSignalyzedStandardEventRow(input: {
  result: SignalyzedStandardResult;
  requestId?: string;
  exportId?: string;
  exportType?: string;
  templateVersion?: string;
  sourceReports: SignalyzedStandardInput;
}): SignalyzedStandardEventRow {
  const { result, sourceReports } = input;
  return {
    request_id: input.requestId ?? null,
    export_id: input.exportId ?? null,
    standard_version: result.standard_version,
    export_type: input.exportType ?? null,
    template_version: input.templateVersion ?? null,
    signalyzed_score: result.signalyzed_score,
    verdict: result.verdict,
    confidence: result.confidence,
    hard_blocker_count: result.hard_blocker_count,
    warning_count: result.warning_count,
    diagnostic_codes: result.diagnostic_codes,
    category_scores: result.categories,
    recommended_action: result.recommended_action,
    source_reports_present: {
      ast: sourceReports.ast != null,
      qa: sourceReports.qa != null,
      link: sourceReports.link != null,
      bullet: sourceReports.bullet != null,
      export: sourceReports.export != null,
    },
    sanitizer_version: STANDARD_SANITIZER_VERSION,
  };
}

export function assertNoPiiInStandardPayload(payload: Record<string, unknown>): boolean {
  const serialized = JSON.stringify(payload);
  if (EMAIL_RE.test(serialized)) return false;
  if (URL_RE.test(serialized)) return false;
  if (/@/.test(serialized)) return false;
  return true;
}

export { SIGNALYZED_STANDARD_VERSION, STANDARD_SANITIZER_VERSION };
