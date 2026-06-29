import { describe, it, expect } from "vitest";
import {
  curateCompetencies,
  titleCaseCompetency,
} from "../../supabase/functions/_shared/competencyCuration";

describe("titleCaseCompetency", () => {
  it("title cases ordinary phrases", () => {
    expect(titleCaseCompetency("customer service")).toBe("Customer Service");
  });
  it("preserves known acronyms", () => {
    expect(titleCaseCompetency("crm administration")).toBe("CRM Administration");
  });
  it("lowercases small connecting words", () => {
    expect(titleCaseCompetency("scope of work")).toBe("Scope of Work");
  });
});

describe("curateCompetencies — dedupe, merge, prioritize", () => {
  it("merges synonyms and removes duplicates", () => {
    const result = curateCompetencies(
      ["Customer Support", "customer service", "Salesforce", "salesforce", "communications", "Microsoft Excel"],
      ["customer service", "salesforce"],
      "Provided customer service using Salesforce and Excel daily.",
    );
    expect(result[0]).toBe("Customer Service");
    expect(result).toContain("Salesforce");
    expect(result).not.toContain("customer service");
    // "Customer Support" + "customer service" collapse to one; "salesforce" dup removed.
    expect(new Set(result).size).toBe(result.length);
  });

  it("splits compound skill lines into atomic competencies", () => {
    const result = curateCompetencies(
      ["Scheduling, Inventory Management, Vendor Management"],
      [],
      "Handled scheduling, inventory, and vendor relationships.",
    );
    expect(result).toContain("Scheduling");
    expect(result).toContain("Inventory Management");
    expect(result).toContain("Vendor Management");
  });

  it("caps competencies at the max", () => {
    const many = Array.from({ length: 30 }, (_, i) => `Skill Number ${i}`);
    const result = curateCompetencies(many, [], "", { max: 10 });
    expect(result.length).toBeLessThanOrEqual(10);
  });

  it("produces a thoughtful section for a thin resume using evidence only", () => {
    const evidence =
      "Led a team of baristas, managed schedules, trained new staff, and handled customer complaints daily. Operated the cash register.";
    const result = curateCompetencies([], [], evidence, { min: 6, max: 10 });
    expect(result.length).toBeGreaterThanOrEqual(6);
    expect(result).toContain("Team Leadership");
    expect(result).toContain("Scheduling");
    expect(result).toContain("Cash Handling");
  });

  it("never invents competencies without evidence", () => {
    const result = curateCompetencies([], [], "Worked the front desk and greeted guests.");
    // Only capabilities literally evidenced may appear (e.g. Customer Service via "guests").
    expect(result).not.toContain("Inventory Management");
    expect(result).not.toContain("Compliance");
  });
});
