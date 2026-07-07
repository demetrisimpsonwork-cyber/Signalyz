import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useReportRunAccess } from "@/hooks/useReportRunAccess";
import {
  buildReportRunInvokeFields,
  isActiveReportRunForInputs,
  rememberActiveReportRun,
  safeTrimText,
  withReportRunFields,
} from "@/lib/reportRunSession";
import { NJDOL_RESUME_TEXT } from "@/test/fixtures/rag/njdolResume";

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

describe("safeTrimText", () => {
  it("coerces null, undefined, and numbers without throwing", () => {
    expect(safeTrimText(null)).toBe("");
    expect(safeTrimText(undefined)).toBe("");
    expect(safeTrimText(42)).toBe("42");
    expect(safeTrimText("  hello  ")).toBe("hello");
  });
});

describe("reportRunSession storage hardening", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("ignores malformed JSON in active report run storage", async () => {
    sessionStorage.setItem("signalyz_active_report_run_v1", "{not-json");
    await expect(isActiveReportRunForInputs(USER, NJDOL_RESUME_TEXT, APTASENTRY_JD)).resolves.toBe(false);
  });

  it("ignores expired active report run entries", async () => {
    const fields = await buildReportRunInvokeFields(USER, NJDOL_RESUME_TEXT, APTASENTRY_JD);
    expect(fields?.reportRunFingerprint).toBeTruthy();
    sessionStorage.setItem(
      "signalyz_active_report_run_v1",
      JSON.stringify({
        fingerprint: fields!.reportRunFingerprint,
        userId: USER,
        expiresAt: Date.now() - 1_000,
      }),
    );
    await expect(isActiveReportRunForInputs(USER, NJDOL_RESUME_TEXT, APTASENTRY_JD)).resolves.toBe(false);
  });

  it("ignores malformed stored payload shapes", async () => {
    sessionStorage.setItem(
      "signalyz_active_report_run_v1",
      JSON.stringify({ fingerprint: 123, userId: null, expiresAt: "soon" }),
    );
    await expect(isActiveReportRunForInputs(USER, NJDOL_RESUME_TEXT, APTASENTRY_JD)).resolves.toBe(false);
  });

  it("returns null invoke fields when resume or JD is missing", async () => {
    await expect(buildReportRunInvokeFields(USER, null, APTASENTRY_JD)).resolves.toBeNull();
    await expect(buildReportRunInvokeFields(USER, NJDOL_RESUME_TEXT, undefined)).resolves.toBeNull();
  });

  it("withReportRunFields tolerates partial or absent fields", () => {
    const body = { type: "cover_letter" };
    expect(withReportRunFields(body, null)).toBe(body);
    expect(withReportRunFields(body, undefined)).toBe(body);
    expect(withReportRunFields(body, { originalResumeText: "", jdText: APTASENTRY_JD })).toBe(body);
    expect(
      withReportRunFields(body, {
        originalResumeText: NJDOL_RESUME_TEXT,
        jdText: APTASENTRY_JD,
      }).originalResumeText,
    ).toBe(NJDOL_RESUME_TEXT);
  });

  it("builds invoke fields for operations resume + Aptasentry JD", async () => {
    const fields = await buildReportRunInvokeFields(USER, NJDOL_RESUME_TEXT, APTASENTRY_JD);
    expect(fields?.originalResumeText).toBe(NJDOL_RESUME_TEXT);
    expect(fields?.jdText).toBe(APTASENTRY_JD);
    expect(fields?.reportRunFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rememberActiveReportRun survives storage write failures", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    expect(() => rememberActiveReportRun(USER, "a".repeat(64))).not.toThrow();
  });
});

describe("useReportRunAccess", () => {
  beforeEach(() => {
    sessionStorage.clear();
    maybeSingle.mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("does not throw when sessionStorage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("SecurityError");
    });

    const { result } = renderHook(() =>
      useReportRunAccess(USER, NJDOL_RESUME_TEXT, APTASENTRY_JD),
    );

    await waitFor(() => {
      expect(result.current.reportRunFields).toBeNull();
      expect(result.current.activeRunMatch).toBe(false);
    });
  });

  it("accepts non-string resume/JD inputs without throwing", async () => {
    const { result } = renderHook(() =>
      useReportRunAccess(USER, { bad: "shape" } as unknown as string, APTASENTRY_JD),
    );

    await waitFor(() => {
      expect(result.current.reportRunFields).toBeNull();
      expect(result.current.activeRunMatch).toBe(false);
    });
  });

  it("resolves report run fields for valid signed-in inputs", async () => {
    const { result } = renderHook(() =>
      useReportRunAccess(USER, NJDOL_RESUME_TEXT, APTASENTRY_JD),
    );

    await waitFor(() => {
      expect(result.current.reportRunFields?.reportRunFingerprint).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
