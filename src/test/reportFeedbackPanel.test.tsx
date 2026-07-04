import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ReportFeedbackPanel } from "@/components/ReportFeedbackPanel";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const submitMock = vi.fn();

vi.mock("@/lib/userFeedback", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/userFeedback")>();
  return {
    ...actual,
    submitUserFeedback: (...args: unknown[]) => submitMock(...args),
    hasSubmittedFeedback: () => false,
  };
});

describe("ReportFeedbackPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submitMock.mockResolvedValue({ ok: true });
  });

  it("renders core feedback questions", () => {
    render(<ReportFeedbackPanel requestId="req-1" planTier="free" />);
    expect(screen.getByText("Was this useful?")).toBeInTheDocument();
    expect(screen.getByText("Did you apply with this resume?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit feedback" })).toBeInTheDocument();
  });

  it("shows outcome choices when user applied", () => {
    render(<ReportFeedbackPanel requestId="req-1" />);
    const yesButtons = screen.getAllByRole("button", { name: "Yes" });
    fireEvent.click(yesButtons[0]);
    fireEvent.click(yesButtons[1]);
    expect(screen.getByText("What happened so far?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Got interview" })).toBeInTheDocument();
  });

  it("submits feedback with selected values", async () => {
    render(<ReportFeedbackPanel requestId="req-2" pipelineVersion="1.3" planTier="pro" />);
    const yesButtons = screen.getAllByRole("button", { name: "Yes" });
    fireEvent.click(yesButtons[0]);
    fireEvent.click(yesButtons[1]);
    fireEvent.click(screen.getByRole("button", { name: "Still waiting" }));
    fireEvent.change(screen.getByPlaceholderText(/What worked/i), {
      target: { value: "Clear gaps section" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit feedback" }));

    await waitFor(() => {
      expect(submitMock).toHaveBeenCalledWith(
        expect.objectContaining({
          useful: true,
          appliedWithResume: true,
          outcome: "waiting",
          comment: "Clear gaps section",
          requestId: "req-2",
          pipelineVersion: "1.3",
          planTier: "pro",
        }),
      );
    });
  });
});
