import { describe, it, expect } from "vitest";
import { bulletToPastTense } from "@/lib/pastTense";

describe("bulletToPastTense — malformed-word regressions (Phase 9.5)", () => {
  it("does not mangle the adverb 'Independently'", () => {
    // Regression: "Independently" ended in "y" and was turned into "Independentlied".
    expect(bulletToPastTense("Independently built a full AI-powered platform")).toBe(
      "Independently built a full AI-powered platform",
    );
  });

  it("does not double the final 's' of 'Demonstrates'", () => {
    // Regression: CVC doubling produced "Demonstratessed".
    expect(bulletToPastTense("Demonstrates ability to learn new systems")).toBe(
      "Demonstrated ability to learn new systems",
    );
  });

  it("converts common 3rd-person present lead verbs correctly", () => {
    expect(bulletToPastTense("Manages a team of five")).toBe("Managed a team of five");
    expect(bulletToPastTense("Leads cross-functional escalations")).toBe("Led cross-functional escalations");
    expect(bulletToPastTense("Builds internal tooling")).toBe("Built internal tooling");
    expect(bulletToPastTense("Provides technical support")).toBe("Provided technical support");
    expect(bulletToPastTense("Owns routing and resolution")).toBe("Owned routing and resolution");
    expect(bulletToPastTense("Processes claims daily")).toBe("Processed claims daily");
  });

  it("leaves adverb lead-ins alone but still reads cleanly", () => {
    expect(bulletToPastTense("Successfully resolved 40 cases")).toBe("Successfully resolved 40 cases");
    expect(bulletToPastTense("Consistently exceeded targets")).toBe("Consistently exceeded targets");
  });

  it("still conjugates the handful of real '-ly' verbs", () => {
    expect(bulletToPastTense("Apply pricing rules")).toBe("Applied pricing rules");
    expect(bulletToPastTense("Supply chain partners with parts")).toBe("Supplied chain partners with parts");
  });

  it("preserves existing correct behavior for regular and irregular verbs", () => {
    expect(bulletToPastTense("Managed audits")).toBe("Managed audits"); // already past
    expect(bulletToPastTense("Build the pipeline")).toBe("Built the pipeline"); // irregular
    expect(bulletToPastTense("Coordinate reviews")).toBe("Coordinated reviews"); // ends in "e"
    expect(bulletToPastTense("Ship weekly")).toBe("Shipped weekly"); // CVC doubling still works
  });
});
