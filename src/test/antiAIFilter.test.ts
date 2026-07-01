import { describe, it, expect } from "vitest";
import {
  antiAIFilter,
  repairSentenceFragments,
  repairCapabilityListVerb,
} from "@/lib/antiAIFilter";

describe("antiAIFilter — sentence-fragment safety (Phase 9.6)", () => {
  it("does not turn an em-dash aside into a '. Was ' fragment", () => {
    const input =
      "Guiding customers through complex platform requirements — explaining what they needed to do, why it mattered, and how to move forward — was a consistent part of both positions.";
    const out = antiAIFilter(input);
    expect(out).not.toContain(". Was ");
    expect(out).not.toContain(". Is ");
    // The clause stays attached to its subject.
    expect(out).toMatch(/move forward, was a consistent part/i);
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
