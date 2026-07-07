import { describe, it, expect } from "vitest";
import {
  splitSentencesSafe,
  validateCoverLetterIntegrity,
  maskTimeAbbreviations,
  repairBrokenDomainSpacing,
  stripMidBodyContactCta,
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

  it("does not split Signalyz.ai when segmenting sentences", () => {
    const text = "I built Signalyz.ai from concept to production. It ships today.";
    const sentences = splitSentencesSafe(text);
    expect(sentences[0]).toContain("Signalyz.ai");
    expect(sentences).toHaveLength(2);
  });

  it("repairs Signalyz. ai spacing", () => {
    expect(repairBrokenDomainSpacing("Built Signalyz. ai end to end.")).toBe(
      "Built Signalyz.ai end to end.",
    );
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

  it("rejects mid-body contact CTA and stripMidBodyContactCta removes it", () => {
    const bad =
      "I built Signalyz.ai for this apprenticeship. I'd welcome a conversation — feel free to reach out at 908-530-8246 or demetri@example.com. At NJDOL I managed casework.";
    const { ok, issues } = validateCoverLetterIntegrity(bad);
    expect(ok).toBe(false);
    expect(issues.join(" ")).toMatch(/mid-body contact CTA|mid-body email/i);
    expect(stripMidBodyContactCta(bad)).not.toMatch(/feel free to reach out at/i);
  });

  it("rejects dangling email fragments glued to sentence endings", () => {
    const bad =
      "I'd welcome a conversation about whether this apprenticeship is the right fit.Simpson.work@gmail.com";
    const { ok, issues } = validateCoverLetterIntegrity(bad);
    expect(ok).toBe(false);
    expect(issues.join(" ")).toMatch(/dangling email|mid-body email/i);
    expect(stripMidBodyContactCta(bad)).not.toMatch(/Simpson\.work@gmail\.com/i);
  });
});
