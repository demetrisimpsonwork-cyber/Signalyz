import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  evaluateGuestAlignmentSession,
  evaluateOptimizeBulletAccess,
  evaluateProGatedAccess,
  shouldConsumeOneTimeCredit,
  validateRpcCallerScope,
} from "../../supabase/functions/_shared/entitlementGuard.ts";
import { sanitizeHiringReportErrorDetails } from "@/lib/hiringReportErrors";

const migrationSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260703130000_p1_security_hardening.sql"),
  "utf8",
);

describe("P1 security — one-time credits", () => {
  it("shouldConsumeOneTimeCredit is true only for unused credit entitlement", () => {
    expect(
      shouldConsumeOneTimeCredit({
        isProEntitled: true,
        entitlementSource: "one_time_credit",
      }),
    ).toBe(true);
    expect(
      shouldConsumeOneTimeCredit({
        isProEntitled: true,
        isProSubscriber: true,
        entitlementSource: "subscription",
      }),
    ).toBe(false);
    expect(shouldConsumeOneTimeCredit({ isProEntitled: false })).toBe(false);
  });
});

describe("P1 security — migration RPC contracts", () => {
  it("legacy consume_one_time_credit(p_user_id) wrapper exists temporarily", () => {
    expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.consume_one_time_credit\(p_user_id uuid\)/);
  });

  it("legacy increment_run_count(p_user_id) wrapper exists temporarily", () => {
    expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.increment_run_count\(p_user_id uuid\)/);
  });

  it("service-role RPCs are not granted to authenticated users in base migration", () => {
    expect(migrationSql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.redeem_one_time_credit_for_run\(uuid, text\) TO service_role/,
    );
    expect(migrationSql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.consume_one_time_credit_for_user\(uuid\) TO service_role/,
    );
    expect(migrationSql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.redeem_one_time_credit_for_run\(uuid, text\) TO authenticated/,
    );
  });
});

describe("P1 security — RPC caller scope", () => {
  it("user cannot target another user's id in caller scope check", () => {
    const attacker = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const victim = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    expect(validateRpcCallerScope(attacker, victim)).toBe(false);
  });

  it("unauthenticated caller scope fails", () => {
    expect(validateRpcCallerScope(null, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")).toBe(false);
  });
});

describe("P1 security — guest limits", () => {
  const uuid = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const isValid = (t: unknown): t is string =>
    typeof t === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t);

  it("rotating sessionToken without valid UUID is rejected for guest alignment", () => {
    expect(evaluateGuestAlignmentSession(null, "not-a-uuid", isValid)).toBe("AUTH_REQUIRED");
    expect(evaluateGuestAlignmentSession(null, "", isValid)).toBe("AUTH_REQUIRED");
  });

  it("guest single_bullet remains available with valid session token", () => {
    expect(
      evaluateOptimizeBulletAccess({
        verifiedUserId: null,
        mode: "single_bullet",
        entitlements: { isProEntitled: false },
      }),
    ).toBeNull();
    expect(evaluateGuestAlignmentSession(null, uuid, isValid)).toBeNull();
  });

  it("guest multi_bullet remains blocked", () => {
    expect(
      evaluateOptimizeBulletAccess({
        verifiedUserId: null,
        mode: "multi_bullet",
        entitlements: { isProEntitled: true },
      }),
    ).toBe("AUTH_REQUIRED");
  });
});

describe("P1 security — edge exposure", () => {
  it("director-calibration error sanitizer strips error_stack from client details", () => {
    const sanitized = sanitizeHiringReportErrorDetails({
      error_message: "timeout",
      error_stack: "Error: timeout\n    at runPipeline (index.ts:1:1)",
    });
    expect(sanitized).not.toHaveProperty("error_stack");
  });

  it("Pro gate still requires verified JWT", () => {
    expect(evaluateProGatedAccess(null, { isProEntitled: true })).toBe("AUTH_REQUIRED");
  });
});

describe("P1 security — entitlement gate regression", () => {
  it("CS resume path: unsupported technical rewrite gate still requires Pro for multi_bullet", () => {
    expect(
      evaluateOptimizeBulletAccess({
        verifiedUserId: "user-free",
        mode: "multi_bullet",
        entitlements: { isProEntitled: false },
      }),
    ).toBe("PRO_REQUIRED");
  });
});
