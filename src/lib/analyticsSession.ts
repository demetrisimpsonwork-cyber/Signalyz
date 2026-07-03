/**
 * Session-level acquisition analytics — runs once per browser session.
 */

import {
  bucketReferrer,
  parseSafeUtmParams,
  type AuthState,
} from "@/lib/analyticsHelpers";
import { setAnalyticsContext, trackEvent, type PlanTier } from "@/lib/analytics";

const SESSION_INIT_KEY = "signalyz_analytics_session_init";
const RETURNING_USER_KEY = "signalyz_has_visited";

export function initAcquisitionAnalytics(): void {
  if (typeof window === "undefined") return;
  try {
    if (sessionStorage.getItem(SESSION_INIT_KEY)) return;
    sessionStorage.setItem(SESSION_INIT_KEY, "1");

    const referrer = document.referrer || "";
    const sourceBucket = bucketReferrer(referrer);
    const utm = parseSafeUtmParams(window.location.search);
    const landingPath = window.location.pathname.slice(0, 120) || "/";
    const hadVisited = localStorage.getItem(RETURNING_USER_KEY) === "1";

    setAnalyticsContext({
      source_bucket: sourceBucket,
      ...utm,
    });

    trackEvent("app_opened", {
      source_bucket: sourceBucket,
      landing_path: landingPath,
      auth_state: "anonymous",
      ...utm,
    });

    trackEvent("landing_source_detected", {
      source_bucket: sourceBucket,
      ...utm,
    });

    if (referrer) {
      trackEvent("referrer_captured", { source_bucket: sourceBucket });
    }

    trackEvent("first_visit_landing_path", { landing_path: landingPath });

    if (hadVisited) {
      trackEvent("returning_user_detected");
    } else {
      localStorage.setItem(RETURNING_USER_KEY, "1");
    }
  } catch {
    // Analytics must never throw
  }
}

export function updateAnalyticsUserContext(input: {
  isAuthenticated: boolean;
  planTier: PlanTier;
}): void {
  const auth_state: AuthState = input.isAuthenticated ? "signed_in" : "anonymous";
  setAnalyticsContext({
    auth_state,
    plan_tier: input.planTier,
  });
}
