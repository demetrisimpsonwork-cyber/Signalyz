import { describe, expect, it } from "vitest";
import {
  applyBulletPreservationGuard,
  assertBulletPreservationReportSafe,
} from "@signalyz/resumeAst/bulletPreservation";
import { runResumeQa } from "@signalyz/resumeQaEngine";
import {
  DEMETRI_AI_ENGINEER_SOURCE_RESUME,
  FULL_STACK_AI_ENGINEER_JD,
  TARGET_ROLE_LABEL,
} from "@/test/fixtures/resumeQa/demetriAiEngineerFixtures";

const WEAKENED_SIGNalyz_RESUME = {
  header: { name: "Demetri Simpson", title: "Full Stack / AI Engineer", location: "Newark, NJ" },
  summary: "Full stack engineer building production AI platforms.",
  experience: [
    {
      title: "Founding Engineer",
      company: "Signalyz",
      dates: "2022 – Present",
      bullets: [
        "Built a production AI platform that parses resumes for hiring workflows.",
        "Designed REST APIs backed by PostgreSQL with OAuth and Git-based CI/CD.",
      ],
    },
  ],
  skills: ["React", "TypeScript", "Node.js"],
};

const RESTORED_EXPECTED_FRAGMENT = /converts resumes and jds into structured outputs/i;

describe("bulletPreservation guard", () => {
  it("detects parses resumes regression before preservation", () => {
    const before = runResumeQa({
      sourceResumeText: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
      jobDescriptionText: FULL_STACK_AI_ENGINEER_JD,
      generatedResumeText: `- Built a production AI platform that parses resumes for hiring workflows.`,
      targetRoleLabel: TARGET_ROLE_LABEL,
    });
    expect(
      before.criticalIssues.some(
        (i) => i.ruleId === "bullet_regression.structured_to_parse" || /parses resumes/i.test((i.matchedTerms ?? []).join(" ")),
      ),
    ).toBe(true);
  });

  it("restores rich Signalyz bullet from source without inventing", () => {
    const { resume, report } = applyBulletPreservationGuard({
      sourceResumeText: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
      resume: WEAKENED_SIGNalyz_RESUME,
      requestId: "bullet-guard-1",
    });

    expect(report.weakened_bullet_count).toBeGreaterThan(0);
    expect(report.restored_bullet_count).toBeGreaterThan(0);
    expect(report.hallucination_guard_passed).toBe(true);
    expect(report.preservation_ok).toBe(true);
    expect(RESTORED_EXPECTED_FRAGMENT.test(resume.experience?.[0]?.bullets?.[0] ?? "")).toBe(true);
    assertBulletPreservationReportSafe(report);
  });

  it("preserved bullet clears severe regression in QA shadow path", () => {
    const { resume } = applyBulletPreservationGuard({
      sourceResumeText: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
      resume: WEAKENED_SIGNalyz_RESUME,
    });

    const plain = [
      resume.header?.name,
      resume.header?.title,
      "",
      "Experience",
      `${resume.experience?.[0]?.title} | ${resume.experience?.[0]?.company} | ${resume.experience?.[0]?.dates}`,
      ...(resume.experience?.[0]?.bullets ?? []).map((b) => `- ${b}`),
    ].join("\n");

    const after = runResumeQa({
      sourceResumeText: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
      jobDescriptionText: FULL_STACK_AI_ENGINEER_JD,
      generatedResumeText: plain,
      targetRoleLabel: TARGET_ROLE_LABEL,
    });

    expect(
      after.criticalIssues.filter(
        (i) =>
          i.ruleId === "bullet_regression.structured_to_parse" ||
          (i.matchedTerms ?? []).some((t) => /parses resumes/i.test(t)),
      ),
    ).toHaveLength(0);
  });

  it("does not create duplicate restored bullets", () => {
    const duplicateResume = {
      ...WEAKENED_SIGNalyz_RESUME,
      experience: [
        {
          ...WEAKENED_SIGNalyz_RESUME.experience![0]!,
          bullets: [
            "Built a production AI platform that parses resumes for hiring workflows.",
            "Built a production AI platform that converts resumes and JDs into structured outputs for hiring workflows.",
          ],
        },
      ],
    };
    const { report } = applyBulletPreservationGuard({
      sourceResumeText: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
      resume: duplicateResume,
    });
    expect(report.duplicate_bullet_count).toBeGreaterThanOrEqual(0);
    expect(report.restored_bullet_count).toBe(0);
  });
});
