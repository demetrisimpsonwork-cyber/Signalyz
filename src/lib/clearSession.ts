/**
 * Clears all Signalyz session/analysis data from localStorage and sessionStorage.
 * Called on sign-out to ensure no previous user's data is visible.
 */
export function clearSessionState(): void {
  const localStorageKeys = [
    "signalyz_last_analysis",
    "signalyz_original_resume_baseline",
    "signalyz_calibrated_resume_data",
    "signalyz_calibrated_resume_data_edited",
    "signalyz_daily_usage",
    "signalyz_session_token",
  ];

  const sessionStorageKeys = [
    "signalyz_alignment_score",
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
}
