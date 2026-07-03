/**
 * Pure entitlement gate helpers for edge functions.
 * Auth verification stays in entitlements.ts (getUserIdFromRequest).
 */

export type EntitlementErrorCode = "AUTH_REQUIRED" | "PRO_REQUIRED";

export interface EntitlementView {
  isProEntitled: boolean;
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
  entitlements: EntitlementView,
): EntitlementErrorCode | null {
  if (!verifiedUserId) return "AUTH_REQUIRED";
  if (!entitlements.isProEntitled) return "PRO_REQUIRED";
  return null;
}

/**
 * optimize-bullet: never trust body userId for entitlement.
 * multi_bullet requires verified Pro entitlement; single_bullet allows guest with rate limits.
 */
export function evaluateOptimizeBulletAccess(input: {
  verifiedUserId: string | null;
  mode: string;
  entitlements: EntitlementView;
}): EntitlementErrorCode | null {
  const mode = input.mode || "single_bullet";
  if (mode !== "multi_bullet") return null;
  if (!input.verifiedUserId) return "AUTH_REQUIRED";
  if (!input.entitlements.isProEntitled) return "PRO_REQUIRED";
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
