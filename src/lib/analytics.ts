/**
 * Analytics layer — console, optional GA4, and DB persistence for authenticated users.
 * Never sends raw resume/JD text or other PII.
 */

import { supabase } from "@/integrations/supabase/client";
import { sendGa4Event } from "@/lib/ga4";

export type AnalyticsEvent =
  | "analysis_started"
  | "analysis_completed"
  | "analysis_failed"
  | "cta_clicked"
  | "paywall_viewed"
  | "payment_started"
  | "payment_completed"
  | "resume_uploaded"
  | "jd_input_started"
  | "analyze_clicked"
  | "report_tab_viewed"
  | "calibrated_resume_viewed"
  | "cover_letter_viewed"
  | "linkedin_viewed"
  | "pdf_export_clicked"
  | "docx_export_clicked"
  | "copy_clicked"
  | "pricing_viewed"
  | "upgrade_clicked"
  | "one_time_report_clicked"
  | "checkout_started"
  | "checkout_failed"
  | "signup_completed";

export type PlanTier = "free" | "pro" | "one_time" | "unknown";

export interface EventMetadata {
  signal_score?: number;
  score_bucket?: string;
  target_role?: string;
  role_category?: string;
  cta_label?: string;
  payment_mode?: string;
  source?: string;
  source_tab?: string;
  output_type?: string;
  format?: string;
  plan_tier?: PlanTier;
  success?: boolean;
  error_code?: string;
  input_source?: string;
  [key: string]: unknown;
}

const BLOCKED_METADATA_KEYS =
  /^(resume|jd|bullet|experience|letter|headline|about|body|text|content|email|password|name|phone|address)$/i;

const BLOCKED_METADATA_SUBSTRINGS = /resume_text|jd_text|original_resume|full_letter|raw_/i;

/** Strip unsafe metadata before logging or forwarding to GA4. */
export function sanitizeEventMetadata(metadata: EventMetadata = {}): EventMetadata {
  const out: EventMetadata = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (BLOCKED_METADATA_KEYS.test(key) || BLOCKED_METADATA_SUBSTRINGS.test(key)) continue;
    if (typeof value === "string" && value.length > 120) continue;
    if (value !== undefined && value !== null) {
      out[key] = value;
    }
  }
  return out;
}

export function scoreBucket(score: number): string {
  if (!Number.isFinite(score)) return "unknown";
  if (score >= 80) return "strong";
  if (score >= 65) return "moderate";
  if (score >= 50) return "developing";
  return "weak";
}

/**
 * Track an analytics event with optional metadata.
 */
export function trackEvent(event: AnalyticsEvent, metadata: EventMetadata = {}) {
  const safe = sanitizeEventMetadata(metadata);
  const payload = {
    event,
    ...safe,
    timestamp: new Date().toISOString(),
  };

  console.log(`[Analytics] ${event}`, payload);
  sendGa4Event(event, payload as Record<string, unknown>);
  persistEvent(event, payload);
}

async function persistEvent(event: string, payload: Record<string, unknown>) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("run_artifacts").insert({
      run_id: getOrCreateAnalyticsRunId(user.id),
      step_name: `analytics:${event}`,
      payload_json: payload as any,
    } as any);
  } catch {
    // Analytics should never block UX
  }
}

let analyticsRunId: string | null = null;

function getOrCreateAnalyticsRunId(userId: string): string {
  if (analyticsRunId) return analyticsRunId;

  const sessionKey = `signalyz_analytics_run_${new Date().toISOString().slice(0, 10)}`;
  const cached = sessionStorage.getItem(sessionKey);
  if (cached) {
    analyticsRunId = cached;
    return cached;
  }

  const id = crypto.randomUUID();
  analyticsRunId = id;
  sessionStorage.setItem(sessionKey, id);

  (async () => {
    try {
      await supabase.from("runs").insert({
        id,
        user_id: userId,
        input_hash: `analytics_${new Date().toISOString().slice(0, 10)}`,
        status: "analytics",
        deterministic: true,
      } as any);
    } catch {}
  })();

  return id;
}
