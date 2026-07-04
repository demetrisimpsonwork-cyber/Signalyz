import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DirectorCalibrationBlock from "@/components/DirectorCalibrationBlock";
import { CAMDEN_SUCCESS_HIRING_REPORT_FIXTURE } from "@/test/fixtures/hiringReport/camdenSuccessResponse";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("DirectorCalibrationBlock render — Camden success fixture", () => {
  it("renders Signal Tier without triggering failure UI for Patch 1 metadata", () => {
    render(
      <DirectorCalibrationBlock
        result={CAMDEN_SUCCESS_HIRING_REPORT_FIXTURE}
        isPro
        isAuthenticated
        targetRoleTitle="AI Engineer"
        resumeText="Demetri Simpson\nAI Engineer at Signalyz"
        jdText="AI Engineer — Camden Health Innovation Lab"
      />,
    );

    expect(screen.getByText(/Signal Tier/i)).toBeInTheDocument();
    expect(screen.getByText("Senior IC Signal")).toBeInTheDocument();
    expect(
      screen.queryByText(/Your Hiring Report couldn't be generated/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Partial report/i)).not.toBeInTheDocument();
  });

  it("shows degraded notice when Patch 1 metadata marks pipeline degraded", () => {
    render(
      <DirectorCalibrationBlock
        result={{
          ...CAMDEN_SUCCESS_HIRING_REPORT_FIXTURE,
          _pipeline_degraded: true,
          _report_completeness_pct: 72,
          _omitted_sections: ["gap_analyzer", "rewrite_modules"],
          _calibration_status: "degraded",
        }}
        isPro
        isAuthenticated
        targetRoleTitle="AI Engineer"
      />,
    );

    expect(screen.getByText(/Partial report \(72% complete\)/i)).toBeInTheDocument();
    expect(screen.getByText(/gap_analyzer, rewrite_modules/i)).toBeInTheDocument();
    expect(screen.getByText(/Signal Tier/i)).toBeInTheDocument();
  });
});
