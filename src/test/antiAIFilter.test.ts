import { describe, it, expect } from "vitest";
import {
  antiAIFilter,
  repairSentenceFragments,
  repairCapabilityListVerb,
  repairAsideBeforeMainVerb,
  repairEmDashAppositiveList,
  repairListMissingAnd,
} from "@/lib/antiAIFilter";

describe("antiAIFilter — sentence-fragment safety (Phase 9.6)", () => {
  it("does not turn an em-dash aside into a '. Was ' fragment", () => {
    const input =
      "Guiding customers through complex platform requirements — explaining what they needed to do, why it mattered, and how to move forward — was a consistent part of both positions.";
    const out = antiAIFilter(input);
    expect(out).not.toContain(". Was ");
    expect(out).not.toContain(". Is ");
    // The clause stays attached to its subject — the appositive is re-closed
    // with an em-dash (Phase 9.10) rather than a bare comma.
    expect(out).toMatch(/move forward — was a consistent part/i);
  });

  it("does not turn an em-dash aside into a '. Is ' fragment", () => {
    const input =
      "Graybar's model — employee-owned, customer-first, built on long-term relationships rather than transactional volume — is the kind of environment where the work I've been doing has a real home.";
    const out = antiAIFilter(input);
    expect(out).not.toContain(". Is ");
    expect(out).not.toContain(". Was ");
  });

  it("repairs existing '. Was ' fragments from any source", () => {
    expect(repairSentenceFragments("...how to move forward. Was a consistent part of both positions."))
      .toBe("...how to move forward, was a consistent part of both positions.");
  });

  it("repairs existing '. Is ' fragments from any source", () => {
    expect(repairSentenceFragments("...rather than transactional volume. Is the kind of environment."))
      .toBe("...rather than transactional volume, is the kind of environment.");
  });

  it("does not join legitimate consecutive sentences", () => {
    const input = "I resolved 40 cases daily. The work required accuracy. Both mattered.";
    expect(repairSentenceFragments(input)).toBe(input);
  });
});

describe("antiAIFilter — list-to-verb repair (Phase 9.8)", () => {
  it("repairs the broken 'judgment under pressure, apply directly' comma splice", () => {
    const input =
      "documentation accuracy, process integrity, real-time judgment under pressure, apply directly to a customer-facing role.";
    const out = repairCapabilityListVerb(input);
    expect(out).not.toContain("judgment under pressure, apply directly");
    expect(out).toBe(
      "documentation accuracy, process integrity, and real-time judgment under pressure all apply directly to a customer-facing role.",
    );
  });

  it("is also applied by the full antiAIFilter pipeline", () => {
    const input =
      "documentation accuracy, process integrity, real-time judgment under pressure, apply directly here.";
    const out = antiAIFilter(input);
    expect(out).not.toContain("judgment under pressure, apply directly");
    expect(out).toContain("and real-time judgment under pressure all apply directly");
  });

  it("does not add a duplicate 'and' when the last item already has one", () => {
    const input = "speed, accuracy, and follow-through, apply across the role.";
    const out = repairCapabilityListVerb(input);
    expect(out).not.toContain("and and");
    expect(out).toBe("speed, accuracy, and follow-through all apply across the role.");
  });

  it("leaves a well-formed list-subject sentence untouched", () => {
    const input =
      "documentation accuracy, process integrity, and real-time judgment under pressure all apply directly to this role.";
    expect(repairCapabilityListVerb(input)).toBe(input);
  });

  it("does not touch a normal two-item clause", () => {
    const input = "I managed billing and vendor coordination, translating requirements into action.";
    expect(repairCapabilityListVerb(input)).toBe(input);
  });

  it("does not fabricate CarMax-specific domain claims when repairing grammar", () => {
    const input =
      "high-volume support, documentation accuracy, process follow-through, apply directly to this role.";
    const out = antiAIFilter(input);
    expect(out.toLowerCase()).not.toContain("appraisal");
    expect(out.toLowerCase()).not.toContain("inventory reconciliation");
    expect(out.toLowerCase()).not.toContain("repair order");
    expect(out).toContain("all apply directly");
  });
});

describe("antiAIFilter — dangling aside before main verb (Phase 9.9)", () => {
  const OBSERVED =
    "Managing 40–70 concurrent active support cases daily at the New Jersey Department of Labor — while resolving 8–15 per day under strict SLA requirements, reflects the kind of operational discipline and customer-first accuracy that CarMax's end-to-end sales and service process demands.";

  it("removes the 'requirements, reflects' comma splice directly", () => {
    const out = repairAsideBeforeMainVerb(OBSERVED);
    expect(out).not.toContain("requirements, reflects");
    expect(out).toContain("Department of Labor reflects the kind of operational discipline");
  });

  it("removes the comma splice through the full antiAIFilter pipeline", () => {
    const out = antiAIFilter(OBSERVED);
    expect(out).not.toContain("requirements, reflects");
    expect(out).toContain("reflects the kind of operational discipline");
  });

  it("also repairs an aside that only appears after em-dash reduction", () => {
    // Two em-dashes: reduceEmDashes keeps the first, turns the second into a
    // comma, producing the dangling-aside signature the repair then fixes.
    const input =
      "The volume at NJDOL — sustained across every shift — demonstrates the discipline this role needs.";
    const out = antiAIFilter(input);
    expect(out).not.toMatch(/,\s*demonstrates\b/);
    expect(out).toContain("demonstrates the discipline this role needs");
  });

  it("leaves a clean sentence with a properly closed aside untouched", () => {
    const input = "I resolved 40 cases daily and the work required accuracy.";
    expect(repairAsideBeforeMainVerb(input)).toBe(input);
  });

  it("preserves the clean CarMax salutation (repair + full filter leave it intact)", () => {
    const salutation = "Dear CarMax Hiring Team,";
    expect(repairAsideBeforeMainVerb(salutation)).toBe(salutation);
    expect(antiAIFilter(salutation)).toBe(salutation);
  });
});

describe("antiAIFilter — list punctuation repair (Phase 9.10)", () => {
  it("adds the missing 'and' and drops the stray comma before a connector", () => {
    const input =
      "Guiding individuals, employers, healthcare providers, through complex processes.";
    const out = repairListMissingAnd(input);
    expect(out).toBe("Guiding individuals, employers, and healthcare providers through complex processes.");
    expect(out).not.toContain("providers, through");
  });

  it("fixes the missing-'and' list through the full pipeline", () => {
    const input =
      "I was guiding individuals, employers, healthcare providers, through complex processes daily.";
    const out = antiAIFilter(input);
    expect(out).toContain("individuals, employers, and healthcare providers through complex processes");
  });

  it("leaves a well-formed list before a connector untouched", () => {
    const input = "Guiding employers, individuals, and healthcare providers through distinct requirements.";
    expect(repairListMissingAnd(input)).toBe(input);
  });

  it("re-closes a broken em-dash appositive list before 'is'", () => {
    const input =
      "CarMax's model — transparent pricing, a structured process, no-pressure guidance, is the kind of environment I want.";
    const out = repairEmDashAppositiveList(input);
    expect(out).toBe(
      "CarMax's model — transparent pricing, a structured process, and no-pressure guidance — is the kind of environment I want.",
    );
    expect(out).not.toContain("guidance, is");
  });

  it("re-closes the em-dash appositive after em-dash reduction in the full pipeline", () => {
    // Two em-dashes: reduceEmDashes turns the second into a comma, producing the
    // "..., is" break that the appositive repair then re-closes.
    const input =
      "CarMax's model — transparent pricing, a structured process, and no-pressure guidance — is the kind of environment I want to work in.";
    const out = antiAIFilter(input);
    expect(out).not.toMatch(/guidance,\s*is\b/);
    expect(out).toContain("and no-pressure guidance — is the kind of environment");
  });

  it("does not touch a single-phrase em-dash aside (no list)", () => {
    const input = "The role — a demanding one, is exactly what I want.";
    expect(repairEmDashAppositiveList(input)).toBe(input);
  });
});
