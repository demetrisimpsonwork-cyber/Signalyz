import { describe, expect, it } from "vitest";
import {
  buildResumeAstFromText,
  buildResumeAstObservability,
  buildResumeFingerprintPayload,
  extractAstTextCorpus,
  extractSourceTextCorpus,
  fingerprintResume,
  isResumeAstEnabled,
  normalizeResumeAst,
  parseResumeAst,
  serializeResumeAst,
  validateResumeAst,
} from "@signalyz/resumeAst";
import {
  AI_ENGINEER_RESUME,
  CUSTOMER_SUCCESS_RESUME,
  ENGINEERING_RESUME,
  MALFORMED_RESUME,
  SIMPLE_RESUME,
  TWO_PAGE_RESUME,
} from "@/test/fixtures/resumeAst/resumeAstFixtures";

const FIXTURES = [
  { name: "simple", text: SIMPLE_RESUME },
  { name: "engineering", text: ENGINEERING_RESUME },
  { name: "customer_success", text: CUSTOMER_SUCCESS_RESUME },
  { name: "malformed", text: MALFORMED_RESUME },
  { name: "ai_engineer", text: AI_ENGINEER_RESUME },
  { name: "two_page", text: TWO_PAGE_RESUME },
] as const;

const STRUCTURAL_TOKENS = new Set([
  "summary",
  "professional",
  "experience",
  "projects",
  "education",
  "skills",
  "certifications",
  "awards",
  "links",
  "employment",
  "profile",
  "objective",
  "competencies",
  "technologies",
  "tools",
]);

function tokenize(corpus: string, excludeStructural = false): Set<string> {
  return new Set(
    corpus
      .split(/\s+/)
      .map((t) => t.replace(/[^\w%+#./-]/g, ""))
      .filter((t) => t.length >= 2 && (!excludeStructural || !STRUCTURAL_TOKENS.has(t))),
  );
}

function assertZeroDataLoss(rawText: string): void {
  const { ast } = parseResumeAst(rawText);
  const sourceTokens = tokenize(extractSourceTextCorpus(rawText), true);
  const astTokens = tokenize(extractAstTextCorpus(ast));

  const missing: string[] = [];
  for (const token of sourceTokens) {
    if (!astTokens.has(token)) missing.push(token);
  }

  expect(
    missing,
    `tokens missing from AST corpus: ${missing.slice(0, 10).join(", ")}`,
  ).toHaveLength(0);
}

describe("Resume AST — Initiative 002 Phase 1", () => {
  it("feature flag defaults off", () => {
    expect(isResumeAstEnabled()).toBe(false);
    expect(isResumeAstEnabled("false")).toBe(false);
    expect(isResumeAstEnabled("true")).toBe(true);
    expect(isResumeAstEnabled("1")).toBe(true);
  });

  describe.each(FIXTURES)("$name fixture", ({ text }) => {
    it("parses deterministically", () => {
      const first = parseResumeAst(text);
      const second = parseResumeAst(text);

      expect(first.ast.metadata.fingerprint).toBe(second.ast.metadata.fingerprint);
      expect(first.ast.bullets.map((b) => b.text)).toEqual(second.ast.bullets.map((b) => b.text));
      expect(first.ast.experience.length).toBe(second.ast.experience.length);
    });

    it("keeps fingerprint stable across parses", () => {
      const a = parseResumeAst(text).ast;
      const b = parseResumeAst(text).ast;
      expect(a.metadata.fingerprint).toBeDefined();
      expect(a.metadata.fingerprint).toBe(b.metadata.fingerprint);
    });

    it("round-trips through serialize without losing bullet text", () => {
      const { ast } = parseResumeAst(text);
      const originalBullets = ast.bullets.map((b) => b.text);
      const reparsed = parseResumeAst(serializeResumeAst(ast));
      expect(reparsed.ast.bullets.map((b) => b.text)).toEqual(originalBullets);
    });

    it("preserves substantive content (zero data loss)", () => {
      assertZeroDataLoss(text);
    });
  });

  it("simple resume parses expected structure", () => {
    const { ast } = parseResumeAst(SIMPLE_RESUME);
    expect(ast.header.name).toMatch(/Alex Rivera/i);
    expect(ast.experience).toHaveLength(1);
    expect(ast.experience[0]?.company).toMatch(/BrightPath/i);
    expect(ast.skills.length).toBeGreaterThanOrEqual(2);
    expect(ast.bullets.length).toBeGreaterThanOrEqual(2);
  });

  it("engineering resume extracts technologies and metrics", () => {
    const { ast } = parseResumeAst(ENGINEERING_RESUME);
    expect(ast.experience.length).toBeGreaterThanOrEqual(2);
    const withMetrics = ast.bullets.filter((b) => b.metrics.length > 0);
    expect(withMetrics.length).toBeGreaterThan(0);
    const withTech = ast.bullets.filter((b) => b.technologies.length > 0);
    expect(withTech.length).toBeGreaterThan(0);
  });

  it("customer success resume parses professional summary", () => {
    const { ast } = parseResumeAst(CUSTOMER_SUCCESS_RESUME);
    expect(
      ast.professionalSummary.text.length > 0 || ast.professionalSummary.bullets.length > 0,
    ).toBe(true);
    expect(ast.experience.length).toBeGreaterThanOrEqual(2);
  });

  it("two-page resume captures certifications and projects", () => {
    const { ast } = parseResumeAst(TWO_PAGE_RESUME);
    expect(ast.experience.length).toBeGreaterThanOrEqual(3);
    expect(ast.projects.length).toBeGreaterThanOrEqual(1);
    expect(ast.certifications.length).toBeGreaterThanOrEqual(1);
    expect(ast.education.length).toBeGreaterThanOrEqual(1);
  });

  it("ai engineer resume parses without errors", () => {
    const result = buildResumeAstFromText(AI_ENGINEER_RESUME);
    expect(result.ast.bullets.length).toBeGreaterThan(0);
    expect(result.ast.metadata.fingerprint).toBeDefined();
    expect(result.observability.bullet_count).toBe(result.ast.bullets.length);
  });

  describe("validator accuracy", () => {
    it("flags malformed resume issues", () => {
      const { ast } = parseResumeAst(MALFORMED_RESUME);
      const { diagnostics } = validateResumeAst(ast);
      const codes = diagnostics.map((d) => d.code);
      expect(codes).toContain("header.missing");
      expect(codes.some((c) => c === "bullet.malformed" || c === "bullet.empty")).toBe(true);
      expect(codes).toContain("skills.duplicate");
    });

    it("does not mutate AST during validation", () => {
      const { ast } = parseResumeAst(ENGINEERING_RESUME);
      const before = JSON.stringify(ast);
      validateResumeAst(ast);
      expect(JSON.stringify(ast)).toBe(before);
    });

    it("normalizer does not rewrite bullet meaning", () => {
      const { ast } = parseResumeAst(ENGINEERING_RESUME);
      const normalized = normalizeResumeAst(ast);
      expect(normalized.bullets.map((b) => b.text)).toEqual(ast.bullets.map((b) => b.text));
    });
  });

  describe("observability", () => {
    it("emits counts and fingerprint only — no resume text", () => {
      const parsed = parseResumeAst(ENGINEERING_RESUME);
      const summary = buildResumeAstObservability({
        ast: parsed.ast,
        parseTimeMs: parsed.parseTimeMs,
      });

      expect(summary.bullet_count).toBeGreaterThan(0);
      expect(summary.experience_count).toBeGreaterThan(0);
      expect(summary.fingerprint).toBe(parsed.ast.metadata.fingerprint);
      expect(summary.parse_time_ms).toBeGreaterThanOrEqual(0);

      const serialized = JSON.stringify(summary);
      expect(serialized).not.toMatch(/jordan\.lee@/i);
      expect(serialized).not.toMatch(/Northwind Systems/);
      expect(summary.resume_sections).toContain("experience");
    });
  });

  describe("fingerprints", () => {
    it("changes when bullet text changes", () => {
      const { ast } = parseResumeAst(SIMPLE_RESUME);
      const original = ast.metadata.fingerprint!;
      const mutated = structuredClone(ast);
      if (mutated.bullets[0]) {
        mutated.bullets[0].text = mutated.bullets[0].text + " (edited)";
      }
      const changed = fingerprintResume(buildResumeFingerprintPayload(mutated));
      expect(changed).not.toBe(original);
    });

    it("section fingerprints are stable for same content", () => {
      const a = parseResumeAst(ENGINEERING_RESUME).ast;
      const b = parseResumeAst(ENGINEERING_RESUME).ast;
      expect(a.experience[0]?.fingerprint).toBe(b.experience[0]?.fingerprint);
    });
  });
});
