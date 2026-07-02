import { describe, it, expect } from "vitest";
import {
  splitSentencesSafe,
  validateCoverLetterIntegrity,
  maskTimeAbbreviations,
} from "../../supabase/functions/_shared/coverLetterIntegrity";

describe("splitSentencesSafe — time abbreviation protection (Phase 9.14)", () => {
  it("does not split 2 a.m. into orphan fragments", () => {
    const text =
      "Production systems misbehave at 2 a.m. And someone has to own the diagnosis.";
    const sentences = splitSentencesSafe(text);
    expect(sentences).toHaveLength(2);
    expect(sentences[0]).toMatch(/2 a\.m\./i);
    expect(sentences[1]).toMatch(/^And someone has to own the diagnosis\./);
  });

  it("preserves 7 p.m. in a single sentence", () => {
    const text = "We shipped the fix before 7 p.m. on Friday.";
    const sentences = splitSentencesSafe(text);
    expect(sentences).toHaveLength(1);
    expect(sentences[0]).toContain("7 p.m.");
  });

  it("round-trips maskTimeAbbreviations", () => {
    const input = "Alerts fire at 2 a.m. and again at 7 p.m.";
    const { masked, unmask } = maskTimeAbbreviations(input);
    expect(masked).not.toContain("a.m.");
    expect(unmask(masked)).toBe(input);
  });
});

describe("validateCoverLetterIntegrity (Phase 9.14)", () => {
  it("rejects orphan fragment paragraphs", () => {
    const bad = "n. And someone has to own the diagnosis.";
    const { ok, issues } = validateCoverLetterIntegrity(bad);
    expect(ok).toBe(false);
    expect(issues.join(" ")).toMatch(/orphan fragment/i);
  });

  it('rejects broken "at 2 a." abbreviation', () => {
    const bad = "Production systems misbehave at 2 a.";
    const { ok, issues } = validateCoverLetterIntegrity(bad);
    expect(ok).toBe(false);
    expect(issues.join(" ")).toMatch(/broken time abbreviation/i);
  });

  it("rejects split a.m. across lines", () => {
    const bad = "We deploy at 2 a.\n\nm. when traffic is lowest.";
    const { ok, issues } = validateCoverLetterIntegrity(bad);
    expect(ok).toBe(false);
    expect(issues.some((i) => /split time abbreviation/i.test(i))).toBe(true);
  });

  it("rejects cleanup artifacts", () => {
    expect(validateCoverLetterIntegrity("Result was undefined.").ok).toBe(false);
    expect(validateCoverLetterIntegrity("Value was null.").ok).toBe(false);
    expect(validateCoverLetterIntegrity("[object Object]").ok).toBe(false);
  });

  it("accepts clean text with intact time abbreviations", () => {
    const good =
      "Production systems misbehave at 2 a.m. And someone has to own the diagnosis.\n\nI built Signalyz as a production AI SaaS.";
    const { ok, issues } = validateCoverLetterIntegrity(good);
    expect(issues).toEqual([]);
    expect(ok).toBe(true);
  });
});
