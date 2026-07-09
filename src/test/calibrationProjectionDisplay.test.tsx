import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import SignalDiagnosticModules from "@/components/SignalDiagnosticModules";
import {
  CALIBRATION_PROJECTION_FALLBACK_LABEL,
  resolveCalibrationProjectionDisplay,
} from "@/lib/calibrationProjectionDisplay";

describe("resolveCalibrationProjectionDisplay", () => {
  it("hides lower projected scores", () => {
    const result = resolveCalibrationProjectionDisplay(51, 34);
    expect(result).toEqual({
      kind: "fallback",
      currentScore: 51,
      projectedLabel: CALIBRATION_PROJECTION_FALLBACK_LABEL,
    });
  });

  it("falls back for null/undefined/NaN/0 projected scores", () => {
    for (const projected of [null, undefined, Number.NaN, 0, -5, "68"]) {
      const result = resolveCalibrationProjectionDisplay(51, projected);
      expect(result.kind).toBe("fallback");
      if (result.kind === "fallback") {
        expect(result.currentScore).toBe(51);
        expect(result.projectedLabel).toBe(CALIBRATION_PROJECTION_FALLBACK_LABEL);
      }
    }
  });

  it("shows numeric projection only when higher than current", () => {
    expect(resolveCalibrationProjectionDisplay(51, 68)).toEqual({
      kind: "numeric",
      currentScore: 51,
      projectedScore: 68,
    });
  });

  it("treats equal projected score as unsafe for numeric display", () => {
    const result = resolveCalibrationProjectionDisplay(51, 51);
    expect(result.kind).toBe("fallback");
  });
});

describe("Strategic Fixes projected score display", () => {
  it("does not render a lower projected percentage for free locked preview", () => {
    render(
      <div className="max-w-sm">
        <SignalDiagnosticModules
          matchScore={51}
          data={{
            isPro: false,
            interview_gap_diagnosis: {
              primary_blocker: "Ownership framing is under-signaled for this role.",
              current_score: 51,
              predicted_score: 34,
              strategic_fixes: ["Lead with shipped product ownership.", "Quantify reliability outcomes."],
            },
          }}
        />
      </div>,
    );

    expect(screen.getByText("51%")).toBeInTheDocument();
    expect(screen.queryByText("34%")).not.toBeInTheDocument();
    expect(screen.getByText(CALIBRATION_PROJECTION_FALLBACK_LABEL)).toBeInTheDocument();
    expect(screen.getByText(/Unlock calibrated export/i)).toBeInTheDocument();
  });

  it("renders safe fallback when projected score is missing", () => {
    render(
      <SignalDiagnosticModules
        matchScore={51}
        data={{
          isPro: false,
          interview_gap_diagnosis: {
            primary_blocker: "Keyword alignment is incomplete.",
            current_score: 51,
            predicted_score: undefined,
          },
        }}
      />,
    );

    expect(screen.getByText("51%")).toBeInTheDocument();
    expect(screen.getByText(CALIBRATION_PROJECTION_FALLBACK_LABEL)).toBeInTheDocument();
  });

  it("renders current → higher projected when valid", () => {
    render(
      <SignalDiagnosticModules
        matchScore={51}
        data={{
          isPro: false,
          interview_gap_diagnosis: {
            primary_blocker: "Outcome framing needs stronger proof.",
            current_score: 51,
            predicted_score: 68,
          },
        }}
      />,
    );

    expect(screen.getByText("51%")).toBeInTheDocument();
    expect(screen.getByText("68%")).toBeInTheDocument();
    expect(screen.queryByText(CALIBRATION_PROJECTION_FALLBACK_LABEL)).not.toBeInTheDocument();
  });
});
