/**
 * Pure entitlement gate helpers for edge functions.
 * Auth verification stays in entitlements.ts (getUserIdFromRequest).
 */

export type EntitlementErrorCode = "AUTH_REQUIRED" | "PRO_REQUIRED";

export type EntitlementSource = "subscription" | "admin" | "one_time_credit" | "free";

export interface EntitlementView {
  isProEntitled: boolean;
}

export interface EntitlementViewExtended extends EntitlementView {
  isAdmin?: boolean;
  isProSubscriber?: boolean;
  entitlementSource?: EntitlementSource;
}

export function shouldConsumeOneTimeCredit(entitlements: EntitlementViewExtended): boolean {
  return (
    entitlements.isProEntitled &&
    !entitlements.isAdmin &&
    !entitlements.isProSubscriber &&
    entitlements.entitlementSource === "one_time_credit"
  );
}

export function validateRpcCallerScope(callerUserId: string | null, targetUserId: string): boolean {
  return callerUserId !== null && callerUserId === targetUserId;
}

export interface EntitlementErrorBody {
  status: "error";
  error: EntitlementErrorCode;
  error_code: EntitlementErrorCode;
  message: string;
  request_id?: string;
}

const ENTITLEMENT_MESSAGES: Record<EntitlementErrorCode, string> = {
  AUTH_REQUIRED: "Sign in required.",
  PRO_REQUIRED: "Signalyz Pro or an active report credit is required.",
};

export function buildEntitlementErrorBody(
  code: EntitlementErrorCode,
  requestId?: string,
): EntitlementErrorBody {
  return {
    status: "error",
    error: code,
    error_code: code,
    message: ENTITLEMENT_MESSAGES[code],
    ...(requestId ? { request_id: requestId } : {}),
  };
}

export function entitlementJsonResponse(
  code: EntitlementErrorCode,
  corsHeaders: Record<string, string>,
  requestId?: string,
  status = 200,
): Response {
  return new Response(JSON.stringify(buildEntitlementErrorBody(code, requestId)), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Pro-gated outputs (cover letter, assembly, resume summary, etc.). */
export function evaluateProGatedAccess(
  verifiedUserId: string | null,
  entitlements: EntitlementViewExtended,
  options?: { reportRunAccess?: boolean },
): EntitlementErrorCode | null {
  if (!verifiedUserId) return "AUTH_REQUIRED";
  const proAllowed =
    entitlements.isProEntitled ||
    entitlements.isProSubscriber ||
    entitlements.isAdmin ||
    options?.reportRunAccess === true;
  if (!proAllowed) return "PRO_REQUIRED";
  return null;
}

/**
 * optimize-bullet: never trust body userId for entitlement.
 * multi_bullet requires verified Pro entitlement or an active report-run redemption.
 */
export function evaluateOptimizeBulletAccess(input: {
  verifiedUserId: string | null;
  mode: string;
  entitlements: EntitlementViewExtended;
  reportRunAccess?: boolean;
}): EntitlementErrorCode | null {
  const mode = input.mode || "single_bullet";
  if (mode !== "multi_bullet") return null;
  if (!input.verifiedUserId) return "AUTH_REQUIRED";
  const proAllowed =
    input.entitlements.isProEntitled ||
    input.entitlements.isProSubscriber ||
    input.entitlements.isAdmin ||
    input.reportRunAccess === true;
  if (!proAllowed) return "PRO_REQUIRED";
  return null;
}

export function buildAlignmentUsageIdentity(
  verifiedUserId: string | null,
  sessionToken: unknown,
  isValidSessionToken: (token: unknown) => token is string,
): { userId: string | null; sessionToken: string | null } {
  if (verifiedUserId) {
    return { userId: verifiedUserId, sessionToken: null };
  }
  return {
    userId: null,
    sessionToken: isValidSessionToken(sessionToken) ? sessionToken : null,
  };
}

/** Returns true when the handler should proceed to expensive AI work. */
export function shouldProceedToAnthropic(gate: EntitlementErrorCode | null): boolean {
  return gate === null;
}

/** Guest free alignment requires a stable session token — not body userId. */
export function evaluateGuestAlignmentSession(
  verifiedUserId: string | null,
  sessionToken: unknown,
  isValidSessionToken: (token: unknown) => token is string,
): EntitlementErrorCode | null {
  if (verifiedUserId) return null;
  if (isValidSessionToken(sessionToken)) return null;
  return "AUTH_REQUIRED";
}
