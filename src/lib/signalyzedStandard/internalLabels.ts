import type { SignalyzedVerdict } from "./types.ts";

export type InternalQualityLabel = "READY_INTERNAL" | "REVIEW_INTERNAL" | "UNSAFE_INTERNAL";

export interface InternalLabelInput {
  verdict: SignalyzedVerdict;
  signalyzed_score: number;
  hard_blocker_count: number;
}

export function mapInternalQualityLabel(input: InternalLabelInput): InternalQualityLabel {
  if (input.verdict === "unsafe" || input.hard_blocker_count > 0) {
    return "UNSAFE_INTERNAL";
  }
  if (input.verdict === "ready" && input.signalyzed_score >= 95 && input.hard_blocker_count === 0) {
    return "READY_INTERNAL";
  }
  if (input.verdict === "needs_review" && input.hard_blocker_count === 0) {
    return "REVIEW_INTERNAL";
  }
  if (input.verdict === "ready" && input.signalyzed_score < 95) {
    return "REVIEW_INTERNAL";
  }
  return "UNSAFE_INTERNAL";
}

export function isAdvisoryOnlyInternalLabel(label: InternalQualityLabel): boolean {
  return label === "READY_INTERNAL" || label === "REVIEW_INTERNAL";
}
