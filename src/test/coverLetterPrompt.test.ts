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

  it("keeps the domain-claim guardrails intact", () => {
    expect(PROMPT_SOURCE).toMatch(
      /appraisal.*inventory.*reconciliation|inventory check-in\/scanning\/reconciliation/i,
    );
    expect(PROMPT_SOURCE).toMatch(/ZERO fabricated (sales|domain-specific)/i);
  });
});
