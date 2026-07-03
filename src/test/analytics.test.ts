import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sanitizeEventMetadata,
  scoreBucket,
  trackEvent,
} from "@/lib/analytics";
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
      plan_tier: "pro",
    });
    expect(safe.output_type).toBe("calibrated_resume");
    expect(safe.plan_tier).toBe("pro");
    expect(safe).not.toHaveProperty("resume_text");
    expect(safe).not.toHaveProperty("jd_text");
    expect(safe).not.toHaveProperty("bullet");
    expect(safe).not.toHaveProperty("experience");
  });

  it("drops overly long string values", () => {
    const safe = sanitizeEventMetadata({
      target_role: "Customer Specialist",
      cta_label: "x".repeat(200),
    });
    expect(safe.target_role).toBe("Customer Specialist");
    expect(safe).not.toHaveProperty("cta_label");
  });

  it("maps scores to buckets without raw content", () => {
    expect(scoreBucket(82)).toBe("strong");
    expect(scoreBucket(70)).toBe("moderate");
    expect(scoreBucket(55)).toBe("developing");
    expect(scoreBucket(40)).toBe("weak");
  });
});

describe("analytics — trackEvent", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
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

  it("does not crash when gtag is unavailable", () => {
    expect(() => sendGa4Event("pricing_viewed", { plan_tier: "free" })).not.toThrow();
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
