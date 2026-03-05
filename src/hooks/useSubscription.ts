import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SubscriptionTier = "free" | "pro";

export interface SubscriptionState {
  tier: SubscriptionTier;
  isPro: boolean;
  isFree: boolean;
  dailyRunCount: number;
  dailyRunsRemaining: number;
  loading: boolean;
  refresh: () => Promise<void>;
}

const FREE_DAILY_LIMIT = 3;

export function useSubscription(): SubscriptionState {
  const [state, setState] = useState<SubscriptionState>({
    tier: "free",
    isPro: false,
    isFree: true,
    dailyRunCount: 0,
    dailyRunsRemaining: FREE_DAILY_LIMIT,
    loading: true,
    refresh: async () => {},
  });

  const fetchSubscription = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select(
        "subscription_tier, daily_run_count, daily_run_reset_at"
      )
      .eq("user_id", user.id)
      .single();

    if (!profile) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }

    // Reset daily count if it's a new day
    const resetAt = profile.daily_run_reset_at ? new Date(profile.daily_run_reset_at) : new Date(0);
    const now = new Date();
    const isNewDay =
      now.toISOString().slice(0, 10) !== resetAt.toISOString().slice(0, 10);

    const runCount = isNewDay ? 0 : (profile.daily_run_count ?? 0);
    const tier = (profile.subscription_tier ?? "free") as SubscriptionTier;
    // Support both "pro" and legacy "pinnacle" values in DB
    const isPaid = tier === "pro" || (profile.subscription_tier as string) === "pinnacle";

    setState((s) => ({
      ...s,
      tier: isPaid ? "pro" : "free",
      isPro: isPaid,
      isFree: !isPaid,
      dailyRunCount: runCount,
      dailyRunsRemaining: isPaid ? 999 : Math.max(0, FREE_DAILY_LIMIT - runCount),
      loading: false,
    }));

    // Reset count in DB if new day
    if (isNewDay) {
      await supabase
        .from("profiles")
        .update({
          daily_run_count: 0,
          daily_run_reset_at: now.toISOString(),
        } as any)
        .eq("user_id", user.id);
    }
  }, []);

  useEffect(() => {
    fetchSubscription();

    // Re-fetch after returning from Stripe checkout
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgrade") === "success") {
      // Poll a few times to wait for webhook processing
      const delays = [2000, 5000, 10000];
      delays.forEach((ms) => {
        setTimeout(() => fetchSubscription(), ms);
      });
    }
  }, [fetchSubscription]);

  // Attach refresh to state
  useEffect(() => {
    setState((s) => ({ ...s, refresh: fetchSubscription }));
  }, [fetchSubscription]);

  return state;
}
