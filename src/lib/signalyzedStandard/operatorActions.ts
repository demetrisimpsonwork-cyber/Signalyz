import { STANDARD_CODES } from "./diagnosticCodes.ts";
import {
  categorizeDiagnosticCode,
  isAdvisoryDiagnosticCode,
  type DiagnosticCategory,
} from "./diagnosticGrouping.ts";
import { mapInternalQualityLabel, type InternalQualityLabel } from "./internalLabels.ts";

export type RecommendedOperatorAction =
  | "no_action"
  | "inspect_export"
  | "monitor_only"
  | "needs_human_review"
  | "investigate_rule"
  | "candidate_for_future_auto_repair"
  | "do_not_repair";

export interface OperatorActionInput {
  verdict: "ready" | "needs_review" | "unsafe";
  signalyzed_score: number;
  hard_blocker_count: number;
  diagnostic_codes: string[];
}

export function resolveRecommendedOperatorAction(input: OperatorActionInput): RecommendedOperatorAction {
  const label = mapInternalQualityLabel(input);
  const codes = input.diagnostic_codes ?? [];
  const nonAdvisory = codes.filter((c) => !isAdvisoryDiagnosticCode(c));

  if (label === "READY_INTERNAL") return "no_action";

  if (label === "UNSAFE_INTERNAL") {
    if (input.hard_blocker_count > 0) {
      const grounding = nonAdvisory.some(
        (c) => categorizeDiagnosticCode(c) === "grounding",
      );
      if (grounding) return "investigate_rule";
      return "inspect_export";
    }
    return "inspect_export";
  }

  // REVIEW_INTERNAL
  if (codes.length === 0) return "no_action";

  const categories = new Set(nonAdvisory.map(categorizeDiagnosticCode));

  if (nonAdvisory.length === 0) return "monitor_only";

  if (
    codes.includes(STANDARD_CODES.AST_LOW_BULLET_PRESERVATION) ||
    codes.includes(STANDARD_CODES.QA_SEVERE_BULLET_REGRESSION)
  ) {
    return "candidate_for_future_auto_repair";
  }

  if (categories.has("export_integrity" as DiagnosticCategory)) return "inspect_export";
  if (categories.has("link_integrity" as DiagnosticCategory)) return "monitor_only";
  if (categories.has("evidence_preservation" as DiagnosticCategory)) return "monitor_only";
  if (categories.has("grounding" as DiagnosticCategory)) return "investigate_rule";

  return "monitor_only";
}

export interface RepairQueueOperatorInput {
  candidate_type: string;
  recommended_future_action: string;
  candidate?: boolean;
}

/** Map persisted repair queue row to internal operator action. */
export function resolveOperatorActionFromRepairQueue(
  repair: RepairQueueOperatorInput,
): RecommendedOperatorAction {
  switch (repair.recommended_future_action) {
    case "safe_future_repair":
      return "candidate_for_future_auto_repair";
    case "needs_human_review":
      return "needs_human_review";
    case "do_not_repair":
      return "do_not_repair";
    case "monitor_only":
    default:
      return "monitor_only";
  }
}

export function summarizeOperatorActions(
  rows: OperatorActionInput[],
): Array<{ action: RecommendedOperatorAction; count: number }> {
  const counts = new Map<RecommendedOperatorAction, number>();
  for (const row of rows) {
    const action = resolveRecommendedOperatorAction(row);
    counts.set(action, (counts.get(action) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count);
}
