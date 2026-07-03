/**
 * Pure analytics helpers — safe metadata only, no PII.
 */

export type SourceBucket = "reddit" | "linkedin" | "google" | "chatgpt" | "direct" | "other";
export type AuthState = "anonymous" | "signed_in";
export type ExportFormat = "pdf" | "docx";
export type OutputType = "resume" | "cover_letter" | "linkedin" | "report" | "calibrated_resume";

/** GA4-friendly numeric score bands. */
export function ga4ScoreBucket(score: number): string {
  if (!Number.isFinite(score)) return "unknown";
  if (score >= 85) return "85_plus";
  if (score >= 70) return "70_84";
  if (score >= 50) return "50_69";
  if (score >= 30) return "30_49";
  return "0_29";
}

/** Legacy qualitative bucket (kept for continuity). */
export function scoreBucket(score: number): string {
  if (!Number.isFinite(score)) return "unknown";
  if (score >= 80) return "strong";
  if (score >= 65) return "moderate";
  if (score >= 50) return "developing";
  return "weak";
}

export function durationBucket(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "unknown";
  if (seconds < 15) return "under_15s";
  if (seconds < 30) return "15_30s";
  if (seconds < 60) return "30_60s";
  if (seconds < 120) return "60_120s";
  return "over_120s";
}

export type SignalStrengthEvent =
  | "low_signal_detected"
  | "moderate_signal_detected"
  | "strong_signal_detected";

export function signalStrengthEvent(score: number): SignalStrengthEvent | null {
  if (!Number.isFinite(score)) return null;
  if (score >= 70) return "strong_signal_detected";
  if (score >= 50) return "moderate_signal_detected";
  return "low_signal_detected";
}

export function bucketReferrer(referrer?: string | null): SourceBucket {
  const ref = (referrer ?? "").toLowerCase().trim();
  if (!ref) return "direct";
  if (/reddit\.com|redd\.it/.test(ref)) return "reddit";
  if (/linkedin\.com|lnkd\.in/.test(ref)) return "linkedin";
  if (/google\.|googleusercontent|gclid=/.test(ref)) return "google";
  if (/chatgpt\.com|chat\.openai|openai\.com/.test(ref)) return "chatgpt";
  return "other";
}

export interface SafeUtmParams {
  utm_source?: string;
  utm_campaign?: string;
}

const SAFE_UTM_RX = /^[a-z0-9_-]{1,64}$/i;

export function parseSafeUtmParams(search?: string): SafeUtmParams {
  if (!search) return {};
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const out: SafeUtmParams = {};
  const source = params.get("utm_source")?.trim();
  const campaign = params.get("utm_campaign")?.trim();
  if (source && SAFE_UTM_RX.test(source)) out.utm_source = source.toLowerCase();
  if (campaign && SAFE_UTM_RX.test(campaign)) out.utm_campaign = campaign.toLowerCase();
  return out;
}

/** Strip unsafe error payloads — codes only, no stack traces. */
export function safeErrorCode(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return "UNKNOWN";
  const code = raw.trim().slice(0, 64);
  if (/stack|trace|secret|password|api[_-]?key/i.test(code)) return "SANITIZED_ERROR";
  if (code.length > 80 || code.includes("\n")) return "UNEXPECTED_ERROR";
  return code.replace(/[^A-Z0-9_:-]/gi, "_").toUpperCase() || "UNKNOWN";
}

export function authState(isAuthenticated: boolean): AuthState {
  return isAuthenticated ? "signed_in" : "anonymous";
}
