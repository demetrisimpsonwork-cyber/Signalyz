import { describe, it, expect } from "vitest";
import {
  compactJdForHiringReport,
  ROBERT_HALF_SWE_JD_FIXTURE,
} from "@signalyz/hiringReportJdCompaction";

describe("hiringReportJdCompaction", () => {
  it("removes benefits, legal, accommodation, EEO, and background-check sections", () => {
    const { compacted, removedBlockCount } = compactJdForHiringReport(ROBERT_HALF_SWE_JD_FIXTURE);

    expect(removedBlockCount).toBeGreaterThan(0);
    expect(compacted).not.toMatch(/benefits package/i);
    expect(compacted).not.toMatch(/401\s*\(\s*k\s*\)/i);
    expect(compacted).not.toMatch(/equal opportunity employer/i);
    expect(compacted).not.toMatch(/reasonable accommodation/i);
    expect(compacted).not.toMatch(/background check/i);
    expect(compacted).not.toMatch(/fair chance ordinance/i);
    expect(compacted).not.toMatch(/compensation/i);
  });

  it("preserves role title and company context", () => {
    const { compacted } = compactJdForHiringReport(ROBERT_HALF_SWE_JD_FIXTURE);

    expect(compacted).toMatch(/Software Engineer I/i);
    expect(compacted).toMatch(/Robert Half/i);
    expect(compacted).toMatch(/Who We Are/i);
  });

  it("preserves responsibilities and required qualifications", () => {
    const { compacted } = compactJdForHiringReport(ROBERT_HALF_SWE_JD_FIXTURE);

    expect(compacted).toMatch(/What You'll Do/i);
    expect(compacted).toMatch(/production issues/i);
    expect(compacted).toMatch(/Level I development support/i);
    expect(compacted).toMatch(/modules and components/i);
    expect(compacted).toMatch(/Required Qualifications/i);
    expect(compacted).toMatch(/programming and scripting languages/i);
    expect(compacted).toMatch(/application administration/i);
  });

  it("preserves technical requirements from the Robert Half SWE fixture", () => {
    const { compacted } = compactJdForHiringReport(ROBERT_HALF_SWE_JD_FIXTURE);

    expect(compacted).toMatch(/unit tests/i);
    expect(compacted).toMatch(/integration tests/i);
    expect(compacted).toMatch(/GenAI/i);
    expect(compacted).toMatch(/cloud AI services/i);
    expect(compacted).toMatch(/RESTful APIs/i);
    expect(compacted).toMatch(/SDLC/i);
    expect(compacted).toMatch(/n-tier architecture/i);
    expect(compacted).toMatch(/database concepts/i);
    expect(compacted).toMatch(/containers/i);
    expect(compacted).toMatch(/AI ethics/i);
    expect(compacted).toMatch(/requirements and test plans/i);
  });

  it("deduplicates repeated benefits blocks", () => {
    const duplicated = `${ROBERT_HALF_SWE_JD_FIXTURE}\n\nBenefits Package\nWe offer comprehensive health, dental, and vision insurance.`;
    const { compacted } = compactJdForHiringReport(duplicated);
    expect(compacted).not.toMatch(/benefits package/i);
    expect(compacted).toMatch(/Software Engineer I/i);
  });

  it("is deterministic for the same input", () => {
    const first = compactJdForHiringReport(ROBERT_HALF_SWE_JD_FIXTURE);
    const second = compactJdForHiringReport(ROBERT_HALF_SWE_JD_FIXTURE);
    expect(first.compacted).toBe(second.compacted);
  });

  it("reduces payload size for long boilerplate-heavy JDs", () => {
    const { originalLength, compactedLength } = compactJdForHiringReport(ROBERT_HALF_SWE_JD_FIXTURE);
    expect(compactedLength).toBeLessThan(originalLength);
    expect(compactedLength).toBeGreaterThan(400);
  });
});
