import { groupDiagnosticsByCategory, topDiagnosticCodes } from "./diagnosticGrouping.ts";
import { mapInternalQualityLabel, type InternalQualityLabel } from "./internalLabels.ts";
import { resolveRecommendedOperatorAction, type RecommendedOperatorAction } from "./operatorActions.ts";
import type { SignalyzedVerdict } from "./types.ts";

export interface InternalWarningSummary {
  request_id: string | null;
  export_id: string | null;
  export_type: string | null;
  signalyzed_score: number;
  internal_label: InternalQualityLabel;
  top_diagnostic_codes: string[];
  diagnostic_groups: ReturnType<typeof groupDiagnosticsByCategory>;
  hard_blocker_count: number;
  warning_count: number;
  recommended_operator_action: RecommendedOperatorAction;
}

export interface InternalWarningSummaryInput {
  request_id?: string | null;
  export_id?: string | null;
  export_type?: string | null;
  signalyzed_score: number;
  verdict: SignalyzedVerdict;
  hard_blocker_count: number;
  warning_count: number;
  diagnostic_codes: string[];
}

export function buildInternalWarningSummary(
  input: InternalWarningSummaryInput,
): InternalWarningSummary {
  const topCodes = topDiagnosticCodes(input.diagnostic_codes, 5);
  return {
    request_id: input.request_id ?? null,
    export_id: input.export_id ?? null,
    export_type: input.export_type ?? null,
    signalyzed_score: input.signalyzed_score,
    internal_label: mapInternalQualityLabel(input),
    top_diagnostic_codes: topCodes.length > 0 ? topCodes : [...input.diagnostic_codes].slice(0, 5),
    diagnostic_groups: groupDiagnosticsByCategory(input.diagnostic_codes),
    hard_blocker_count: input.hard_blocker_count,
    warning_count: input.warning_count,
    recommended_operator_action: resolveRecommendedOperatorAction(input),
  };
}

/** Strip diagnostic_groups for compact CLI rows if needed. */
export function toCompactInternalWarningSummary(
  summary: InternalWarningSummary,
): Omit<InternalWarningSummary, "diagnostic_groups"> {
  const { diagnostic_groups: _groups, ...rest } = summary;
  return rest;
}
