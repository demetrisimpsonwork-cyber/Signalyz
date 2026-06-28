import { describe, it, expect } from "vitest";
import { normalizeRawText, parseResumeIntake } from "@/lib/resumeIntake";

const RESUME_WITH_NUMBERED_BULLETS = `John Smith
john@example.com | 555-123-4567

EXPERIENCE
Operations Manager | Acme Logistics Inc | 2020 - 2023
1. Managed daily warehouse operations across three regional shifts.
2. Reduced shipping errors by tracking fulfillment metrics every week.
3. Coordinated vendor deliveries and inbound inventory counts.

Warehouse Associate | Beta Supply Co | 2017 - 2020
(1) Processed inbound shipments and verified packing slips.
a) Maintained accurate stock records in the inventory system.
`;

describe("numbered bullet support", () => {
  it("converts numbered / lettered markers into '-' bullets", () => {
    const normalized = normalizeRawText(RESUME_WITH_NUMBERED_BULLETS);
    expect(normalized).toContain("- Managed daily warehouse operations");
    expect(normalized).toContain("- Processed inbound shipments");
    expect(normalized).toContain("- Maintained accurate stock records");
    // markers themselves are stripped
    expect(normalized).not.toMatch(/^\s*1\.\s/m);
    expect(normalized).not.toMatch(/^\s*\(1\)\s/m);
  });

  it("does NOT treat 4-digit years or date ranges as bullets", () => {
    const normalized = normalizeRawText("2021 Annual operations review completed\n2020 - 2023 tenure");
    expect(normalized).not.toMatch(/^-\s/m);
  });

  it("extracts numbered bullets as experience responsibilities", () => {
    const result = parseResumeIntake(RESUME_WITH_NUMBERED_BULLETS);
    const allResponsibilities = result.sections.experience.flatMap((e) => e.responsibilities);
    expect(allResponsibilities.length).toBeGreaterThanOrEqual(4);
    // no leftover numeric markers at the start of a responsibility
    for (const r of allResponsibilities) {
      expect(r).not.toMatch(/^\s*(?:\(?\d{1,2}\)|\d{1,2}\.)\s/);
    }
  });
});
