import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderHook, waitFor } from "@testing-library/react";
import {
  computeEffectiveReportAccess,
  useReportRunAccess,
} from "@/hooks/useReportRunAccess";
import {
  buildReportRunInvokeFields,
  hasRedeemedReportRunForFingerprint,
} from "@/lib/reportRunSession";
import { NJDOL_RESUME_TEXT } from "@/test/fixtures/rag/njdolResume";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const APTASENTRY_JD = `
Company: Aptasentry (hr@aptasentry.ai)
Employment Type: Full-time internship
Location: Remote
About the Role
Aptasentry is seeking an AI/ML Engineer to design, build, and deploy intelligent automation systems that strengthen go-to-market operations.
Responsibilities
Build AI-powered workflows to automate GTM processes across sales, marketing, and customer success.
Develop systems for lead enrichment, scoring, segmentation, intent analysis, and account prioritization.
Requirements
Strong proficiency in Python. Experience with LLMs, prompt engineering, RAG, embeddings, and vector databases.
`.trim();
const OTHER_JD = "Senior software engineer with distributed systems and React experience.";

const maybeSingle = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle })),
      })),
    })),
  },
}));

describe("hasRedeemedReportRunForFingerprint", () => {
  beforeEach(() => {
    maybeSingle.mockReset();
  });

  it("returns true when a redemption row exists for the fingerprint", async () => {
    maybeSingle.mockResolvedValue({ data: { id: "redemption-1" }, error: null });
    await expect(hasRedeemedReportRunForFingerprint("a".repeat(64))).resolves.toBe(true);
    expect(maybeSingle).toHaveBeenCalled();
  });

  it("returns false when no redemption row exists", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(hasRedeemedReportRunForFingerprint("b".repeat(64))).resolves.toBe(false);
  });

  it("returns false for empty fingerprint without querying", async () => {
    await expect(hasRedeemedReportRunForFingerprint("")).resolves.toBe(false);
    expect(maybeSingle).not.toHaveBeenCalled();
  });

  it("returns false when the query errors", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: "network" } });
    await expect(hasRedeemedReportRunForFingerprint("c".repeat(64))).resolves.toBe(false);
  });
});

describe("computeEffectiveReportAccess", () => {
  const base = {
    isPro: false,
    isAdmin: false,
    hasOneTimeCredit: false,
    activeRunMatch: false,
    hasRedeemedCurrentRun: false,
  };

  it("subscription unlocks access", () => {
    expect(computeEffectiveReportAccess({ ...base, isPro: true })).toBe(true);
  });

  it("unused one-time credit unlocks access", () => {
    expect(computeEffectiveReportAccess({ ...base, hasOneTimeCredit: true })).toBe(true);
  });

  it("active sessionStorage match unlocks access", () => {
    expect(computeEffectiveReportAccess({ ...base, activeRunMatch: true })).toBe(true);
  });

  it("persisted redemption unlocks access after sessionStorage expires", () => {
    expect(computeEffectiveReportAccess({ ...base, hasRedeemedCurrentRun: true })).toBe(true);
  });

  it("free user without credit or redemption remains gated", () => {
    expect(computeEffectiveReportAccess(base)).toBe(false);
  });

  it("new fingerprint without redemption remains gated", () => {
    expect(
      computeEffectiveReportAccess({
        ...base,
        activeRunMatch: false,
        hasRedeemedCurrentRun: false,
      }),
    ).toBe(false);
  });
});

describe("useReportRunAccess redemption lookup", () => {
  beforeEach(() => {
    sessionStorage.clear();
    maybeSingle.mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("detects persisted redemption when sessionStorage is empty", async () => {
    maybeSingle.mockResolvedValue({ data: { id: "redemption-1" }, error: null });

    const { result } = renderHook(() =>
      useReportRunAccess(USER, NJDOL_RESUME_TEXT, APTASENTRY_JD),
    );

    await waitFor(() => {
      expect(result.current.accessLookupPending).toBe(false);
    });

    expect(result.current.activeRunMatch).toBe(false);
    expect(result.current.hasRedeemedCurrentRun).toBe(true);
    expect(computeEffectiveReportAccess({
      isPro: false,
      isAdmin: false,
      hasOneTimeCredit: false,
      activeRunMatch: result.current.activeRunMatch,
      hasRedeemedCurrentRun: result.current.hasRedeemedCurrentRun,
    })).toBe(true);
  });

  it("detects persisted redemption when sessionStorage entry is expired", async () => {
    const fields = await buildReportRunInvokeFields(USER, NJDOL_RESUME_TEXT, APTASENTRY_JD);
    sessionStorage.setItem(
      "signalyz_active_report_run_v1",
      JSON.stringify({
        fingerprint: fields!.reportRunFingerprint,
        userId: USER,
        expiresAt: Date.now() - 1_000,
      }),
    );
    maybeSingle.mockResolvedValue({ data: { id: "redemption-1" }, error: null });

    const { result } = renderHook(() =>
      useReportRunAccess(USER, NJDOL_RESUME_TEXT, APTASENTRY_JD),
    );

    await waitFor(() => {
      expect(result.current.hasRedeemedCurrentRun).toBe(true);
    });
    expect(result.current.activeRunMatch).toBe(false);
  });

  it("keeps new JD gated when no redemption exists", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() =>
      useReportRunAccess(USER, NJDOL_RESUME_TEXT, OTHER_JD),
    );

    await waitFor(() => {
      expect(result.current.accessLookupPending).toBe(false);
    });

    expect(result.current.hasRedeemedCurrentRun).toBe(false);
    expect(computeEffectiveReportAccess({
      isPro: false,
      isAdmin: false,
      hasOneTimeCredit: false,
      activeRunMatch: false,
      hasRedeemedCurrentRun: result.current.hasRedeemedCurrentRun,
    })).toBe(false);
  });

  it("skips redemption query when sessionStorage already matches", async () => {
    const fields = await buildReportRunInvokeFields(USER, NJDOL_RESUME_TEXT, APTASENTRY_JD);
    sessionStorage.setItem(
      "signalyz_active_report_run_v1",
      JSON.stringify({
        fingerprint: fields!.reportRunFingerprint,
        userId: USER,
        expiresAt: Date.now() + 60_000,
      }),
    );

    const { result } = renderHook(() =>
      useReportRunAccess(USER, NJDOL_RESUME_TEXT, APTASENTRY_JD),
    );

    await waitFor(() => {
      expect(result.current.activeRunMatch).toBe(true);
    });

    expect(result.current.hasRedeemedCurrentRun).toBe(false);
    expect(maybeSingle).not.toHaveBeenCalled();
  });
});

describe("history remains subscription-only", () => {
  it("History page does not use return-visit redemption lookup", () => {
    const historySrc = readFileSync(join(process.cwd(), "src/pages/History.tsx"), "utf8");
    expect(historySrc).toMatch(/const \{ isPro/);
    expect(historySrc).not.toMatch(/hasRedeemedCurrentRun/);
    expect(historySrc).not.toMatch(/hasRedeemedReportRunForFingerprint/);
  });
});

describe("no stripe edge or repair changes", () => {
  it("create-checkout price IDs remain unchanged", () => {
    const checkoutSrc = readFileSync(
      join(process.cwd(), "supabase/functions/create-checkout/index.ts"),
      "utf8",
    );
    expect(checkoutSrc).toContain("price_1TAy60IDMeVzaL9pMv2FUbvl");
    expect(checkoutSrc).toContain("STRIPE_PINNACLE_PRICE_ID");
  });
});
