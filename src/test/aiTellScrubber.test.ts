import { describe, it, expect } from "vitest";
import { scrubAiTells } from "../../supabase/functions/_shared/aiTellScrubber";

describe("scrubAiTells — grammar-safe AI-tell replacement", () => {
  it("replaces the utilize family with the use family", () => {
    expect(scrubAiTells("Utilized Salesforce to track cases.")).toBe("Used Salesforce to track cases.");
    expect(scrubAiTells("utilizing dashboards")).toBe("using dashboards");
    expect(scrubAiTells("utilizes reporting tools")).toBe("uses reporting tools");
    expect(scrubAiTells("Resource utilization review")).toBe("Resource use review");
  });

  it("replaces leveraged/leveraging verb forms with used/using", () => {
    expect(scrubAiTells("Leveraged CRM data to reduce churn.")).toBe("Used CRM data to reduce churn.");
    expect(scrubAiTells("leveraging vendor relationships")).toBe("using vendor relationships");
  });

  it('replaces "in order to" with "to"', () => {
    expect(scrubAiTells("Reorganized the queue in order to cut wait times.")).toBe(
      "Reorganized the queue to cut wait times.",
    );
    expect(scrubAiTells("In order to scale, standardized intake.")).toBe("To scale, standardized intake.");
  });

  it("preserves leading-capital case on replacements", () => {
    expect(scrubAiTells("Utilized")).toBe("Used");
    expect(scrubAiTells("utilized")).toBe("used");
  });

  it("does NOT touch the noun 'leverage' or legitimate domain terms", () => {
    expect(scrubAiTells("Negotiated leverage with suppliers.")).toBe("Negotiated leverage with suppliers.");
    expect(scrubAiTells("Owned dynamic pricing for the catalog.")).toBe("Owned dynamic pricing for the catalog.");
    expect(scrubAiTells("Coordinated various stakeholders across sites.")).toBe(
      "Coordinated various stakeholders across sites.",
    );
  });

  it("leaves clean recruiter prose unchanged", () => {
    const clean = "Investigated discrepancies and reconciled inventory across three distribution sites.";
    expect(scrubAiTells(clean)).toBe(clean);
  });

  it("handles empty / non-string input safely", () => {
    expect(scrubAiTells("")).toBe("");
    // @ts-expect-error runtime guard
    expect(scrubAiTells(null)).toBe("");
  });
});
