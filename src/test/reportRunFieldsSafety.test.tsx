import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ErrorBoundary from "@/components/ErrorBoundary";
import CoverLetterTab from "@/components/CoverLetterTab";
import CoverLetterEngine from "@/components/CoverLetterEngine";
import CalibratedResumeTab from "@/components/CalibratedResumeTab";
import LinkedInSignalTab from "@/components/LinkedInSignalTab";
import InterviewIntelligence from "@/components/InterviewIntelligence";
import { NJDOL_RESUME_TEXT } from "@/test/fixtures/rag/njdolResume";

const APTASENTRY_JD =
  "Aptasentry is seeking an AI/ML Engineer to automate go-to-market operations with Python, LLMs, RAG, embeddings, and CRM integrations across remote teams.";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: [], error: null }),
    },
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
  },
}));

vi.mock("@/lib/resilientEdgeFn", () => ({
  invokeResilient: vi.fn().mockResolvedValue({ status: "ok" }),
  FRIENDLY_FAIL_MSG: "Try again",
  StructuredEdgeError: class extends Error {},
  isInFlight: () => false,
  clearInFlight: () => {},
}));

describe("ErrorBoundary", () => {
  it("renders fallback without leaking error details to the UI", () => {
    function Boom(): never {
      throw new Error("sensitive resume payload should not appear");
    }

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByText("This page didn't load correctly")).toBeInTheDocument();
    expect(screen.queryByText(/sensitive resume payload/i)).not.toBeInTheDocument();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe("reportRunFields optional safety in Pro tabs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("CoverLetterTab renders without reportRunFields", () => {
    render(
      <CoverLetterTab
        isPro
        onUpgrade={() => {}}
        experience={NJDOL_RESUME_TEXT}
        jd={APTASENTRY_JD}
        alignmentResult={{}}
        inferredRole="Operations Lead"
        hasCurrentSessionAlignment
      />,
    );
    expect(screen.getByText(/Calibrating for:/i)).toBeInTheDocument();
  });

  it("CoverLetterEngine renders without reportRunFields", () => {
    render(
      <CoverLetterEngine
        experience={NJDOL_RESUME_TEXT}
        jd={APTASENTRY_JD}
        alignmentResult={{}}
        inferredRole="Operations Lead"
        isPro={false}
        onUpgrade={() => {}}
      />,
    );
    expect(screen.getByText(/Calibrating for:/i)).toBeInTheDocument();
  });

  it("CalibratedResumeTab renders without reportRunFields", () => {
    render(
      <CalibratedResumeTab
        isPro={false}
        onUpgrade={() => {}}
        directorResult={null}
        originalResume={NJDOL_RESUME_TEXT}
        jdText={APTASENTRY_JD}
        hasCurrentSessionAlignment={false}
      />,
    );
    expect(screen.getByText(/Active Job Search/i)).toBeInTheDocument();
  });

  it("LinkedInSignalTab renders without reportRunFields", () => {
    render(
      <LinkedInSignalTab
        experience={NJDOL_RESUME_TEXT}
        inferredRole="Operations Lead"
        jdText={APTASENTRY_JD}
        isPro={false}
        onUpgrade={() => {}}
      />,
    );
    expect(screen.getByText(/LinkedIn Signal Calibration/i)).toBeInTheDocument();
  });

  it("InterviewIntelligence mounts without reportRunFields and does not throw", () => {
    expect(() =>
      render(
        <InterviewIntelligence
          experience=""
          jd=""
          alignmentResult={{}}
          isPro={false}
          onUpgrade={() => {}}
        />,
      ),
    ).not.toThrow();
  });
});

describe("Index-style default reportRunFields path", () => {
  it("safeTrimText + buildReportRunInvokeFields handles absent canonical inputs", async () => {
    const { safeTrimText, buildReportRunInvokeFields } = await import("@/lib/reportRunSession");
    expect(safeTrimText(undefined)).toBe("");
    await expect(
      buildReportRunInvokeFields("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "", APTASENTRY_JD),
    ).resolves.toBeNull();
  });
});
