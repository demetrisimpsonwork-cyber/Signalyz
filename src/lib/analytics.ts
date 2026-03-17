/**
 * Lightweight analytics layer for tracking conversion and usage events.
 * Events are logged to the database (for authenticated users) and console.
 * No third-party analytics SDK required — extend later as needed.
 */

import { supabase } from "@/integrations/supabase/client";

export type AnalyticsEvent =
  | "analysis_started"
  | "analysis_completed"
  | "cta_clicked"
  | "paywall_viewed"
  | "payment_started"
  | "payment_completed";

interface EventMetadata {
  signal_score?: number;
  target_role?: string;
  cta_label?: string;
  payment_mode?: string;
  source?: string;
  [key: string]: unknown;
}

/**
 * Track an analytics event with optional metadata.
 * Logs to console and persists to run_artifacts for authenticated users.
 */
export function trackEvent(event: AnalyticsEvent, metadata: EventMetadata = {}) {
  const payload = {
    event,
    ...metadata,
    timestamp: new Date().toISOString(),
  };

  // Always log to console for debugging
  console.log(`[Analytics] ${event}`, payload);

  // Persist to database for authenticated users (fire-and-forget)
  persistEvent(event, payload);
}

async function persistEvent(event: string, payload: Record<string, unknown>) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return; // Only persist for authenticated users

    // Store analytics events as run artifacts with a special step_name
    // This avoids needing a new table and leverages existing RLS
    await supabase.from("run_artifacts").insert({
      run_id: getOrCreateAnalyticsRunId(user.id),
      step_name: `analytics:${event}`,
      payload_json: payload as any,
    } as any);
  } catch {
    // Analytics should never block UX — silently fail
  }
}

// Use a session-scoped "analytics run" to group events
let analyticsRunId: string | null = null;

function getOrCreateAnalyticsRunId(userId: string): string {
  if (analyticsRunId) return analyticsRunId;

  // Create a deterministic run ID for this session
  const sessionKey = `signalyz_analytics_run_${new Date().toISOString().slice(0, 10)}`;
  const cached = sessionStorage.getItem(sessionKey);
  if (cached) {
    analyticsRunId = cached;
    return cached;
  }

  // We need an actual run row for the FK constraint — create async and cache
  const id = crypto.randomUUID();
  analyticsRunId = id;
  sessionStorage.setItem(sessionKey, id);

  // Fire-and-forget: create a lightweight analytics run
  supabase.from("runs").insert({
    id,
    user_id: userId,
    input_hash: `analytics_${new Date().toISOString().slice(0, 10)}`,
    status: "analytics",
    deterministic: true,
  } as any).then(() => {}).catch(() => {
    // If insert fails (e.g. duplicate), that's fine
  });

  return id;
}
