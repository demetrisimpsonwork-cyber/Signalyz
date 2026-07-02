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

describe("analyzeCoverLetterQuality — sentence-level grammar defects (Phase 9.13)", () => {
  it('flags a comma splice before "reflects" ("guidance, reflects")', () => {
    const { ok, issues } = analyzeCoverLetterQuality(
      "The way I offer no-pressure guidance, reflects the discipline this role needs.",
    );
    expect(ok).toBe(false);
    expect(issues.join(" ")).toMatch(/comma splice before a main verb/i);
  });

  it('flags a comma splice before "reflects" ("requirements, reflects")', () => {
    const { ok, issues } = analyzeCoverLetterQuality(
      "Managing distinct requirements, reflects the accuracy this work demands.",
    );
    expect(ok).toBe(false);
    expect(issues.join(" ")).toMatch(/comma splice before a main verb/i);
  });

  it('flags a comma splice before a linking verb ("while research moves fast, is")', () => {
    const { ok, issues } = analyzeCoverLetterQuality(
      "The pace of change, while research moves fast, is a specific and interesting problem.",
    );
    expect(ok).toBe(false);
    expect(issues.join(" ")).toMatch(/comma splice before a linking verb/i);
  });

  it("flags a dangling em-dash aside before a main verb", () => {
    const { ok, issues } = analyzeCoverLetterQuality(
      "That habit of accuracy — a discipline I carry everywhere, reflects how I work.",
    );
    expect(ok).toBe(false);
    expect(issues.join(" ")).toMatch(/dangling em-dash aside before a main verb/i);
  });
});

describe("analyzeCoverLetterQuality — over-stylized phrasing (Phase 9.13)", () => {
  it("flags over-stylized filler phrases", () => {
    expect(analyzeCoverLetterQuality("This role sits in the operational layer of the business.").ok).toBe(false);
    expect(analyzeCoverLetterQuality("It matches my mental architecture perfectly.").ok).toBe(false);
    expect(
      analyzeCoverLetterQuality("This is a specific and interesting problem I want to solve.").ok,
    ).toBe(false);
  });

  it("flags technical filler for a NON-technical role", () => {
    expect(
      analyzeCoverLetterQuality("Their orchestration layer is impressive.", {
        roleCategory: "customer_service_retail_ops",
      }).ok,
    ).toBe(false);
    expect(
      analyzeCoverLetterQuality("I want to work on frontier AI.", {
        roleCategory: "customer_service_retail_ops",
      }).ok,
    ).toBe(false);
  });

  it("does NOT flag legitimate technical terms for a technical role", () => {
    const orch = analyzeCoverLetterQuality(
      "I built the orchestration layer for our deployment pipeline.",
      { roleCategory: "technical_ai_product" },
    );
    expect(orch.issues.some((i) => /orchestration layer/i.test(i))).toBe(false);

    const frontier = analyzeCoverLetterQuality(
      "I want to contribute to frontier AI systems in production.",
      { roleCategory: "technical_ai_product" },
    );
    expect(frontier.issues.some((i) => /frontier ai/i.test(i))).toBe(false);
  });
});

describe("analyzeCoverLetterQuality — honest gap clauses are safe (Phase 9.13)", () => {
  it("does not flag honest gap disclaimers", () => {
    expect(
      analyzeCoverLetterQuality("I have not worked in automotive retail.").issues,
    ).toEqual([]);
    expect(
      analyzeCoverLetterQuality("I have not built agentic AI frameworks or LLM pipelines.").issues,
    ).toEqual([]);
    expect(
      analyzeCoverLetterQuality("I have not owned quota or renewals.").issues,
    ).toEqual([]);
  });
});

describe("analyzeCoverLetterQuality — Phase 9.14 integrity + technical role", () => {
  const signalyzResume = `
    Signalyz — independent AI SaaS product
    Built production AI SaaS with Claude/Anthropic API, Supabase, PostgreSQL, Edge Functions
    RAG, embeddings, vector search, production debugging, Stripe auth exports
  `;

  it("flags low-noise diagnostic thinking and generic production systems demand", () => {
    expect(analyzeCoverLetterQuality("I bring low-noise diagnostic thinking to every incident.").ok).toBe(false);
    expect(analyzeCoverLetterQuality("Production systems demand constant vigilance.").ok).toBe(false);
  });

  it("flags integrity corruption artifacts", () => {
    expect(analyzeCoverLetterQuality("n. And someone has to own the diagnosis.").ok).toBe(false);
    expect(analyzeCoverLetterQuality("Systems fail at 2 a.").ok).toBe(false);
  });

  it("flags NJDOL-centered letter when resume has Signalyz technical evidence", () => {
    const letter = [
      "At the New Jersey Department of Labor, I managed 40–70 concurrent cases daily under strict SLAs.",
      "That volume taught me to diagnose workflow failures quickly and keep customers moving.",
      "I have not built LLM pipelines, but I bring strong operational troubleshooting.",
      "I would welcome a conversation about this Staff AI Engineer role.",
    ].join("\n\n");
    const { ok, issues } = analyzeCoverLetterQuality(letter, {
      roleCategory: "technical_ai_product",
      resumeText: signalyzResume,
    });
    expect(ok).toBe(false);
    expect(issues.join(" ")).toMatch(/technical role letter centers casework/i);
  });

  it("does not flag a Signalyz-led technical letter", () => {
    const letter = [
      "Building Signalyz, a production AI SaaS on Supabase and Claude, is my strongest proof for this Staff AI Engineer role.",
      "I integrated Anthropic APIs, debugged Edge Functions under load, and kept output quality reliable in production.",
      "I have not shipped production ML infrastructure or computer-vision systems, but I can credibly bring adjacent AI product experience.",
      "I would welcome a conversation about how that builder background fits your team.",
    ].join("\n\n");
    const { ok, issues } = analyzeCoverLetterQuality(letter, {
      roleCategory: "technical_ai_product",
      resumeText: signalyzResume,
      severeTechnicalGap: true,
    });
    expect(issues.filter((i) => /centers casework/i.test(i))).toEqual([]);
    expect(ok).toBe(true);
  });

  it("flags fabricated Staff AI claims", () => {
    expect(
      analyzeCoverLetterQuality("I shipped production ML infrastructure at scale.", {
        severeTechnicalGap: true,
      }).ok,
    ).toBe(false);
    expect(
      analyzeCoverLetterQuality("I have computer-vision experience across aerial imagery.", {
        severeTechnicalGap: true,
      }).ok,
    ).toBe(false);
    expect(
      analyzeCoverLetterQuality("I led a team of engineers on enterprise-scale ownership.", {
        severeTechnicalGap: true,
      }).ok,
    ).toBe(false);
    expect(
      analyzeCoverLetterQuality("I built and shipped agentic AI orchestration layers.", {
        severeTechnicalGap: true,
      }).ok,
    ).toBe(false);
  });

  it("allows honest severe-gap sentences for Staff AI roles", () => {
    const gap =
      "I have not shipped production ML infrastructure or computer-vision systems, but my strongest relevant work is building Signalyz.";
    const { issues } = analyzeCoverLetterQuality(gap, { severeTechnicalGap: true });
    expect(issues.filter((i) => /fabricated/i.test(i))).toEqual([]);
  });
});
