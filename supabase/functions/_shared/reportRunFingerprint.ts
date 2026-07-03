/** Normalize resume/JD text for deterministic run fingerprinting. */
export function normalizeReportRunText(text: string): string {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .toLowerCase();
}

export const CANONICAL_RESUME_MIN_LEN = 100;
export const CANONICAL_JD_MIN_LEN = 20;

export interface CanonicalRunContext {
  originalResumeText: string;
  jdText: string;
  clientFingerprint: string | null;
}

function pickString(body: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** Extract canonical resume/JD from request body — never use generated output fields alone. */
export function extractCanonicalRunContext(body: Record<string, unknown>): CanonicalRunContext {
  const originalResumeText =
    pickString(body, ["originalResumeText", "original_resume_text", "originalResume"]) ||
    pickString(body, ["experience"]) ||
    pickString(body, ["bullet"]) ||
    "";

  const jdText =
    pickString(body, ["jdText", "jd_text"]) ||
    pickString(body, ["jd"]) ||
    "";

  const clientFingerprint =
    pickString(body, ["reportRunFingerprint", "report_run_fingerprint"]) || null;

  return { originalResumeText, jdText, clientFingerprint };
}

export function hasCanonicalRunContext(ctx: CanonicalRunContext): boolean {
  return (
    normalizeReportRunText(ctx.originalResumeText).length >= CANONICAL_RESUME_MIN_LEN &&
    normalizeReportRunText(ctx.jdText).length >= CANONICAL_JD_MIN_LEN
  );
}

export function buildReportRunFingerprintInput(
  userId: string,
  resumeText: string,
  jdText: string,
): string {
  const resume = normalizeReportRunText(resumeText).slice(0, 12000);
  const jd = normalizeReportRunText(jdText).slice(0, 8000);
  return `${userId}|${resume}|${jd}`;
}

export async function buildReportRunFingerprint(
  userId: string,
  resumeText: string,
  jdText: string,
): Promise<string> {
  const payload = buildReportRunFingerprintInput(userId, resumeText, jdText);
  const data = new TextEncoder().encode(payload);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** In-memory simulator for redemption semantics tests (no I/O). */
export interface ReportRedemptionSimulator {
  unusedCredits: number;
  redemptions: Set<string>;
}

export function createReportRedemptionSimulator(unusedCredits: number): ReportRedemptionSimulator {
  return { unusedCredits, redemptions: new Set() };
}

export function redemptionKey(userId: string, runFingerprint: string): string {
  return `${userId}:${runFingerprint}`;
}

/**
 * One credit unlocks one report run (fingerprint). Same run = no extra credit.
 * Different fingerprint = new credit required.
 */
export function simulateRedeemOneTimeReport(
  store: ReportRedemptionSimulator,
  userId: string,
  runFingerprint: string,
): { allowed: boolean; consumedCredit: boolean } {
  const key = redemptionKey(userId, runFingerprint);
  if (store.redemptions.has(key)) {
    return { allowed: true, consumedCredit: false };
  }
  if (store.unusedCredits <= 0) {
    return { allowed: false, consumedCredit: false };
  }
  store.unusedCredits -= 1;
  store.redemptions.add(key);
  return { allowed: true, consumedCredit: true };
}
