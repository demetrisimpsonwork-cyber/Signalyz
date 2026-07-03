import { describe, it, expect } from "vitest";
import {
  DIRECTOR_CALIBRATION_TIMEOUT_MS,
  ALIGNMENT_TIMEOUT_MS,
  DEFAULT_EDGE_FUNCTION_TIMEOUT_MS,
} from "@/lib/hiringReportConfig";
import {
  classifyHiringReportErrorCode,
  mapHiringReportErrorToUserMessage,
  sanitizeHiringReportErrorDetails,
  HIRING_REPORT_USER_MESSAGE,
} from "@/lib/hiringReportErrors";

describe("hiringReport reliability — timeout scope", () => {
  it("Hiring Report uses an extended client timeout (210s)", () => {
    expect(DIRECTOR_CALIBRATION_TIMEOUT_MS).toBe(210_000);
    expect(DIRECTOR_CALIBRATION_TIMEOUT_MS).toBeGreaterThan(180_000);
  });

  it("alignment and default edge timeouts are not extended for Hiring Report", () => {
    expect(ALIGNMENT_TIMEOUT_MS).toBe(120_000);
    expect(DEFAULT_EDGE_FUNCTION_TIMEOUT_MS).toBe(90_000);
    expect(ALIGNMENT_TIMEOUT_MS).toBeLessThan(DIRECTOR_CALIBRATION_TIMEOUT_MS);
    expect(DEFAULT_EDGE_FUNCTION_TIMEOUT_MS).toBeLessThan(DIRECTOR_CALIBRATION_TIMEOUT_MS);
  });
});

describe("hiringReport reliability — error handling", () => {
  it("timeout errors map to the safe Hiring Report UI message", () => {
    expect(classifyHiringReportErrorCode("TIMEOUT", "Analysis took too long")).toBe("timeout");
    expect(
      mapHiringReportErrorToUserMessage({
        error_code: "TIMEOUT",
        message: "Analysis took too long. Please retry.",
      }),
    ).toBe(HIRING_REPORT_USER_MESSAGE);
  });

  it("auth/pro-required errors can surface server guidance when safe", () => {
    expect(classifyHiringReportErrorCode("AUTH_REQUIRED", "Sign in to generate your Signal Positioning Report.")).toBe(
      "auth_pro_required",
    );
    expect(
      mapHiringReportErrorToUserMessage({
        error_code: "AUTH_REQUIRED",
        message: "Sign in to generate your Signal Positioning Report.",
      }),
    ).toBe("Sign in to generate your Signal Positioning Report.");
  });

  it("model and parse errors are classified internally without stack traces in client details", () => {
    expect(classifyHiringReportErrorCode("MODEL_ERROR", "Anthropic 529: overloaded")).toBe("model_error");
    expect(classifyHiringReportErrorCode("PARSE_VALIDATION", "Failed to parse response")).toBe("parse_validation");

    const sanitized = sanitizeHiringReportErrorDetails({
      error_message: "Failed to parse response",
      error_stack: "Error: Failed to parse\n    at runPipeline (index.ts:1:1)",
    });
    expect(sanitized).toEqual({ error_message: "Failed to parse response" });
    expect(sanitized).not.toHaveProperty("error_stack");
  });

  it("user-facing error message does not include raw stack traces", () => {
    const userMsg = mapHiringReportErrorToUserMessage({
      error_code: "EDGE_EXCEPTION",
      message: "Error: boom\n    at runPipeline (index.ts:99:11)",
    });
    expect(userMsg).toBe(HIRING_REPORT_USER_MESSAGE);
    expect(userMsg).not.toMatch(/at runPipeline/);
  });
});
