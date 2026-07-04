import { supabase } from "@/integrations/supabase/client";
import { trackEvent, type PlanTier } from "@/lib/analytics";

export type FeedbackSource = "hiring_report" | "calibrated_resume" | "cover_letter" | "general";
export type FeedbackOutcome = "interview" | "rejected" | "waiting";

export interface SubmitUserFeedbackInput {
  source: FeedbackSource;
  useful?: boolean | null;
  appliedWithResume?: boolean | null;
  outcome?: FeedbackOutcome | null;
  comment?: string;
  requestId?: string;
  reportRunFingerprint?: string;
  pipelineVersion?: string;
  planTier?: PlanTier;
  metadata?: Record<string, unknown>;
}

const SESSION_KEY = "signalyz_feedback_session_id";

export function getFeedbackSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function feedbackStorageKey(requestId?: string, fingerprint?: string): string {
  return `signalyz_feedback_submitted_${requestId || fingerprint || "session"}`;
}

export function hasSubmittedFeedback(requestId?: string, fingerprint?: string): boolean {
  try {
    return sessionStorage.getItem(feedbackStorageKey(requestId, fingerprint)) === "1";
  } catch {
    return false;
  }
}

export function markFeedbackSubmitted(requestId?: string, fingerprint?: string): void {
  try {
    sessionStorage.setItem(feedbackStorageKey(requestId, fingerprint), "1");
  } catch {
    /* ignore */
  }
}

function trimComment(comment?: string): string | null {
  const trimmed = (comment || "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 2000);
}

/** Persist feedback row — never sends resume/JD text. */
export async function submitUserFeedback(input: SubmitUserFeedbackInput): Promise<{ ok: boolean; error?: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const row = {
    user_id: user?.id ?? null,
    session_id: getFeedbackSessionId(),
    source: input.source,
    useful: input.useful ?? null,
    applied_with_resume: input.appliedWithResume ?? null,
    outcome: input.outcome ?? null,
    comment: trimComment(input.comment),
    request_id: input.requestId?.slice(0, 64) ?? null,
    report_run_fingerprint: input.reportRunFingerprint?.slice(0, 128) ?? null,
    pipeline_version: input.pipelineVersion?.slice(0, 32) ?? null,
    plan_tier: input.planTier ?? null,
    metadata: {
      ...(input.metadata || {}),
    },
  };

  const { error } = await supabase.from("user_feedback").insert(row);

  if (error) {
    return { ok: false, error: error.message };
  }

  markFeedbackSubmitted(input.requestId, input.reportRunFingerprint);

  trackEvent("feedback_submitted", {
    source: input.source,
    output_type: input.source,
    plan_tier: input.planTier,
    success: true,
    useful: input.useful,
    applied_with_resume: input.appliedWithResume,
    outcome: input.outcome,
    request_id: input.requestId,
    pipeline_version: input.pipelineVersion,
  });

  if (input.appliedWithResume === true) {
    trackEvent("applied_clicked", {
      source: input.source,
      output_type: input.source,
      plan_tier: input.planTier,
      outcome: input.outcome,
      request_id: input.requestId,
    });
  }

  return { ok: true };
}
