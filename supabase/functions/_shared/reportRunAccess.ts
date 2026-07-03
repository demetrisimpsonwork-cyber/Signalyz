import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { UserEntitlements } from "./entitlements.ts";
import { ensureOneTimeReportAccess } from "./entitlements.ts";
import { shouldConsumeOneTimeCredit } from "./entitlementGuard.ts";
import {
  buildReportRunFingerprint,
  type CanonicalRunContext,
  extractCanonicalRunContext,
  hasCanonicalRunContext,
} from "./reportRunFingerprint.ts";

export {
  CANONICAL_JD_MIN_LEN,
  CANONICAL_RESUME_MIN_LEN,
  extractCanonicalRunContext,
  hasCanonicalRunContext,
  type CanonicalRunContext,
} from "./reportRunFingerprint.ts";

export type ReportRunAccessErrorCode = "RUN_FINGERPRINT_MISMATCH" | "PRO_REQUIRED";

export interface ReportRunAccessSuccess {
  ok: true;
  reportRunAccess: boolean;
  fingerprint: string;
}

export interface ReportRunAccessFailure {
  ok: false;
  error_code: ReportRunAccessErrorCode;
  message: string;
}

export type ReportRunAccessResult = ReportRunAccessSuccess | ReportRunAccessFailure;

const MISMATCH_MESSAGE =
  "This request does not match your active report run. Re-run analysis with the same resume and job description.";
const PRO_REQUIRED_MESSAGE = "Signalyz Pro or an active report credit is required.";

/**
 * Resolve server-verified report run fingerprint and one-time access.
 * Client-supplied fingerprint is compared when present; never trusted alone.
 */
export async function resolveReportRunAccess(
  serviceClient: SupabaseClient,
  userId: string,
  entitlements: UserEntitlements,
  ctx: CanonicalRunContext,
  options?: { requireCanonical?: boolean },
): Promise<ReportRunAccessResult> {
  if (entitlements.isAdmin || entitlements.isProSubscriber) {
    return { ok: true, reportRunAccess: true, fingerprint: "" };
  }

  if (!hasCanonicalRunContext(ctx)) {
    if (options?.requireCanonical || shouldConsumeOneTimeCredit(entitlements)) {
      return { ok: false, error_code: "PRO_REQUIRED", message: PRO_REQUIRED_MESSAGE };
    }
    return { ok: true, reportRunAccess: false, fingerprint: "" };
  }

  const fingerprint = await buildReportRunFingerprint(
    userId,
    ctx.originalResumeText,
    ctx.jdText,
  );

  if (ctx.clientFingerprint && ctx.clientFingerprint !== fingerprint) {
    return { ok: false, error_code: "RUN_FINGERPRINT_MISMATCH", message: MISMATCH_MESSAGE };
  }

  const reportRunAccess = await ensureOneTimeReportAccess(
    serviceClient,
    userId,
    entitlements,
    fingerprint,
  );

  if (
    !reportRunAccess &&
    !entitlements.isProEntitled &&
    (options?.requireCanonical || shouldConsumeOneTimeCredit(entitlements))
  ) {
    return { ok: false, error_code: "PRO_REQUIRED", message: PRO_REQUIRED_MESSAGE };
  }

  return { ok: true, reportRunAccess, fingerprint };
}

export function reportRunAccessJsonResponse(
  failure: ReportRunAccessFailure,
  corsHeaders: Record<string, string>,
  requestId?: string,
): Response {
  return new Response(
    JSON.stringify({
      status: "error",
      error_code: failure.error_code,
      message: failure.message,
      ...(requestId ? { request_id: requestId } : {}),
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
