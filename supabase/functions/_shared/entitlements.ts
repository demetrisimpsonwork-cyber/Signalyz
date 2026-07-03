import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { shouldConsumeOneTimeCredit } from "./entitlementGuard.ts";

export const DAILY_FREE_ALIGNMENT_LIMIT = 3;
export const DAILY_FREE_RUN_LIMIT = 3;
export const DAILY_EMBEDDING_LIMIT = 60;

export type EntitlementSource = "subscription" | "admin" | "one_time_credit" | "free";

export interface UserEntitlements {
  userId: string | null;
  isAuthenticated: boolean;
  isProSubscriber: boolean;
  isAdmin: boolean;
  hasOneTimeCredit: boolean;
  isProEntitled: boolean;
  entitlementSource: EntitlementSource;
}

export function isActiveSubscriptionStatus(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing";
}

export function isProSubscriptionTier(tier: string | null | undefined): boolean {
  return tier === "pro" || tier === "pinnacle";
}

export function resolveProEntitlement(input: {
  subscriptionTier?: string | null;
  subscriptionStatus?: string | null;
  isAdmin?: boolean;
  hasOneTimeCredit?: boolean;
}): Pick<UserEntitlements, "isProSubscriber" | "isAdmin" | "hasOneTimeCredit" | "isProEntitled" | "entitlementSource"> {
  const isProSubscriber =
    isProSubscriptionTier(input.subscriptionTier) &&
    isActiveSubscriptionStatus(input.subscriptionStatus);
  const isAdmin = !!input.isAdmin;
  const hasOneTimeCredit = !!input.hasOneTimeCredit;
  const isProEntitled = isProSubscriber || isAdmin || hasOneTimeCredit;

  let entitlementSource: EntitlementSource = "free";
  if (isAdmin) {
    entitlementSource = "admin";
  } else if (isProSubscriber) {
    entitlementSource = "subscription";
  } else if (hasOneTimeCredit) {
    entitlementSource = "one_time_credit";
  }

  return {
    isProSubscriber,
    isAdmin,
    hasOneTimeCredit,
    isProEntitled,
    entitlementSource,
  };
}

export function guestEntitlements(): UserEntitlements {
  return {
    userId: null,
    isAuthenticated: false,
    isProSubscriber: false,
    isAdmin: false,
    hasOneTimeCredit: false,
    isProEntitled: false,
    entitlementSource: "free",
  };
}

export function isValidSessionToken(token: unknown): token is string {
  return (
    typeof token === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)
  );
}

export async function getUserIdFromRequest(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  return user?.id ?? null;
}

export async function loadUserEntitlements(
  serviceClient: SupabaseClient,
  userId: string,
): Promise<UserEntitlements> {
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("subscription_tier, subscription_status")
    .eq("user_id", userId)
    .maybeSingle();

  const { data: isAdmin } = await serviceClient.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });

  const { data: credits } = await serviceClient
    .from("one_time_purchases")
    .select("id")
    .eq("user_id", userId)
    .eq("used", false)
    .limit(1);

  const resolved = resolveProEntitlement({
    subscriptionTier: profile?.subscription_tier,
    subscriptionStatus: profile?.subscription_status,
    isAdmin: !!isAdmin,
    hasOneTimeCredit: !!(credits && credits.length > 0),
  });

  return {
    userId,
    isAuthenticated: true,
    ...resolved,
  };
}

export async function getDailyRunCount(
  serviceClient: SupabaseClient,
  userId: string,
): Promise<number> {
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("daily_run_count, daily_run_reset_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!profile) {
    return 0;
  }

  const resetAt = profile.daily_run_reset_at ? new Date(profile.daily_run_reset_at) : new Date(0);
  const now = new Date();
  const isNewDay = now.toISOString().slice(0, 10) !== resetAt.toISOString().slice(0, 10);

  if (isNewDay) {
    await serviceClient
      .from("profiles")
      .update({
        daily_run_count: 0,
        daily_run_reset_at: now.toISOString(),
      })
      .eq("user_id", userId);
    return 0;
  }

  return profile.daily_run_count ?? 0;
}

export interface AlignmentUsageIdentity {
  userId: string | null;
  sessionToken: string | null;
}

export async function getAlignmentUsageCount(
  serviceClient: SupabaseClient,
  identity: AlignmentUsageIdentity,
  usageDate: string,
): Promise<{ id: string | null; alignmentCount: number }> {
  if (identity.userId) {
    const { data } = await serviceClient
      .from("usage_tracking")
      .select("id, alignment_count")
      .eq("user_id", identity.userId)
      .eq("usage_date", usageDate)
      .maybeSingle();
    return { id: data?.id ?? null, alignmentCount: data?.alignment_count ?? 0 };
  }

  if (identity.sessionToken) {
    const { data } = await serviceClient
      .from("usage_tracking")
      .select("id, alignment_count")
      .eq("session_token", identity.sessionToken)
      .eq("usage_date", usageDate)
      .maybeSingle();
    return { id: data?.id ?? null, alignmentCount: data?.alignment_count ?? 0 };
  }

  return { id: null, alignmentCount: 0 };
}

export async function incrementAlignmentUsage(
  serviceClient: SupabaseClient,
  identity: AlignmentUsageIdentity,
  usageDate: string,
): Promise<void> {
  const existing = await getAlignmentUsageCount(serviceClient, identity, usageDate);

  if (existing.id) {
    await serviceClient
      .from("usage_tracking")
      .update({
        alignment_count: existing.alignmentCount + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    return;
  }

  await serviceClient
    .from("usage_tracking")
    .insert({
      user_id: identity.userId,
      session_token: identity.sessionToken,
      ip_address: null,
      usage_date: usageDate,
      alignment_count: 1,
    });
}

export async function consumeOneTimeCreditForUser(
  serviceClient: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await serviceClient.rpc("consume_one_time_credit_for_user", {
    p_user_id: userId,
  });
  if (error) {
    console.error(JSON.stringify({
      event: "consume_one_time_credit_for_user_failed",
      user_id: userId,
      error_message: error.message,
    }));
    return false;
  }
  return !!data;
}

export async function hasOneTimeReportRedemption(
  serviceClient: SupabaseClient,
  userId: string,
  runFingerprint: string,
): Promise<boolean> {
  const { data } = await serviceClient
    .from("one_time_report_redemptions")
    .select("id")
    .eq("user_id", userId)
    .eq("run_fingerprint", runFingerprint)
    .maybeSingle();
  return !!data?.id;
}

export async function redeemOneTimeCreditForRun(
  serviceClient: SupabaseClient,
  userId: string,
  runFingerprint: string,
): Promise<boolean> {
  const { data, error } = await serviceClient.rpc("redeem_one_time_credit_for_run", {
    p_user_id: userId,
    p_run_fingerprint: runFingerprint,
  });
  if (error) {
    console.error(JSON.stringify({
      event: "redeem_one_time_credit_for_run_failed",
      user_id: userId,
      error_message: error.message,
    }));
    return false;
  }
  return data?.allowed === true;
}

/**
 * Ensure one-time buyers can access Pro outputs for one full report run.
 * Same resume+JD fingerprint reuses the redeemed credit; different inputs need a new credit.
 */
export async function ensureOneTimeReportAccess(
  serviceClient: SupabaseClient,
  userId: string,
  entitlements: UserEntitlements,
  runFingerprint: string,
): Promise<boolean> {
  if (entitlements.isAdmin || entitlements.isProSubscriber) return true;
  if (!runFingerprint?.trim()) return false;

  if (!shouldConsumeOneTimeCredit(entitlements)) {
    if (entitlements.isProEntitled) return true;
    return hasOneTimeReportRedemption(serviceClient, userId, runFingerprint);
  }

  return redeemOneTimeCreditForRun(serviceClient, userId, runFingerprint);
}

/** @deprecated Use ensureOneTimeReportAccess with a run fingerprint. */
export async function reserveOneTimeCreditIfNeeded(
  serviceClient: SupabaseClient,
  userId: string,
  entitlements: UserEntitlements,
  runFingerprint?: string,
): Promise<boolean> {
  if (!runFingerprint) {
    return consumeOneTimeCreditForUser(serviceClient, userId);
  }
  return ensureOneTimeReportAccess(serviceClient, userId, entitlements, runFingerprint);
}

export { shouldConsumeOneTimeCredit, validateRpcCallerScope } from "./entitlementGuard.ts";

export async function incrementDailyRunCount(
  serviceClient: SupabaseClient,
  userId: string,
): Promise<void> {
  await serviceClient.rpc("increment_run_count_for_user", { p_user_id: userId });
}

export async function getEmbeddingUsageCount(
  serviceClient: SupabaseClient,
  userId: string,
  usageDate: string,
): Promise<number> {
  const { data } = await serviceClient
    .from("usage_tracking")
    .select("embedding_count")
    .eq("user_id", userId)
    .eq("usage_date", usageDate)
    .maybeSingle();
  return data?.embedding_count ?? 0;
}

export async function incrementEmbeddingUsage(
  serviceClient: SupabaseClient,
  userId: string,
  usageDate: string,
): Promise<void> {
  const { data: existing } = await serviceClient
    .from("usage_tracking")
    .select("id, embedding_count")
    .eq("user_id", userId)
    .eq("usage_date", usageDate)
    .maybeSingle();

  if (existing?.id) {
    await serviceClient
      .from("usage_tracking")
      .update({
        embedding_count: (existing.embedding_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    return;
  }

  await serviceClient.from("usage_tracking").insert({
    user_id: userId,
    session_token: null,
    ip_address: null,
    usage_date: usageDate,
    alignment_count: 0,
    embedding_count: 1,
  });
}
