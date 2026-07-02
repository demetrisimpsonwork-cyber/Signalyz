import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * These tests assert the cover-letter prompt directives in the edge function
 * source. They read the file as text (the edge module targets Deno and cannot
 * be imported directly here) and verify the Phase 9.10 human-narrative rules
 * are present, so a regression that softens the prompt is caught in CI.
 */
const PROMPT_SOURCE = readFileSync(
  resolve(process.cwd(), "supabase/functions/generate-pro-content/index.ts"),
  "utf8",
);

describe("cover letter prompt — human narrative lock (Phase 9.10)", () => {
  it("discourages repeated employer-name paragraph openings", () => {
    expect(PROMPT_SOURCE).toContain("do NOT start multiple paragraphs with");
    expect(PROMPT_SOURCE).toContain("At most ONE paragraph may open with an employer name");
    expect(PROMPT_SOURCE).toMatch(/do NOT repeat any single employer name more than twice/i);
  });

  it("injects role-aware emphasis, not only CarMax-specific guidance (Phase 9.12)", () => {
    // The prompt injects a computed role-style block rather than hard-coding one role.
    expect(PROMPT_SOURCE).toContain("ROLE-AWARE EMPHASIS");
    expect(PROMPT_SOURCE).toContain("detectRoleCategory");
    expect(PROMPT_SOURCE).toContain("roleStyleGuidance");
    expect(PROMPT_SOURCE).toMatch(/from "\.\.\/_shared\/coverLetterRoleStyle\.ts"/);
    // The generalized fabrication rule now references the role-aware block and
    // frames automotive/SaaS/technical claims as examples, not the only case.
    expect(PROMPT_SOURCE).toMatch(/honor the ROLE-AWARE EMPHASIS block/i);
    expect(PROMPT_SOURCE).toMatch(/For a SaaS role|For a technical role/i);
  });

  it("still requires one real work story and a single honest gap sentence", () => {
    expect(PROMPT_SOURCE).toContain("P2 — ONE FOCUSED PROOF");
    expect(PROMPT_SOURCE).toMatch(/ONE focused work example/i);
    expect(PROMPT_SOURCE).toContain("P3 — HONEST GAP + BRIDGE");
    expect(PROMPT_SOURCE).toMatch(/name the (?:main )?gap honestly in ONE plain sentence/i);
  });

  it("requires a 4-paragraph human narrative structure", () => {
    expect(PROMPT_SOURCE).toContain("a human narrative in exactly 4 concise paragraphs");
    expect(PROMPT_SOURCE).toContain("P1 — WHY THIS ROLE FITS");
    expect(PROMPT_SOURCE).toContain("P2 — ONE FOCUSED PROOF");
    expect(PROMPT_SOURCE).toContain("P3 — HONEST GAP + BRIDGE");
    expect(PROMPT_SOURCE).toContain("P4 — COMPANY MOTIVATION + CLOSE");
  });

  it("forbids evidence dumping and the 'this role requires X, I have Y' formula", () => {
    expect(PROMPT_SOURCE).toMatch(/not an evidence dump|do NOT stack multiple jobs|dump a list/i);
    expect(PROMPT_SOURCE).toMatch(/this role requires X, I have Y/i);
  });

  it("bans the weak / formulaic phrase patterns (Phase 9.11)", () => {
    expect(PROMPT_SOURCE).toContain("BANNED WEAK / FORMULAIC PATTERNS");
    for (const phrase of [
      "One example reflects",
      "That pattern",
      "This demonstrates",
      "The role demands",
      "the kind of operational discipline",
      "environment I'm built for",
      "model depends on",
      "where that approach holds up",
    ]) {
      expect(PROMPT_SOURCE).toContain(phrase);
    }
  });

  it("keeps the domain-claim guardrails intact", () => {
    expect(PROMPT_SOURCE).toMatch(
      /appraisal.*inventory.*reconciliation|inventory check-in\/scanning\/reconciliation/i,
    );
    expect(PROMPT_SOURCE).toMatch(/ZERO fabricated (sales|domain-specific)/i);
  });
});

describe("cover letter quality retry prompt — final reviewer (Phase 9.13)", () => {
  it("scopes the single retry to sentence-quality fixes only", () => {
    expect(PROMPT_SOURCE).toContain("fix sentence-quality issues only");
    expect(PROMPT_SOURCE).toContain("Keep the same facts, structure, and evidence");
    expect(PROMPT_SOURCE).toContain(
      "Do not add new experience, claims, tools, metrics, or domain knowledge",
    );
    expect(PROMPT_SOURCE).toContain("plainer, cleaner, and more human");
    expect(PROMPT_SOURCE).toContain("Fix dangling em-dash asides");
    expect(PROMPT_SOURCE).toContain("comma splices before main verbs");
    expect(PROMPT_SOURCE).toContain("over-stylized AI-sounding phrases");
    expect(PROMPT_SOURCE).toContain("Prefer direct sentences over abstract phrasing");
  });

  it("keeps exactly one corrective retry (no second AI reviewer)", () => {
    // A single revision prompt string, used by one extra callAI in the try block.
    const revisionMatches = PROMPT_SOURCE.match(/const revisionPrompt =/g) || [];
    expect(revisionMatches.length).toBe(1);
  });
});

describe("cover letter prompt — technical evidence + severe gap (Phase 9.14)", () => {
  it("injects technical evidence priority and severe-gap realism for AI roles", () => {
    expect(PROMPT_SOURCE).toContain("buildTechnicalEvidencePriorityBlock");
    expect(PROMPT_SOURCE).toContain("buildSevereGapRealismBlock");
    expect(PROMPT_SOURCE).toContain("detectSevereTechnicalGap");
    expect(PROMPT_SOURCE).toContain("technicalRoleStructureBlock");
    expect(PROMPT_SOURCE).toContain("validateCoverLetterIntegrity");
  });

  it("passes resume text into the quality gate", () => {
    expect(PROMPT_SOURCE).toContain("resumeText: experience");
    expect(PROMPT_SOURCE).toContain("severeTechnicalGap");
  });
});
