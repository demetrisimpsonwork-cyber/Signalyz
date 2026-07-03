import { describe, expect, it } from "vitest";
import {
  buildReportRunFingerprint,
  buildReportRunFingerprintInput,
  createReportRedemptionSimulator,
  normalizeReportRunText,
  simulateRedeemOneTimeReport,
} from "../../supabase/functions/_shared/reportRunFingerprint.ts";
import {
  evaluateOptimizeBulletAccess,
  evaluateProGatedAccess,
  validateRpcCallerScope,
} from "../../supabase/functions/_shared/entitlementGuard.ts";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RESUME = "Led cross-functional teams to deliver SaaS platform migrations.";
const JD = "Senior operations manager with vendor management and KPI ownership.";
const OTHER_JD = "Software engineer with React and distributed systems experience.";

describe("report run fingerprint", () => {
  it("normalizes whitespace and case for stable fingerprints", async () => {
    const a = await buildReportRunFingerprint(USER, RESUME, JD);
    const b = await buildReportRunFingerprint(USER, `  ${RESUME.toUpperCase()}  `, `\n${JD}\n`);
    expect(a).toBe(b);
  });

  it("different resume/JD pairs produce different fingerprints", async () => {
    const runA = await buildReportRunFingerprint(USER, RESUME, JD);
    const runB = await buildReportRunFingerprint(USER, RESUME, OTHER_JD);
    expect(runA).not.toBe(runB);
  });

  it("includes user id in fingerprint input", () => {
    const input = buildReportRunFingerprintInput(USER, RESUME, JD);
    expect(input.startsWith(`${USER}|`)).toBe(true);
    expect(normalizeReportRunText(RESUME)).toBeTruthy();
  });
});

describe("one-time full-report redemption semantics", () => {
  it("one credit does not unlock unlimited different runs", () => {
    const store = createReportRedemptionSimulator(1);
    const runA = "fingerprint-run-a";
    const runB = "fingerprint-run-b";

    expect(simulateRedeemOneTimeReport(store, USER, runA)).toEqual({
      allowed: true,
      consumedCredit: true,
    });
    expect(simulateRedeemOneTimeReport(store, USER, runB)).toEqual({
      allowed: false,
      consumedCredit: false,
    });
    expect(store.unusedCredits).toBe(0);
  });

  it("one credit unlocks multiple outputs for the same redeemed run", () => {
    const store = createReportRedemptionSimulator(1);
    const runA = "fingerprint-run-a";

    expect(simulateRedeemOneTimeReport(store, USER, runA).consumedCredit).toBe(true);
    expect(simulateRedeemOneTimeReport(store, USER, runA)).toEqual({
      allowed: true,
      consumedCredit: false,
    });
    expect(simulateRedeemOneTimeReport(store, USER, runA)).toEqual({
      allowed: true,
      consumedCredit: false,
    });
    expect(store.unusedCredits).toBe(0);
  });

  it("parallel first calls do not consume the same credit twice", () => {
    const store = createReportRedemptionSimulator(1);
    const runA = "fingerprint-run-a";

    const first = simulateRedeemOneTimeReport(store, USER, runA);
    const parallelSameRun = simulateRedeemOneTimeReport(store, USER, runA);
    const parallelOtherRun = simulateRedeemOneTimeReport(store, USER, "fingerprint-run-b");

    expect(first.consumedCredit).toBe(true);
    expect(parallelSameRun).toEqual({ allowed: true, consumedCredit: false });
    expect(parallelOtherRun).toEqual({ allowed: false, consumedCredit: false });
    expect(store.unusedCredits).toBe(0);
  });

  it("credits cannot go negative", () => {
    const store = createReportRedemptionSimulator(0);
    expect(simulateRedeemOneTimeReport(store, USER, "run-a")).toEqual({
      allowed: false,
      consumedCredit: false,
    });
    expect(store.unusedCredits).toBe(0);
  });
});

describe("entitlement gates with report-run access", () => {
  it("reportRunAccess allows Pro outputs after credit is consumed for the same run", () => {
    expect(
      evaluateProGatedAccess(USER, { isProEntitled: false }, { reportRunAccess: true }),
    ).toBeNull();
    expect(
      evaluateProGatedAccess(USER, { isProEntitled: false }, { reportRunAccess: false }),
    ).toBe("PRO_REQUIRED");
  });

  it("frontend credit state is ignored — server redemption grants access without isProEntitled", () => {
    expect(
      evaluateOptimizeBulletAccess({
        verifiedUserId: USER,
        mode: "multi_bullet",
        entitlements: { isProEntitled: false },
        reportRunAccess: true,
      }),
    ).toBeNull();
    expect(
      evaluateOptimizeBulletAccess({
        verifiedUserId: USER,
        mode: "multi_bullet",
        entitlements: { isProEntitled: false },
        reportRunAccess: false,
      }),
    ).toBe("PRO_REQUIRED");
  });
});

describe("RPC compatibility wrappers (caller scope)", () => {
  const victim = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  it("legacy consume_one_time_credit(p_user_id) succeeds only for auth.uid()", () => {
    expect(validateRpcCallerScope(USER, USER)).toBe(true);
  });

  it("legacy consume_one_time_credit(p_user_id) rejects another user's id", () => {
    expect(validateRpcCallerScope(USER, victim)).toBe(false);
  });

  it("legacy increment_run_count(p_user_id) succeeds only for auth.uid()", () => {
    expect(validateRpcCallerScope(USER, USER)).toBe(true);
  });

  it("legacy increment_run_count(p_user_id) rejects another user's id", () => {
    expect(validateRpcCallerScope(USER, victim)).toBe(false);
  });

  it("unauthenticated RPC calls fail caller scope validation", () => {
    expect(validateRpcCallerScope(null, USER)).toBe(false);
    expect(validateRpcCallerScope(null, victim)).toBe(false);
  });
});
