import { describe, it, expect } from "vitest";
import { antiAIFilter, repairSentenceFragments } from "@/lib/antiAIFilter";

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
