import { describe, it, expect } from "vitest";
import {
  extractHiringReportPipelineMetadata,
  isDegradedHiringReportResponse,
  sanitizeHiringReportResponseForRender,
} from "@/lib/hiringReportResponseSanitizer";
import { CAMDEN_SUCCESS_HIRING_REPORT_FIXTURE } from "@/test/fixtures/hiringReport/camdenSuccessResponse";

describe("hiringReportResponseSanitizer", () => {
  it("preserves valid Patch 1 metadata without throwing", () => {
    const meta = extractHiringReportPipelineMetadata(CAMDEN_SUCCESS_HIRING_REPORT_FIXTURE as Record<string, unknown>);
    expect(meta.pipeline_version).toBe("1.3");
    expect(meta._report_completeness_pct).toBe(100);
    expect(meta._pipeline_degraded).toBe(false);
    expect(meta._calibration_status).toBe("ok");
    expect(meta._omitted_sections).toEqual([]);
    expect(isDegradedHiringReportResponse(meta)).toBe(false);
  });

  it("drops invalid metadata shapes instead of throwing", () => {
    const meta = extractHiringReportPipelineMetadata({
      pipeline_version: 1.3,
      _pipeline_degraded: "no",
      _report_completeness_pct: "100",
      _omitted_sections: "gap_analyzer",
      _calibration_status: null,
    });
    expect(meta.pipeline_version).toBeUndefined();
    expect(meta._pipeline_degraded).toBeUndefined();
    expect(meta._report_completeness_pct).toBeUndefined();
    expect(meta._omitted_sections).toBeUndefined();
    expect(meta._calibration_status).toBeUndefined();
  });

  it("sanitizeHiringReportResponseForRender keeps render-critical fields", () => {
    const sanitized = sanitizeHiringReportResponseForRender(CAMDEN_SUCCESS_HIRING_REPORT_FIXTURE);
    expect(sanitized.dimensions).toHaveLength(4);
    expect(sanitized.director_signal_tier.tier).toMatch(/Signal/);
    expect(sanitized.pipeline_version).toBe("1.3");
  });
});
