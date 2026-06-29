import { describe, it, expect } from "vitest";
import { enforceSummaryVoice } from "../../supabase/functions/_shared/summaryVoice";

// Patterns the Professional Summary must NEVER contain (Phase 6.3 hardening).
const FORBIDDEN: Array<{ label: string; rx: RegExp }> = [
  { label: "third-person pronouns", rx: /\b(he|she|they|him|his|her|hers|them|their|theirs)\b/i },
  { label: '"the candidate"', rx: /\bthe candidate\b/i },
  { label: '"work history"', rx: /\bwork history\b/i },
  { label: '"resume"', rx: /\bresume\b/i },
  { label: '"is listed"', rx: /\bis listed\b/i },
  { label: '"listed"', rx: /\blisted\b/i },
  { label: '"throughout"', rx: /\bthroughout\b/i },
  { label: '"experience includes"', rx: /\bexperience includes\b/i },
];

function expectNoForbidden(text: string, names: string[] = []) {
  for (const { label, rx } of FORBIDDEN) {
    expect(rx.test(text), `summary should not contain ${label}: "${text}"`).toBe(false);
  }
  for (const name of names) {
    for (const token of name.split(/\s+/)) {
      if (token.length >= 2) {
        expect(
          new RegExp(`\\b${token}\\b`, "i").test(text),
          `summary should not contain candidate name token "${token}": "${text}"`,
        ).toBe(false);
      }
    }
  }
}

describe("enforceSummaryVoice — implied first person hardening", () => {
  it("strips the candidate's name from a third-person opener", () => {
    const out = enforceSummaryVoice("Demetri brings a track record of operational leadership.", {
      names: ["Demetri Simpson"],
    });
    expectNoForbidden(out, ["Demetri Simpson"]);
  });

  it('removes "the candidate" narration', () => {
    const out = enforceSummaryVoice("The candidate demonstrates strong analytical and compliance skills.");
    expectNoForbidden(out);
    expect(out).toMatch(/^Demonstrates strong analytical/);
  });

  it("removes possessive third-person pronouns and resume narration", () => {
    const out = enforceSummaryVoice("His work history shows leadership across regulated environments.");
    expectNoForbidden(out);
  });

  it('removes "is listed throughout ... work history" narration', () => {
    const out = enforceSummaryVoice("Microsoft Excel is listed throughout his work history.");
    expectNoForbidden(out);
    expect(out).toMatch(/Microsoft Excel/);
  });

  it("removes resume self-reference", () => {
    const out = enforceSummaryVoice("The resume shows experience includes case management and audits.");
    expectNoForbidden(out);
  });

  it("scrubs first and last name tokens anywhere in the text", () => {
    const out = enforceSummaryVoice(
      "Jane Doe led discrepancy investigations; Jane also owned compliance documentation.",
      { names: ["Jane Doe"] },
    );
    expectNoForbidden(out, ["Jane Doe"]);
  });

  it("handles every forbidden pronoun form", () => {
    const out = enforceSummaryVoice(
      "He led the team. She managed audits. They coordinated reviews. His scope grew; her impact was clear; their results held.",
    );
    expectNoForbidden(out);
  });

  it("preserves a clean implied-first-person summary unchanged", () => {
    const good =
      "Operations professional experienced in high-volume case management, discrepancy investigation, compliance documentation, and cross-functional communication across government and healthcare environments.";
    const out = enforceSummaryVoice(good);
    expect(out).toBe(good);
    expectNoForbidden(out);
  });

  it("preserves a second clean example without over-stripping", () => {
    const good =
      "Claims examiner experienced managing complex eligibility reviews, audit-ready documentation, and high-volume case resolution while maintaining accuracy in compliance-driven environments.";
    const out = enforceSummaryVoice(good);
    expect(out).toBe(good);
    expectNoForbidden(out);
  });

  it("returns empty string for empty or non-string input", () => {
    expect(enforceSummaryVoice("")).toBe("");
    // @ts-expect-error testing runtime guard against non-string
    expect(enforceSummaryVoice(null)).toBe("");
  });

  it("ends with a single clean terminal period after repairs", () => {
    const out = enforceSummaryVoice("They managed audits ,  and reviewed compliance .");
    expect(out.endsWith(".")).toBe(true);
    expect(out).not.toMatch(/\s\./);
    expectNoForbidden(out);
  });
});
