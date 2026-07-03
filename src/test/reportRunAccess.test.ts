import { describe, expect, it } from "vitest";
import {
  extractCanonicalRunContext,
  hasCanonicalRunContext,
} from "../../supabase/functions/_shared/reportRunFingerprint.ts";
import { buildReportRunFingerprint } from "../../supabase/functions/_shared/reportRunFingerprint.ts";
import {
  evaluateOptimizeBulletAccess,
  evaluateProGatedAccess,
} from "../../supabase/functions/_shared/entitlementGuard.ts";
import {
  buildReportRunInvokeFields,
  isActiveReportRunForInputs,
  rememberActiveReportRun,
  withReportRunFields,
} from "@/lib/reportRunSession";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RESUME =
  "Demetri Johnson\nCustomer Service Representative\nNew Jersey Department of Labor\nManaged customer escalation calls regarding unemployment claims.";
const JD =
  "Tax season support role requiring customer care, software navigation, and empathetic problem solving.";
const OTHER_JD = "Senior software engineer with distributed systems and React experience.";

describe("canonical report run fingerprint", () => {
  it("same original resume + same JD produces same fingerprint across function body shapes", async () => {
    const directorCtx = extractCanonicalRunContext({
      experience: RESUME,
      jd: "compacted-jd-should-not-be-used",
      originalResumeText: RESUME,
      jdText: JD,
    });
    const assembleCtx = extractCanonicalRunContext({
      originalResume: RESUME,
      jd: JD,
      originalResumeText: RESUME,
      jdText: JD,
    });
    const proCtx = extractCanonicalRunContext({
      experience: RESUME,
      jd: JD,
      originalResumeText: RESUME,
      jdText: JD,
      type: "cover_letter",
    });
    const summaryCtx = extractCanonicalRunContext({
      roles: [{ company: "X", title: "Y", bullets: ["different serialized shape"] }],
      originalResumeText: RESUME,
      jdText: JD,
    });

    const fingerprints = await Promise.all([
      buildReportRunFingerprint(USER, directorCtx.originalResumeText, directorCtx.jdText),
      buildReportRunFingerprint(USER, assembleCtx.originalResumeText, assembleCtx.jdText),
      buildReportRunFingerprint(USER, proCtx.originalResumeText, proCtx.jdText),
      buildReportRunFingerprint(USER, summaryCtx.originalResumeText, summaryCtx.jdText),
    ]);

    expect(new Set(fingerprints).size).toBe(1);
  });

  it("prefers explicit canonical fields over generated output shapes", () => {
    const ctx = extractCanonicalRunContext({
      originalResumeText: RESUME,
      jdText: JD,
      experience: "generated cover letter body",
      roles: [{ bullets: ["serialized-only-shape"] }],
      bullet: "single bullet only",
    });
    expect(ctx.originalResumeText).toBe(RESUME);
    expect(ctx.jdText).toBe(JD);
  });

  it("different JD produces different fingerprint", async () => {
    const a = await buildReportRunFingerprint(USER, RESUME, JD);
    const b = await buildReportRunFingerprint(USER, RESUME, OTHER_JD);
    expect(a).not.toBe(b);
  });

  it("different resume produces different fingerprint", async () => {
    const a = await buildReportRunFingerprint(USER, RESUME, JD);
    const b = await buildReportRunFingerprint(USER, RESUME.replace("Demetri", "Jane"), JD);
    expect(a).not.toBe(b);
  });
});

describe("report run access verification", () => {
  it("client-supplied fingerprint alone cannot unlock without canonical resume/JD", () => {
    const ctx = extractCanonicalRunContext({
      reportRunFingerprint: "deadbeef".repeat(8),
    });
    expect(hasCanonicalRunContext(ctx)).toBe(false);
    expect(
      evaluateProGatedAccess(USER, { isProEntitled: false }, { reportRunAccess: false }),
    ).toBe("PRO_REQUIRED");
  });

  it("mismatching client fingerprint is detectable before redemption", async () => {
    const canonical = await buildReportRunFingerprint(USER, RESUME, JD);
    const wrongClient = "0".repeat(64);
    expect(wrongClient).not.toBe(canonical);
  });

  it("withReportRunFields attaches canonical fields for edge invokes", async () => {
    const fields = await buildReportRunInvokeFields(USER, RESUME, JD);
    const body = withReportRunFields({ type: "cover_letter", experience: RESUME, jd: JD }, fields);
    expect(body.originalResumeText).toBe(RESUME);
    expect(body.jdText).toBe(JD);
    expect(body.reportRunFingerprint).toBeTruthy();
  });
});

describe("optimize-bullet multi_bullet policy", () => {
  it("one-time multi_bullet requires canonical context on the server", () => {
    const ctx = extractCanonicalRunContext({ bullet: "short", jd: "short" });
    expect(hasCanonicalRunContext(ctx)).toBe(false);
    expect(
      evaluateOptimizeBulletAccess({
        verifiedUserId: USER,
        mode: "multi_bullet",
        entitlements: { isProEntitled: true, entitlementSource: "one_time_credit" },
        reportRunAccess: false,
      }),
    ).toBeNull();
  });

  it("subscription multi_bullet remains unchanged without report run access", () => {
    expect(
      evaluateOptimizeBulletAccess({
        verifiedUserId: USER,
        mode: "multi_bullet",
        entitlements: { isProEntitled: true, isProSubscriber: true, entitlementSource: "subscription" },
      }),
    ).toBeNull();
  });
});

describe("active redeemed run UI session", () => {
  it("remembers active run and treats current inputs as entitled mid-run", async () => {
    sessionStorage.clear();
    const fields = await buildReportRunInvokeFields(USER, RESUME, JD);
    rememberActiveReportRun(USER, fields!.reportRunFingerprint!);
    await expect(isActiveReportRunForInputs(USER, RESUME, JD)).resolves.toBe(true);
    await expect(isActiveReportRunForInputs(USER, RESUME, OTHER_JD)).resolves.toBe(false);
    sessionStorage.clear();
  });

  it("active redeemed run grants Pro gate without unused credit flag", () => {
    expect(
      evaluateProGatedAccess(USER, { isProEntitled: false }, { reportRunAccess: true }),
    ).toBeNull();
  });
});

describe("subscription and admin behavior unchanged", () => {
  it("Pro subscriber passes without report run access", () => {
    expect(
      evaluateProGatedAccess(USER, { isProEntitled: true, isProSubscriber: true }, { reportRunAccess: false }),
    ).toBeNull();
  });

  it("free users without credit remain blocked", () => {
    expect(evaluateProGatedAccess(USER, { isProEntitled: false })).toBe("PRO_REQUIRED");
    expect(
      evaluateOptimizeBulletAccess({
        verifiedUserId: USER,
        mode: "multi_bullet",
        entitlements: { isProEntitled: false },
      }),
    ).toBe("PRO_REQUIRED");
  });
});
