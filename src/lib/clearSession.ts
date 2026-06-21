/** Dispatched after storage is cleared so mounted pages reset in-memory analysis state. */
export const ANALYSIS_CLEARED_EVENT = "signalyz:analysis-cleared";

/** Dispatched when the user clicks Align while already on the home route. */
export const GO_TO_ALIGNMENT_EVENT = "signalyz:go-to-alignment";

/**
 * Clears all Signalyz session/analysis data from localStorage and sessionStorage.
 * Called on sign-out to ensure no previous user's data is visible.
 */
export function clearSessionState(): void {
  const localStorageKeys = [
    "signalyz_last_analysis",
    "signalyz_original_resume_baseline",
    "signalyz_original_baseline_score",
    "signalyz_calibrated_resume_data",
    "signalyz_calibrated_resume_data_edited",
    "signalyz_linkedin_output",
    "signalyz_daily_usage",
    "signalyz_session_token",
    "signalyz_fresh_login",
  ];

  const sessionStorageKeys = [
    "signalyz_alignment_score",
    "signalyz_fresh_login",
  ];

  for (const key of localStorageKeys) {
    try { localStorage.removeItem(key); } catch {}
  }

  for (const key of sessionStorageKeys) {
    try { sessionStorage.removeItem(key); } catch {}
  }

  // Also clear any signalyz_ prefixed keys we might have missed
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith("signalyz_")) localStorage.removeItem(k);
    }
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith("signalyz_")) sessionStorage.removeItem(k);
    }
  } catch {}

  try {
    window.dispatchEvent(new CustomEvent(ANALYSIS_CLEARED_EVENT));
  } catch {}
}

/** Switch to the Alignment Engine tab when already on `/`. */
export function dispatchGoToAlignment(): void {
  try {
    window.dispatchEvent(new CustomEvent(GO_TO_ALIGNMENT_EVENT));
  } catch {}
}
