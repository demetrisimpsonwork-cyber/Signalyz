import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import {
  initAcquisitionAnalytics,
  updateAnalyticsUserContext,
} from "@/lib/analyticsSession";
import type { PlanTier } from "@/lib/analytics";

/** Mount once inside the router to initialize funnel analytics. */
export function AnalyticsBootstrap() {
  const { user } = useAuth();
  const { isPro, hasOneTimeCredit } = useSubscription();

  useEffect(() => {
    initAcquisitionAnalytics();
  }, []);

  useEffect(() => {
    const planTier: PlanTier = isPro
      ? "pro"
      : hasOneTimeCredit
        ? "one_time"
        : user
          ? "free"
          : "unknown";
    updateAnalyticsUserContext({
      isAuthenticated: !!user,
      planTier,
    });
  }, [user, isPro, hasOneTimeCredit]);

  return null;
}

export default AnalyticsBootstrap;
