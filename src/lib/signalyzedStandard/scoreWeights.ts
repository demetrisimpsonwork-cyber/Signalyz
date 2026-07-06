import type { SignalyzedCategoryScores } from "./types";

/** Category weights for v0 composite score (must sum to 1). */
export const CATEGORY_WEIGHTS: Record<keyof SignalyzedCategoryScores, number> = {
  grounding: 0.2,
  identity: 0.15,
  links: 0.15,
  export_integrity: 0.25,
  formatting: 0.1,
  ats_structure: 0.1,
  stability_placeholder: 0.05,
};

export const HARD_BLOCKER_CATEGORY_PENALTY = 35;
export const WARNING_CATEGORY_PENALTY = 12;

export const VERDICT_REVIEW_THRESHOLD = 85;
export const LOW_BULLET_PRESERVATION_THRESHOLD = 0.35;

/** High-confidence QA issue codes treated as hard blockers in v0. */
export const QA_HARD_CONFIDENCE = new Set(["high", "very_high"]);

/** QA codes that are advisory-only in v0 Standard (never hard blockers alone). */
export const QA_ADVISORY_ONLY_CODES = new Set([
  "keyword_loss",
  "formatting",
  "identity_drift",
  "identity_drift_missing_employers",
  "identity_drift_generic_inflation",
  "identity_drift_metric_loss",
  "identity_drift_generic_voice",
]);
