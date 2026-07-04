/**
 * Analytics layer — optional GA4, dev console, DB persistence for authenticated users.
 * Never sends raw resume/JD text or other PII.
 */

import { supabase } from "@/integrations/supabase/client";
import { sendGa4Event } from "@/lib/ga4";
import {
  ga4ScoreBucket,
  safeErrorCode,
  scoreBucket,
  type AuthState,
  type ExportFormat,
  type OutputType,
  type SourceBucket,
} from "@/lib/analyticsHelpers";

export type PlanTier = "free" | "pro" | "one_time" | "unknown";

export type AnalyticsEvent =
  // Acquisition / session
  | "app_opened"
  | "landing_source_detected"
  | "referrer_captured"
  | "first_visit_landing_path"
  | "returning_user_detected"
  // Input funnel
  | "resume_upload_started"
  | "resume_uploaded"
  | "resume_upload_failed"
  | "resume_text_pasted"
  | "jd_input_started"
  | "jd_pasted"
  | "sample_jd_clicked"
  | "input_cleared"
  | "input_strength_changed"
  // Analysis funnel
  | "analyze_clicked"
  | "analysis_started"
  | "analysis_completed"
  | "analysis_failed"
  | "analysis_duration_bucketed"
  | "score_bucket_recorded"
  | "low_signal_detected"
  | "moderate_signal_detected"
  | "strong_signal_detected"
  // Tab / output engagement
  | "report_tab_viewed"
  | "resume_analysis_viewed"
  | "hiring_report_viewed"
  | "calibrated_resume_viewed"
  | "cover_letter_viewed"
  | "linkedin_viewed"
  | "history_viewed"
  | "dashboard_viewed"
  // Generated output actions
  | "cover_letter_generated"
  | "cover_letter_regenerated"
  | "cover_letter_mode_changed"
  | "cover_letter_copied"
  | "cover_letter_pdf_export_clicked"
  | "cover_letter_docx_export_clicked"
  | "calibrated_resume_generated"
  | "calibrated_resume_pdf_export_clicked"
  | "calibrated_resume_docx_export_clicked"
  | "linkedin_generated"
  | "linkedin_copied"
  | "report_generated"
  | "report_failed"
  | "report_viewed"
  | "resume_downloaded"
  | "feedback_submitted"
  | "applied_clicked"
  // Conversion intent
  | "pricing_viewed"
  | "upgrade_modal_opened"
  | "upgrade_clicked"
  | "one_time_report_clicked"
  | "checkout_started"
  | "checkout_failed"
  | "checkout_redirected"
  | "payment_completed"
  | "paywall_viewed"
  | "paywall_cta_clicked"
  | "pro_feature_blocked"
  // Retention / history
  | "history_item_opened"
  | "history_item_deleted"
  | "prior_run_restored"
  | "new_analysis_started_after_history"
  // Errors / reliability
  | "parser_failed"
  | "edge_function_failed"
  | "export_failed"
  | "auth_required_error"
  | "pro_required_error"
  | "rate_limit_reached"
  | "network_error"
  | "unexpected_error"
  // Legacy (continuity)
  | "cta_clicked"
  | "payment_started"
  | "resume_uploaded"
  | "pdf_export_clicked"
  | "docx_export_clicked"
  | "copy_clicked"
  | "signup_completed"
  | "sign_up"
  | "login"
  | "begin_checkout"
  | "purchase";

export interface EventMetadata {
  signal_score?: number;
  score_bucket?: string;
  ga4_score_bucket?: string;
  target_role?: string;
  role_category?: string;
  cta_label?: string;
  cta_name?: string;
  payment_mode?: string;
  source?: string;
  source_tab?: string;
  source_bucket?: SourceBucket;
  output_type?: OutputType | string;
  format?: ExportFormat | string;
  export_format?: ExportFormat | string;
  plan_tier?: PlanTier;
  auth_state?: AuthState;
  success?: boolean;
  error_code?: string;
  input_source?: string;
  duration_bucket?: string;
  feature_name?: string;
  landing_path?: string;
  utm_source?: string;
  utm_campaign?: string;
  file_type?: string;
  [key: string]: unknown;
}

const BLOCKED_METADATA_KEYS =
  /^(resume|jd|bullet|experience|letter|headline|about|body|text|content|email|password|name|phone|address|company|employer|location|stack|trace|linkedin_url)$/i;

const BLOCKED_METADATA_SUBSTRINGS =
  /resume_text|jd_text|original_resume|full_letter|raw_|stack_trace|error_stack|letter_text|linkedin_text|cover_letter_text/i;

let sessionContext: EventMetadata = {};

/** Merge persistent session metadata (source bucket, auth, plan). */
export function setAnalyticsContext(partial: EventMetadata): void {
  sessionContext = { ...sessionContext, ...partial };
}

/** Strip unsafe metadata before logging or forwarding to GA4. */
export function sanitizeEventMetadata(metadata: EventMetadata = {}): EventMetadata {
  const out: EventMetadata = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (BLOCKED_METADATA_KEYS.test(key) || BLOCKED_METADATA_SUBSTRINGS.test(key)) continue;
    if (typeof value === "string" && value.length > 120) continue;
    if (key === "error_code" && typeof value === "string") {
      out.error_code = safeErrorCode(value);
      continue;
    }
    if (value !== undefined && value !== null) {
      out[key] = value;
    }
  }
  return out;
}

export { scoreBucket, ga4ScoreBucket, safeErrorCode };

/**
 * Track an analytics event with optional metadata.
 * Console logging is development-only; GA4 fires when gtag is available.
 */
export function trackEvent(event: AnalyticsEvent, metadata: EventMetadata = {}) {
  const safe = sanitizeEventMetadata({ ...sessionContext, ...metadata });
  const payload = {
    event,
    ...safe,
    timestamp: new Date().toISOString(),
  };

  if (import.meta.env.DEV) {
    console.log(`[Analytics] ${event}`, payload);
  }

  sendGa4Event(event, payload as Record<string, unknown>);
  persistEvent(event, payload);
}

/** Fire legacy + granular export events together. */
export function trackExportEvents(input: {
  legacyEvent: "pdf_export_clicked" | "docx_export_clicked";
  specificEvent:
    | "cover_letter_pdf_export_clicked"
    | "cover_letter_docx_export_clicked"
    | "calibrated_resume_pdf_export_clicked"
    | "calibrated_resume_docx_export_clicked";
  output_type: OutputType | string;
  format: ExportFormat;
  source_tab?: string;
  plan_tier?: PlanTier;
}) {
  const base = {
    output_type: input.output_type,
    format: input.format,
    export_format: input.format,
    source_tab: input.source_tab,
    plan_tier: input.plan_tier,
  };
  trackEvent(input.legacyEvent, base);
  trackEvent(input.specificEvent, base);
  if (input.output_type === "calibrated_resume") {
    trackEvent("resume_downloaded", base);
  }
}

export function trackReliabilityError(
  event:
    | "parser_failed"
    | "edge_function_failed"
    | "export_failed"
    | "auth_required_error"
    | "pro_required_error"
    | "rate_limit_reached"
    | "network_error"
    | "unexpected_error",
  errorCode: unknown,
  metadata: EventMetadata = {},
) {
  trackEvent(event, {
    ...metadata,
    error_code: safeErrorCode(errorCode),
    success: false,
  });
}

async function persistEvent(event: string, payload: Record<string, unknown>) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
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
