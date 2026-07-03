/**
 * Lightweight fingerprints for tying cached/generated outputs to the current analysis run.
 * Uses normalized text prefixes only — never stores or transmits raw resume/JD content.
 */

export interface AnalysisRunFingerprint {
  v: 1;
  jdFingerprint: string;
  resumeFingerprint: string;
  runSessionKey: string;
}

/** Normalize text into a stable, non-reversible fingerprint prefix. */
export function fingerprintText(text: string, maxLen = 150): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase().slice(0, maxLen);
}

export function buildAnalysisRunFingerprint(params: {
  jdText?: string;
  resumeText?: string;
  runSessionKey?: string;
}): AnalysisRunFingerprint {
  return {
    v: 1,
    jdFingerprint: fingerprintText(params.jdText || ""),
    resumeFingerprint: fingerprintText(params.resumeText || ""),
    runSessionKey: params.runSessionKey || "",
  };
}

export function fingerprintsMatch(
  stored: AnalysisRunFingerprint | null | undefined,
  current: AnalysisRunFingerprint,
): boolean {
  if (!stored || stored.v !== 1) return false;
  if (!current.jdFingerprint) return false;
  if (stored.jdFingerprint !== current.jdFingerprint) return false;
  if (current.resumeFingerprint && stored.resumeFingerprint !== current.resumeFingerprint) {
    return false;
  }
  if (stored.runSessionKey && current.runSessionKey && stored.runSessionKey !== current.runSessionKey) {
    return false;
  }
  return true;
}
