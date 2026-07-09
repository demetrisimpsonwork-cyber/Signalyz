/**
 * Display-only helpers for "Predicted after calibration" teasers.
 * Does not change scoring — only decides whether a projected % is safe to show.
 */

export type CalibrationProjectionDisplay =
  | { kind: "numeric"; currentScore: number; projectedScore: number }
  | { kind: "fallback"; currentScore: number; projectedLabel: string }
  | { kind: "hidden" };

const FALLBACK_PROJECTED_LABEL = "Unlock to view";

function toFiniteScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value <= 0) return null;
  return value;
}

/**
 * Returns a safe projection display model.
 * Numeric projected % is only shown when clearly valid and strictly higher than current.
 */
export function resolveCalibrationProjectionDisplay(
  currentScoreRaw: unknown,
  predictedScoreRaw: unknown,
  options: { cap?: number } = {},
): CalibrationProjectionDisplay {
  const cap = options.cap ?? 89;
  const currentScore = toFiniteScore(currentScoreRaw);
  if (currentScore == null) return { kind: "hidden" };

  const predicted = toFiniteScore(predictedScoreRaw);
  if (predicted == null) {
    return {
      kind: "fallback",
      currentScore: Math.round(currentScore),
      projectedLabel: FALLBACK_PROJECTED_LABEL,
    };
  }

  const projectedScore = Math.min(predicted, cap);
  if (!(projectedScore > currentScore)) {
    return {
      kind: "fallback",
      currentScore: Math.round(currentScore),
      projectedLabel: FALLBACK_PROJECTED_LABEL,
    };
  }

  return {
    kind: "numeric",
    currentScore: Math.round(currentScore),
    projectedScore: Math.round(projectedScore),
  };
}

export const CALIBRATION_PROJECTION_FALLBACK_LABEL = FALLBACK_PROJECTED_LABEL;
