import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ErrorBoundary from "@/components/ErrorBoundary";
import KeywordChips from "@/components/KeywordChips";
import IdentityStrengthIndex from "@/components/IdentityStrengthIndex";
import InterviewIntelligence from "@/components/InterviewIntelligence";
import { trackEvent } from "@/lib/analytics";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: vi.fn().mockResolvedValue({
        data: [
          {
            question: "Walk me through a production AI feature you shipped.",
            why_asking: "To validate ownership of end-to-end delivery.",
            signal_angle: "Lead with Signalyz shipping evidence.",
          },
        ],
        error: null,
      }),
    },
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
    })),
  },
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

describe("mobile post-result crash guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("KeywordChips does not crash when keywords are missing", () => {
    expect(() =>
      render(
        <ErrorBoundary>
          <KeywordChips keywords={undefined as unknown as string[]} />
        </ErrorBoundary>,
      ),
    ).not.toThrow();
    expect(screen.queryByText("This page didn't load correctly")).not.toBeInTheDocument();
  });

  it("KeywordChips does not crash when keywords is null", () => {
    expect(() =>
      render(
        <ErrorBoundary>
          <KeywordChips keywords={null} />
        </ErrorBoundary>,
      ),
    ).not.toThrow();
    expect(screen.queryByText("This page didn't load correctly")).not.toBeInTheDocument();
  });

  it("IdentityStrengthIndex does not crash when pillars are missing", () => {
    expect(() =>
      render(
        <ErrorBoundary>
          <IdentityStrengthIndex
            data={{ total_score: 72, pillars: undefined as unknown as [] }}
            isPro={false}
            onUpgrade={() => {}}
            inferredRoleTitle="AI Engineer"
          />
        </ErrorBoundary>,
      ),
    ).not.toThrow();
    expect(screen.queryByText("This page didn't load correctly")).not.toBeInTheDocument();
  });

  it("InterviewIntelligence sanitizes malformed question payloads without crashing", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: [
        { question: "Valid Q", why_asking: "Why", signal_angle: "Angle" },
        { broken: true },
        null,
      ],
      error: null,
    } as any);

    expect(() =>
      render(
        <ErrorBoundary>
          <InterviewIntelligence
            experience="Built Signalyz.ai with React and TypeScript."
            jd="Applied AI Engineer / Full Stack AI Engineer"
            alignmentResult={{ match_score: 68, missing_keywords: undefined }}
            isPro={false}
            onUpgrade={() => {}}
          />
        </ErrorBoundary>,
      ),
    ).not.toThrow();

    expect(await screen.findByText("Valid Q")).toBeInTheDocument();
    expect(screen.queryByText("This page didn't load correctly")).not.toBeInTheDocument();
  });

  it("trackEvent swallows persistence/storage failures", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(() =>
      trackEvent("analysis_completed", {
        plan_tier: "free",
        score_bucket: "60-69",
      }),
    ).not.toThrow();

    getItem.mockRestore();
    setItem.mockRestore();
  });
});
