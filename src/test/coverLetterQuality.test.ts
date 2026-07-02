import { describe, it, expect } from "vitest";
import { analyzeCoverLetterQuality } from "../../supabase/functions/_shared/coverLetterQuality";

describe("analyzeCoverLetterQuality — weak-pattern detection (Phase 9.11)", () => {
  it('flags the "One example reflects" opener', () => {
    const { ok, issues } = analyzeCoverLetterQuality(
      "One example that reflects how I work: a recurring issue at NJDOL involved stalled cases.",
    );
    expect(ok).toBe(false);
    expect(issues.join(" ")).toMatch(/one example reflects/i);
  });

  it('flags "That pattern"', () => {
    const { ok, issues } = analyzeCoverLetterQuality(
      "That pattern is how I approach every support interaction I take on.",
    );
    expect(ok).toBe(false);
    expect(issues.join(" ")).toMatch(/that pattern/i);
  });

  it("flags other assembled-draft clichés", () => {
    expect(analyzeCoverLetterQuality("This demonstrates my ability to adapt.").ok).toBe(false);
    expect(analyzeCoverLetterQuality("The role demands accuracy and speed.").ok).toBe(false);
    expect(
      analyzeCoverLetterQuality("It maps to the kind of operational discipline this needs.").ok,
    ).toBe(false);
    expect(
      analyzeCoverLetterQuality("It is exactly the environment I'm built for.").ok,
    ).toBe(false);
    expect(analyzeCoverLetterQuality("Their model depends on trust.").ok).toBe(false);
    expect(
      analyzeCoverLetterQuality("A customer environment where that approach holds up.").ok,
    ).toBe(false);
  });
});

describe("analyzeCoverLetterQuality — repeated employer openings (Phase 9.11)", () => {
  it("flags two paragraphs that open with an employer name", () => {
    const letter = [
      "At NJDOL, I managed a high volume of concurrent support cases every day.",
      "At Cyient, I coordinated cross-functional escalations across several teams.",
      "I would welcome a conversation about the role.",
    ].join("\n\n");
    const { ok, issues } = analyzeCoverLetterQuality(letter);
    expect(ok).toBe(false);
    expect(issues.join(" ")).toMatch(/multiple paragraphs open with an employer name/i);
  });

  it("does not flag a single employer-name opener", () => {
    const letter = [
      "Managing 40–70 concurrent cases daily is the core of how I work.",
      "At NJDOL, I owned complex escalations from intake through resolution.",
      "I would welcome a conversation about the role.",
    ].join("\n\n");
    const { issues } = analyzeCoverLetterQuality(letter);
    expect(issues.join(" ")).not.toMatch(/multiple paragraphs open with an employer name/i);
  });
});

describe("analyzeCoverLetterQuality — fabrication guardrails (Phase 9.11)", () => {
  it("flags fabricated appraisal / sales / inventory / repair-order claims", () => {
    expect(analyzeCoverLetterQuality("I performed vehicle appraisals for three years.").ok).toBe(false);
    expect(analyzeCoverLetterQuality("I sold used cars at a high volume.").ok).toBe(false);
    expect(analyzeCoverLetterQuality("My work included inventory reconciliation daily.").ok).toBe(false);
    expect(analyzeCoverLetterQuality("I handled repair orders end to end.").ok).toBe(false);
    expect(analyzeCoverLetterQuality("I have direct appraisal experience.").ok).toBe(false);
  });

  it("does NOT flag an honest gap disclaimer that mentions the same domains", () => {
    const gapClause =
      "I haven't worked in automotive retail, and I have not done vehicle appraisal or inventory reconciliation, but I bring strong process discipline.";
    const { issues } = analyzeCoverLetterQuality(gapClause);
    expect(issues.filter((i) => /fabricated/i.test(i))).toEqual([]);
  });
});

describe("analyzeCoverLetterQuality — clean letter passes (Phase 9.11)", () => {
  it("returns ok for a grounded, varied, 4-paragraph letter", () => {
    const letter = [
      "Managing 40–70 concurrent active cases daily at the New Jersey Department of Labor is the kind of high-volume, accuracy-first work that a customer-facing role at CarMax runs on.",
      "A recurring problem there was customers stalling mid-process because of platform errors they could not interpret. I traced the case history, found the root cause, and explained the fix in plain language, and those cases closed faster.",
      "I have not worked in automotive retail, and I want to be straightforward about that. What I bring is seven years of end-to-end customer workflow management in Salesforce, SAP, and Adobe.",
      "I would welcome a conversation about how my background fits what you're building at the Easton location.",
    ].join("\n\n");
    const { ok, issues } = analyzeCoverLetterQuality(letter);
    expect(issues).toEqual([]);
    expect(ok).toBe(true);
  });

  it("flags more than four paragraphs", () => {
    const letter = ["One.", "Two.", "Three.", "Four.", "Five."].join("\n\n");
    const { ok, issues } = analyzeCoverLetterQuality(letter);
    expect(ok).toBe(false);
    expect(issues.join(" ")).toMatch(/too many paragraphs/i);
  });
});
