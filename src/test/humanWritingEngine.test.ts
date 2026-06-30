import { describe, it, expect } from "vitest";
import {
  humanizeProse,
  HUMAN_WRITING_RULES,
  COVER_LETTER_STANDARD,
} from "../../supabase/functions/_shared/humanWritingEngine";

// Phrases that must never survive in humanized prose.
const BANNED: Array<[string, RegExp]> = [
  ["this demonstrates", /\bthis (?:experience )?demonstrates\b/i],
  ["that discipline applies", /\bthat discipline applies\b/i],
  ["transferable skills", /\btransferable skills\b/i],
  ["throughout my career", /\bthroughout my career\b/i],
  ["I am excited", /\bI am excited\b/i],
  ["I am writing to apply", /\bI am writing to apply\b/i],
  ["I would welcome the opportunity", /\bI would welcome the opportunity\b/i],
  ["the conversation this letter is meant to start", /the conversation this letter is meant to start/i],
  ["leveraged", /\bleverage[d]?\b/i],
  ["utilized", /\butiliz(?:e|es|ed|ing|ation)\b/i],
  ["results-driven", /\bresults[-\s]driven\b/i],
  ["dynamic", /\bdynamic\b/i],
  ["passionate", /\bpassionate\b/i],
  ["proven track record", /\bproven track record\b/i],
];

function expectNoBanned(text: string, allow: string[] = []) {
  for (const [label, rx] of BANNED) {
    if (allow.includes(label)) continue;
    expect(rx.test(text), `should not contain "${label}": "${text}"`).toBe(false);
  }
}

describe("humanizeProse — removes AI tells, keeps grammar", () => {
  it('rewrites "this demonstrates" openers', () => {
    const out = humanizeProse("This demonstrates strong attention to detail.");
    expectNoBanned(out);
    expect(out).toMatch(/^Strong attention to detail\.?$/);
  });

  it('drops "that discipline applies" filler sentences', () => {
    const out = humanizeProse("Reconciled vendor accounts daily. That discipline applies directly to this role.");
    expectNoBanned(out);
    expect(out).toMatch(/Reconciled vendor accounts daily\./);
  });

  it('rewrites "transferable skills"', () => {
    const out = humanizeProse("My transferable skills include reconciliation and auditing.");
    expectNoBanned(out);
    expect(out.length).toBeGreaterThan(0);
  });

  it('strips "throughout my career" lead-ins', () => {
    const out = humanizeProse("Throughout my career, I have caught discrepancies early.");
    expectNoBanned(out);
    expect(out).toMatch(/^I have caught discrepancies early\./);
  });

  it("drops fake-enthusiasm cover-letter sentences", () => {
    const out = humanizeProse(
      "I am excited to apply for this position. I reconciled records across three sites. I would welcome the opportunity to discuss this further.",
    );
    expectNoBanned(out);
    expect(out).toMatch(/reconciled records across three sites/i);
  });

  it('drops "I am writing to apply" and the meta letter sentence', () => {
    const out = humanizeProse(
      "I am writing to apply for the Inventory Specialist role. The conversation this letter is meant to start matters more than formalities. I document every step.",
    );
    expectNoBanned(out);
    expect(out).toMatch(/I document every step/i);
  });

  it("replaces leveraged/utilized verbs", () => {
    const out = humanizeProse("Leveraged dashboards and utilized CRM data to cut churn.");
    expectNoBanned(out);
    expect(out).toMatch(/Used dashboards/i);
  });

  it('removes "results-driven", "passionate", and buzzword "dynamic"', () => {
    const out = humanizeProse("Results-driven, passionate professional thriving in a dynamic environment.");
    expectNoBanned(out);
    expect(out).toMatch(/professional/i);
    expect(out).toMatch(/environment/i);
  });

  it('rewrites "proven track record"', () => {
    const out = humanizeProse("Operations lead with a proven track record of managing audits.");
    expectNoBanned(out);
    expect(out).toMatch(/managing audits/i);
  });

  it("PRESERVES legitimate domain term 'dynamic pricing'", () => {
    const clean = "Owned dynamic pricing for the catalog and reconciled discrepancies weekly.";
    expect(humanizeProse(clean)).toBe(clean);
  });

  it("preserves clean human writing unchanged", () => {
    const clean = "Investigated billing discrepancies and reconciled accounts across three regional teams.";
    expect(humanizeProse(clean)).toBe(clean);
  });

  it("preserves the honest domain-switch example", () => {
    const clean =
      "While I have not worked on a warehouse floor, I have spent years reconciling records, catching discrepancies before they became larger problems, and documenting every step.";
    expect(humanizeProse(clean)).toBe(clean);
  });

  it("handles empty / non-string input", () => {
    expect(humanizeProse("")).toBe("");
    // @ts-expect-error runtime guard
    expect(humanizeProse(null)).toBe("");
  });
});

describe("humanWritingEngine — prompt blocks", () => {
  it("prompt blocks name the banned patterns so the model avoids them", () => {
    expect(HUMAN_WRITING_RULES).toMatch(/proven track record/i);
    expect(HUMAN_WRITING_RULES).toMatch(/transferable skills/i);
    expect(COVER_LETTER_STANDARD).toMatch(/I would welcome the opportunity/i);
  });
});
