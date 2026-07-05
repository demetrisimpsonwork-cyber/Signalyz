import { describe, expect, it } from "vitest";
import { runResumeQa } from "@signalyz/resumeQaEngine";
import {
  DEMETRI_AI_ENGINEER_SOURCE_RESUME,
  DEMETRI_CONTAMINATED_GENERATED_RESUME,
  FULL_STACK_AI_ENGINEER_JD,
  TARGET_ROLE_LABEL,
} from "@/test/fixtures/resumeQa/demetriAiEngineerFixtures";

const baseInput = {
  sourceResumeText: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
  jobDescriptionText: FULL_STACK_AI_ENGINEER_JD,
  targetRoleLabel: TARGET_ROLE_LABEL,
  runId: "fixture-run-1",
  requestId: "fixture-req-1",
};

describe("Resume QA Engine v1 — Demetri AI Engineer fixtures", () => {
  it("flags AI Sandbox as cross-JD contamination", () => {
    const result = runResumeQa({
      ...baseInput,
      generatedResumeText: DEMETRI_CONTAMINATED_GENERATED_RESUME,
    });

    const contamination = [
      ...result.criticalIssues,
      ...result.warnings,
    ].filter((i) => i.code === "cross_jd_contamination");

    expect(contamination.some((i) => /ai sandbox/i.test(i.message) || /ai sandbox/i.test(i.evidence ?? ""))).toBe(
      true,
    );
  });

  it("flags model outputs under NJ DOL as role contamination", () => {
    const result = runResumeQa({
      ...baseInput,
      generatedResumeText: DEMETRI_CONTAMINATED_GENERATED_RESUME,
    });

    expect(
      result.roleContamination.some(
        (i) =>
          /model outputs/i.test(i.message) ||
          /model outputs/i.test(i.evidence ?? "") ||
          /njdol|department of labor/i.test(i.section ?? ""),
      ),
    ).toBe(true);
  });

  it("flags parses resumes as bullet regression vs structured outputs source", () => {
    const result = runResumeQa({
      ...baseInput,
      generatedResumeText: DEMETRI_CONTAMINATED_GENERATED_RESUME,
    });

    expect(
      result.bulletRegressions.some(
        (i) =>
          /parses?\s+resumes?/i.test(i.evidence ?? i.message) ||
          /structured output/i.test(i.message),
      ),
    ).toBe(true);
  });

  it("flags removed React/TypeScript/Node/Git/OAuth/Stripe when relevant", () => {
    const result = runResumeQa({
      ...baseInput,
      generatedResumeText: DEMETRI_CONTAMINATED_GENERATED_RESUME,
    });

    const lost = result.keywordLoss.map((i) => (i.evidence ?? "").toLowerCase());
    for (const keyword of ["react", "typescript", "node.js", "git", "oauth", "stripe"]) {
      expect(lost.some((k) => k.includes(keyword.replace(".", "")) || k === keyword)).toBe(true);
    }
  });

  it("returns needs_review or block_regeneration for contaminated generated resume", () => {
    const result = runResumeQa({
      ...baseInput,
      generatedResumeText: DEMETRI_CONTAMINATED_GENERATED_RESUME,
    });

    expect(["needs_review", "block_regeneration"]).toContain(result.verdict);
    expect(result.qaScore).toBeLessThan(70);
    expect(result.criticalIssues.length).toBeGreaterThan(0);
  });

  it("passes or only minor-warns for clean source-as-generated baseline", () => {
    const result = runResumeQa({
      ...baseInput,
      generatedResumeText: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
    });

    expect(result.verdict).toBe("pass");
    expect(result.criticalIssues).toHaveLength(0);
    expect(result.roleContamination).toHaveLength(0);
    expect(result.bulletRegressions).toHaveLength(0);
    expect(
      result.keywordLoss.filter((i) => i.severity === "high" || i.severity === "critical"),
    ).toHaveLength(0);
  });

  it("includes observability summary with run metadata", () => {
    const result = runResumeQa({
      ...baseInput,
      generatedResumeText: DEMETRI_CONTAMINATED_GENERATED_RESUME,
    });

    expect(result.observabilitySummary.runId).toBe("fixture-run-1");
    expect(result.observabilitySummary.requestId).toBe("fixture-req-1");
    expect(result.observabilitySummary.checksRun.length).toBeGreaterThanOrEqual(7);
    expect(result.observabilitySummary.issueCounts.total).toBeGreaterThan(0);
  });
});
