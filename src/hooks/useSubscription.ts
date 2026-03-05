import { useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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

async function fetchSubscriptionData() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier, daily_run_count, daily_run_reset_at")
    .eq("user_id", user.id)
    .single();

  if (!profile) return null;

  // Reset daily count if it's a new day
  const resetAt = profile.daily_run_reset_at
    ? new Date(profile.daily_run_reset_at)
    : new Date(0);
  const now = new Date();
  const isNewDay =
    now.toISOString().slice(0, 10) !== resetAt.toISOString().slice(0, 10);

  const runCount = isNewDay ? 0 : (profile.daily_run_count ?? 0);
  const tier = (profile.subscription_tier ?? "free") as SubscriptionTier;
  const isPaid =
    tier === "pro" || (profile.subscription_tier as string) === "pinnacle";

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

  return {
    tier: isPaid ? ("pro" as SubscriptionTier) : ("free" as SubscriptionTier),
    isPro: isPaid,
    isFree: !isPaid,
    dailyRunCount: runCount,
    dailyRunsRemaining: isPaid ? 999 : Math.max(0, FREE_DAILY_LIMIT - runCount),
  };
}

export function useSubscription(): SubscriptionState {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["subscription-status"],
    queryFn: fetchSubscriptionData,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["subscription-status"] });
  }, [queryClient]);

  // Handle Stripe checkout return: refresh session + poll for webhook
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgrade") !== "success") return;

    const poll = async () => {
      // Force a fresh session so any server-side changes are picked up
      await supabase.auth.refreshSession();
      await queryClient.invalidateQueries({ queryKey: ["subscription-status"] });
    };

    // Poll at increasing intervals to wait for webhook processing
    const delays = [500, 2000, 5000, 10000];
    const timers = delays.map((ms) => setTimeout(poll, ms));

    return () => timers.forEach(clearTimeout);
  }, [queryClient]);

  return {
    tier: data?.tier ?? "free",
    isPro: data?.isPro ?? false,
    isFree: data?.isFree ?? true,
    dailyRunCount: data?.dailyRunCount ?? 0,
    dailyRunsRemaining: data?.dailyRunsRemaining ?? FREE_DAILY_LIMIT,
    loading: isLoading,
    refresh,
  };
}
