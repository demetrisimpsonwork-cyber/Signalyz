import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  feedbackStorageKey,
  getFeedbackSessionId,
  hasSubmittedFeedback,
  markFeedbackSubmitted,
  submitUserFeedback,
} from "@/lib/userFeedback";
import { trackEvent } from "@/lib/analytics";

vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn(),
}));

const insertMock = vi.fn();
const getUserMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: (...args: unknown[]) => getUserMock(...args),
    },
    from: vi.fn(() => ({
      insert: insertMock,
    })),
  },
}));

describe("userFeedback helpers", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("builds stable storage keys from request id", () => {
    expect(feedbackStorageKey("req-123")).toBe("signalyz_feedback_submitted_req-123");
    expect(feedbackStorageKey(undefined, "fp-abc")).toBe("signalyz_feedback_submitted_fp-abc");
  });

  it("tracks submission in session storage", () => {
    expect(hasSubmittedFeedback("req-1")).toBe(false);
    markFeedbackSubmitted("req-1");
    expect(hasSubmittedFeedback("req-1")).toBe(true);
  });

  it("reuses feedback session id within a tab session", () => {
    const first = getFeedbackSessionId();
    const second = getFeedbackSessionId();
    expect(second).toBe(first);
  });
});

describe("submitUserFeedback", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    insertMock.mockResolvedValue({ error: null });
  });

  it("persists row and fires analytics events", async () => {
    const result = await submitUserFeedback({
      source: "hiring_report",
      useful: true,
      appliedWithResume: true,
      outcome: "interview",
      comment: "  Great report  ",
      requestId: "req-abc",
      planTier: "pro",
      pipelineVersion: "1.3",
    });

    expect(result.ok).toBe(true);
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        source: "hiring_report",
        useful: true,
        applied_with_resume: true,
        outcome: "interview",
        comment: "Great report",
        request_id: "req-abc",
        plan_tier: "pro",
        pipeline_version: "1.3",
      }),
    );
    expect(trackEvent).toHaveBeenCalledWith(
      "feedback_submitted",
      expect.objectContaining({ success: true, useful: true }),
    );
    expect(trackEvent).toHaveBeenCalledWith(
      "applied_clicked",
      expect.objectContaining({ request_id: "req-abc" }),
    );
    expect(hasSubmittedFeedback("req-abc")).toBe(true);
  });

  it("returns error when insert fails", async () => {
    insertMock.mockResolvedValue({ error: { message: "RLS denied" } });
    const result = await submitUserFeedback({ source: "hiring_report", useful: false });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("RLS denied");
    expect(trackEvent).not.toHaveBeenCalled();
  });
});
