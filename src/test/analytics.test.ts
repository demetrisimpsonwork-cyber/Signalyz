import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sanitizeEventMetadata,
  scoreBucket,
  ga4ScoreBucket,
  trackEvent,
  trackExportEvents,
  trackReliabilityError,
  trackAnalysisStarted,
  trackAnalysisCompleted,
  trackFinalApplyCheckClicked,
  trackActiveJobSearchClicked,
  trackCheckoutSuccess,
} from "@/lib/analytics";
import {
  bucketReferrer,
  durationBucket,
  ga4ScoreBucket as helperGa4ScoreBucket,
  safeErrorCode,
} from "@/lib/analyticsHelpers";
import { sendGa4Event } from "@/lib/ga4";

vi.mock("@/lib/ga4", () => ({
  sendGa4Event: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    from: vi.fn(),
  },
}));

describe("analytics — metadata safety", () => {
  it("strips raw resume/JD-like metadata keys", () => {
    const safe = sanitizeEventMetadata({
      output_type: "calibrated_resume",
      format: "pdf",
      resume_text: "SECRET RESUME CONTENT",
      jd_text: "SECRET JD",
      bullet: "should not pass",
      experience: "long experience block",
      body: "full letter body",
      text: "raw text payload",
      plan_tier: "pro",
    });
    expect(safe.output_type).toBe("calibrated_resume");
    expect(safe.plan_tier).toBe("pro");
    expect(safe).not.toHaveProperty("resume_text");
    expect(safe).not.toHaveProperty("jd_text");
    expect(safe).not.toHaveProperty("bullet");
    expect(safe).not.toHaveProperty("experience");
    expect(safe).not.toHaveProperty("body");
    expect(safe).not.toHaveProperty("text");
  });

  it("blocks keys containing unsafe substrings", () => {
    const safe = sanitizeEventMetadata({
      original_resume_hash: "abc",
      full_letter_preview: "secret",
      output_type: "cover_letter",
    });
    expect(safe.output_type).toBe("cover_letter");
    expect(safe).not.toHaveProperty("original_resume_hash");
    expect(safe).not.toHaveProperty("full_letter_preview");
  });

  it("drops overly long string values", () => {
    const safe = sanitizeEventMetadata({
      target_role: "Customer Specialist",
      cta_label: "x".repeat(200),
    });
    expect(safe.target_role).toBe("Customer Specialist");
    expect(safe).not.toHaveProperty("cta_label");
  });

  it("sanitizes error_code values", () => {
    const safe = sanitizeEventMetadata({
      error_code: "Error: stack trace at foo\nbar",
    });
    expect(safe.error_code).toBe("SANITIZED_ERROR");
  });
});

describe("analytics — score buckets", () => {
  it("maps legacy qualitative buckets", () => {
    expect(scoreBucket(82)).toBe("strong");
    expect(scoreBucket(70)).toBe("moderate");
    expect(scoreBucket(55)).toBe("developing");
    expect(scoreBucket(40)).toBe("weak");
  });

  it("maps GA4 numeric score bands", () => {
    expect(ga4ScoreBucket(90)).toBe("85_plus");
    expect(ga4ScoreBucket(75)).toBe("70_84");
    expect(ga4ScoreBucket(60)).toBe("50_69");
    expect(ga4ScoreBucket(40)).toBe("30_49");
    expect(ga4ScoreBucket(10)).toBe("0_29");
    expect(helperGa4ScoreBucket(90)).toBe("85_plus");
  });
});

describe("analytics — referrer bucketing", () => {
  it("buckets known referrers safely", () => {
    expect(bucketReferrer("")).toBe("direct");
    expect(bucketReferrer("https://www.reddit.com/r/jobs")).toBe("reddit");
    expect(bucketReferrer("https://www.linkedin.com/feed/")).toBe("linkedin");
    expect(bucketReferrer("https://www.google.com/search?q=signalyz")).toBe("google");
    expect(bucketReferrer("https://chatgpt.com/")).toBe("chatgpt");
    expect(bucketReferrer("https://news.ycombinator.com/")).toBe("other");
  });
});

describe("analytics — duration buckets", () => {
  it("maps elapsed seconds to buckets", () => {
    expect(durationBucket(5)).toBe("under_15s");
    expect(durationBucket(20)).toBe("15_30s");
    expect(durationBucket(45)).toBe("30_60s");
    expect(durationBucket(90)).toBe("60_120s");
    expect(durationBucket(200)).toBe("over_120s");
  });
});

describe("analytics — trackEvent", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.mocked(sendGa4Event).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("forwards safe export events to GA4", () => {
    trackEvent("pdf_export_clicked", {
      output_type: "calibrated_resume",
      format: "pdf",
      source_tab: "calibrated",
    });
    expect(sendGa4Event).toHaveBeenCalledWith(
      "pdf_export_clicked",
      expect.objectContaining({
        event: "pdf_export_clicked",
        output_type: "calibrated_resume",
        format: "pdf",
      }),
    );
  });

  it("trackExportEvents fires legacy and granular events with export_format", () => {
    trackExportEvents({
      legacyEvent: "pdf_export_clicked",
      specificEvent: "cover_letter_pdf_export_clicked",
      output_type: "cover_letter",
      format: "pdf",
      source_tab: "coverletter",
    });
    expect(sendGa4Event).toHaveBeenCalledWith(
      "cover_letter_pdf_export_clicked",
      expect.objectContaining({
        output_type: "cover_letter",
        export_format: "pdf",
        format: "pdf",
      }),
    );
  });

  it("trackExportEvents fires resume_downloaded for calibrated resume exports", () => {
    trackExportEvents({
      legacyEvent: "pdf_export_clicked",
      specificEvent: "calibrated_resume_pdf_export_clicked",
      output_type: "calibrated_resume",
      format: "pdf",
      source_tab: "calibrated",
    });
    expect(sendGa4Event).toHaveBeenCalledWith(
      "resume_downloaded",
      expect.objectContaining({
        output_type: "calibrated_resume",
        export_format: "pdf",
      }),
    );
    expect(sendGa4Event).toHaveBeenCalledWith(
      "export_completed",
      expect.objectContaining({
        output_type: "calibrated_resume",
        export_format: "pdf",
      }),
    );
  });

  it("paywall events include feature metadata without raw content", () => {
    trackEvent("paywall_viewed", {
      feature_name: "cover_letter",
      output_type: "cover_letter",
      resume_text: "SHOULD NOT SEND",
      plan_tier: "free",
    });
    expect(sendGa4Event).toHaveBeenCalledWith(
      "paywall_viewed",
      expect.objectContaining({
        feature_name: "cover_letter",
        output_type: "cover_letter",
        plan_tier: "free",
      }),
    );
    const payload = vi.mocked(sendGa4Event).mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("resume_text");
  });

  it("does not crash when gtag is unavailable", () => {
    expect(() => sendGa4Event("pricing_viewed", { plan_tier: "free" })).not.toThrow();
  });
});

describe("analytics — conversion aliases", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.mocked(sendGa4Event).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps free preview aliases from analysis events", () => {
    trackAnalysisStarted({ plan_tier: "free", source: "alignment" });
    trackAnalysisCompleted({ plan_tier: "free", success: true });

    expect(sendGa4Event).toHaveBeenCalledWith("analysis_started", expect.objectContaining({ plan_tier: "free" }));
    expect(sendGa4Event).toHaveBeenCalledWith("free_preview_started", expect.objectContaining({ plan_tier: "free" }));
    expect(sendGa4Event).toHaveBeenCalledWith("analysis_completed", expect.objectContaining({ plan_tier: "free" }));
    expect(sendGa4Event).toHaveBeenCalledWith("free_preview_completed", expect.objectContaining({ plan_tier: "free" }));
  });

  it("does not emit free preview aliases for paid tiers", () => {
    trackAnalysisStarted({ plan_tier: "pro", source: "alignment" });
    const events = vi.mocked(sendGa4Event).mock.calls.map((call) => call[0]);
    expect(events).toContain("analysis_started");
    expect(events).not.toContain("free_preview_started");
  });

  it("maps tier CTA aliases alongside legacy checkout events", () => {
    trackFinalApplyCheckClicked({ source: "pricing" });
    trackActiveJobSearchClicked({ source: "pricing" });

    expect(sendGa4Event).toHaveBeenCalledWith("one_time_report_clicked", expect.objectContaining({ payment_mode: "one_time" }));
    expect(sendGa4Event).toHaveBeenCalledWith("final_apply_check_clicked", expect.objectContaining({ payment_mode: "one_time" }));
    expect(sendGa4Event).toHaveBeenCalledWith("upgrade_clicked", expect.objectContaining({ payment_mode: "subscription" }));
    expect(sendGa4Event).toHaveBeenCalledWith("active_job_search_clicked", expect.objectContaining({ payment_mode: "subscription" }));
  });

  it("maps checkout_success alongside payment_completed", () => {
    trackCheckoutSuccess({ payment_mode: "one_time", success: true });
    expect(sendGa4Event).toHaveBeenCalledWith("payment_completed", expect.objectContaining({ payment_mode: "one_time" }));
    expect(sendGa4Event).toHaveBeenCalledWith("checkout_success", expect.objectContaining({ payment_mode: "one_time" }));
    expect(sendGa4Event).toHaveBeenCalledWith("purchase", expect.objectContaining({ payment_mode: "one_time" }));
  });

  it("strips unsafe metadata from alias events", () => {
    trackFinalApplyCheckClicked({ source: "pricing", resume_text: "SECRET" });
    const payload = vi.mocked(sendGa4Event).mock.calls.find((call) => call[0] === "final_apply_check_clicked")?.[1] as Record<string, unknown>;
    expect(payload.source).toBe("pricing");
    expect(payload).not.toHaveProperty("resume_text");
  });
});

describe("analytics — reliability errors", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.mocked(sendGa4Event).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("tracks safe error codes only", () => {
    trackReliabilityError("edge_function_failed", "STACK trace secret api_key", {
      feature_name: "alignment",
    });
    expect(sendGa4Event).toHaveBeenCalledWith(
      "edge_function_failed",
      expect.objectContaining({
        error_code: "SANITIZED_ERROR",
        success: false,
        feature_name: "alignment",
      }),
    );
  });
});

describe("analytics — safeErrorCode", () => {
  it("normalizes safe codes", () => {
    expect(safeErrorCode("RATE_LIMIT")).toBe("RATE_LIMIT");
    expect(safeErrorCode("")).toBe("UNKNOWN");
  });
});

describe("ga4 — optional bridge", () => {
  it("no-ops when window.gtag is missing", () => {
    const original = window.gtag;
    // @ts-expect-error test override
    window.gtag = undefined;
    expect(() => sendGa4Event("analyze_clicked")).not.toThrow();
    window.gtag = original;
  });
});
