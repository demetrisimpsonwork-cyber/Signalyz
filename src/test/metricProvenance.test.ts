import { describe, it, expect } from "vitest";
import { stripUnsupportedMetrics } from "../../supabase/functions/_shared/metricProvenance";

describe("stripUnsupportedMetrics — evidence-only numbers", () => {
  it("removes an unsupported percentage", () => {
    const out = stripUnsupportedMetrics("Increased customer satisfaction by 30%", "");
    expect(out).not.toContain("30%");
    expect(out).not.toContain("30");
    expect(out.trim()).toBe("Increased customer satisfaction");
  });

  it("keeps a percentage present in the source", () => {
    const out = stripUnsupportedMetrics(
      "Improved retention by 15%",
      "Resume notes: improved retention 15% over two quarters.",
    );
    expect(out).toContain("15%");
  });

  it("removes an unsupported dollar value", () => {
    const out = stripUnsupportedMetrics("Cut costs by $2M annually", "");
    expect(out).not.toContain("$2M");
    expect(out).toContain("Cut costs");
    expect(out).toContain("annually");
  });

  it("keeps headcount supported by a standalone number in source", () => {
    const out = stripUnsupportedMetrics(
      "Supervised 8 staff across two shifts",
      "Managed 8 staff members on the night shift.",
    );
    expect(out).toContain("8 staff");
  });

  it("removes an unsupported headcount", () => {
    const out = stripUnsupportedMetrics("Led a team of 40 employees", "");
    expect(out).not.toContain("40 employees");
  });

  it("removes an unsupported multiplier", () => {
    const out = stripUnsupportedMetrics("Grew pipeline 3x", "");
    expect(out).not.toContain("3x");
  });

  it("never touches years or non-metric numbers", () => {
    const text = "Promoted in 2021 to lead the tier-2 escalation queue 24/7";
    expect(stripUnsupportedMetrics(text, "")).toBe(text);
  });
});
