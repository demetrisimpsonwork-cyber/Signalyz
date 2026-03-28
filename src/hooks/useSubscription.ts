import { useEffect, useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SubscriptionTier = "free" | "pro";

export interface SubscriptionState {
  tier: SubscriptionTier;
  isPro: boolean;
  isFree: boolean;
  hasOneTimeCredit: boolean;
  hasConsumedOneTimeCredit: boolean;
  dailyRunCount: number;
  dailyRunsRemaining: number;
  loading: boolean;
  refresh: () => Promise<void>;
  consumeOneTimeCredit: () => Promise<boolean>;
}

const FREE_DAILY_LIMIT = 3;

async function fetchSubscriptionData() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    
    return null;
  }

  

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("subscription_tier, subscription_status, subscription_id, subscription_period_end, daily_run_count, daily_run_reset_at")
    .eq("user_id", user.id)
    .single();

  

  if (!profile) return null;

  // Check for unused one-time purchase credits
  const { data: credits } = await supabase
    .from("one_time_purchases" as any)
    .select("id")
    .eq("user_id", user.id)
    .eq("used", false)
    .limit(1);

  const hasOneTimeCredit = !!(credits && (credits as any[]).length > 0);

  // Check for consumed one-time purchases (user bought $9 but already used it)
  const { data: usedCredits } = await supabase
    .from("one_time_purchases" as any)
    .select("id")
    .eq("user_id", user.id)
    .eq("used", true)
    .limit(1);

  const hasConsumedOneTimeCredit = !!(usedCredits && (usedCredits as any[]).length > 0);

  // Reset daily count if it's a new day
  const resetAt = profile.daily_run_reset_at
    ? new Date(profile.daily_run_reset_at)
    : new Date(0);
  const now = new Date();
  const isNewDay =
    now.toISOString().slice(0, 10) !== resetAt.toISOString().slice(0, 10);

  const runCount = isNewDay ? 0 : (profile.daily_run_count ?? 0);
  const tier = (profile.subscription_tier ?? "free") as SubscriptionTier;
  const status = (profile as any).subscription_status as string | null;
  const isActiveSub = status === "active" || status === "trialing";
  const isPaid =
    (tier === "pro" || (profile.subscription_tier as string) === "pinnacle") && isActiveSub;

  

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

  const result = {
    tier: isPaid ? ("pro" as SubscriptionTier) : ("free" as SubscriptionTier),
    isPro: isPaid,
    isFree: !isPaid,
    hasOneTimeCredit,
    hasConsumedOneTimeCredit,
    dailyRunCount: runCount,
    dailyRunsRemaining: isPaid ? 999 : Math.max(0, FREE_DAILY_LIMIT - runCount),
    _debug: {
      userId: user.id,
      rawTier: profile.subscription_tier,
      rawStatus: (profile as any).subscription_status,
      rawSubId: (profile as any).subscription_id,
      resolvedTier: isPaid ? "pro" : "free",
      hasOneTimeCredit,
      hasConsumedOneTimeCredit,
      queriedAt: new Date().toISOString(),
    },
  };

  

  return result;
}

export function useSubscription(): SubscriptionState {
  const queryClient = useQueryClient();
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      
      setAuthReady(true);
      queryClient.invalidateQueries({ queryKey: ["subscription-status"] });
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setAuthReady(true);
      }
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);

  const { data, isLoading } = useQuery({
    queryKey: ["subscription-status"],
    queryFn: fetchSubscriptionData,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    enabled: authReady,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["subscription-status"] });
  }, [queryClient]);

  const consumeOneTimeCredit = useCallback(async (): Promise<boolean> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // Use SECURITY DEFINER RPC to consume credit server-side (bypasses RLS)
    const { data: consumed, error } = await supabase.rpc(
      "consume_one_time_credit" as any,
      { p_user_id: user.id } as any
    );

    if (error) {
      console.error("[SubCheck] Failed to consume one-time credit:", error);
      return false;
    }

    if (!consumed) {
      console.warn("[SubCheck] No unused one-time credit found to consume");
      return false;
    }

    
    await queryClient.invalidateQueries({ queryKey: ["subscription-status"] });
    return true;
  }, [queryClient]);

  // Handle Stripe checkout return: refresh session + poll for webhook
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgrade") !== "success" && params.get("purchase") !== "success") return;

    const poll = async () => {
      await supabase.auth.refreshSession();
      await queryClient.invalidateQueries({ queryKey: ["subscription-status"] });
    };

    const delays = [500, 2000, 5000, 10000];
    const timers = delays.map((ms) => setTimeout(poll, ms));

    return () => timers.forEach(clearTimeout);
  }, [queryClient]);

  return {
    tier: data?.tier ?? "free",
    isPro: data?.isPro ?? false,
    isFree: data?.isFree ?? true,
    hasOneTimeCredit: data?.hasOneTimeCredit ?? false,
    hasConsumedOneTimeCredit: data?.hasConsumedOneTimeCredit ?? false,
    dailyRunCount: data?.dailyRunCount ?? 0,
    dailyRunsRemaining: data?.dailyRunsRemaining ?? FREE_DAILY_LIMIT,
    loading: isLoading || !authReady,
    refresh,
    consumeOneTimeCredit,
  };
}
