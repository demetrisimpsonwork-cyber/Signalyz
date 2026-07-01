import { describe, it, expect } from "vitest";
import { repairStrippedGrammar } from "../../supabase/functions/_shared/grammarRepair";

describe("repairStrippedGrammar — claim/metric strip scars", () => {
  it("repairs the cascading 'by % using .' scar end-to-end", () => {
    const input =
      "Led tier-2 escalation coordination with supervisors and partner agencies, improving first-call resolution by % using .";
    expect(repairStrippedGrammar(input)).toBe(
      "Led tier-2 escalation coordination with supervisors and partner agencies, improving first-call resolution.",
    );
  });

  it("removes a dangling 'via' before a comma", () => {
    expect(repairStrippedGrammar("Scaled operations via , reducing cost.")).toBe(
      "Scaled operations, reducing cost.",
    );
  });

  it("removes empty parentheses left by removed content", () => {
    expect(repairStrippedGrammar("Managed vendors ()")).toBe("Managed vendors.");
  });

  it("collapses double spaces and double commas", () => {
    expect(repairStrippedGrammar("Improved  process,, reducing  waste")).toBe(
      "Improved process, reducing waste.",
    );
  });

  it("does not break the hyphenated compound 'follow-through' (Phase 9.5)", () => {
    // Regression: "follow-through." collapsed to "follow-." because "through"
    // was treated as a dangling connector before terminal punctuation.
    expect(repairStrippedGrammar("Owned routing, follow-through, and resolution.")).toBe(
      "Owned routing, follow-through, and resolution.",
    );
    expect(repairStrippedGrammar("Delivered strong accuracy and follow-through.")).toBe(
      "Delivered strong accuracy and follow-through.",
    );
  });

  it("strips a dangling conjunction at the end", () => {
    expect(repairStrippedGrammar("Oversaw logistics and")).toBe("Oversaw logistics.");
  });

  it("preserves a legitimate percentage attached to a number", () => {
    expect(repairStrippedGrammar("Increased sales by 20%")).toBe("Increased sales by 20%.");
  });

  it("removes an orphan trailing 'using .'", () => {
    expect(repairStrippedGrammar("Resolved escalations using .")).toBe("Resolved escalations.");
  });

  it("is idempotent", () => {
    const input = "Led work by % using , and";
    const once = repairStrippedGrammar(input);
    expect(repairStrippedGrammar(once)).toBe(once);
  });

  it("does not damage a clean sentence", () => {
    const clean = "Partnered with sales and marketing to launch a regional program.";
    expect(repairStrippedGrammar(clean)).toBe(clean);
  });
});
