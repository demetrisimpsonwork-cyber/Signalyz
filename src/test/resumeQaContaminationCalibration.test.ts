/**
 * Phase 3D — contamination precision calibration.
 *
 * Root cause: calibratedResumeToPlainText() places location as last contact field
 * before Summary. Flattened regex mining produced phantom phrases like
 * "nj summary founding". Line-by-line mining + artifact classifier fixes this.
 */
import { describe, expect, it } from "vitest";
import { runResumeQa, calibratedResumeToPlainText } from "@signalyz/resumeQaEngine";
import { evaluateSignalyzedStandard } from "@/lib/signalyzedStandard/evaluateSignalyzedStandard";
import { STANDARD_CODES } from "@/lib/signalyzedStandard/diagnosticCodes";
import { toQaShadowSummary } from "@/lib/signalyzedStandard/adapters";
import {
  assertNoPiiInStandardPayload,
  toSignalyzedStandardEventRow,
} from "@/lib/signalyzedStandard/sanitizeStandardAudit";
import { buildSanitizedQaLog } from "@signalyz/resumeQaEngine/shadowIntegration";
import {
  DEMETRI_AI_ENGINEER_SOURCE_RESUME,
  DEMETRI_CONTAMINATED_GENERATED_RESUME,
  FULL_STACK_AI_ENGINEER_JD,
  TARGET_ROLE_LABEL,
} from "@/test/fixtures/resumeQa/demetriAiEngineerFixtures";
import type { CalibratedResumePlainShape } from "@signalyz/resumeQaEngine/shadowIntegration";

const CUSTOMER_SUCCESS_RESUME: CalibratedResumePlainShape = {
  header: {
    name: "Taylor Morgan",
    title: "Customer Success Manager",
    email: "taylor.morgan@example.com",
    location: "Chicago, IL",
    linkedin: "linkedin.com/in/taylormorgan",
  },
  summary: "CSM with 6+ years driving retention, QBRs, and CRM hygiene.",
  experience: [
    {
      title: "Customer Success Manager",
      company: "Relay SaaS",
      dates: "2021 – Present",
      bullets: ["Managed 60 enterprise accounts with 94% gross retention."],
    },
  ],
  skills: ["Salesforce", "Gainsight", "QBR facilitation"],
};

const JD_CSM = "Customer Success Manager — retention, QBRs, CRM, enterprise accounts.";

function runStandardForPlainText(
  source: string,
  jd: string,
  generatedPlain: string,
  targetRole: string,
  requestId: string,
) {
  const qaResult = runResumeQa({
    sourceResumeText: source,
    jobDescriptionText: jd,
    generatedResumeText: generatedPlain,
    targetRoleLabel: targetRole,
    requestId,
  });
  const qaLog = buildSanitizedQaLog({ requestId, targetRoleLabel: targetRole }, qaResult);
  const qaSummary = toQaShadowSummary(qaLog);

  return {
    qaResult,
    standard: evaluateSignalyzedStandard({
      requestId,
      exportId: `exp-${requestId}`,
      exportType: "docx",
      qa: qaSummary,
      export: {
        event: "resume_export_validation_report",
        export_id: `exp-${requestId}`,
        export_type: "docx",
        template_version: "1.0.0",
        validation_passed: true,
        validation_warning_count: 0,
        validation_error_count: 0,
        link_count: 1,
        broken_link_count: 0,
        missing_expected_link_count: 0,
        duplicate_link_count: 0,
        section_count: 4,
        bullet_count: 4,
        page_count: null,
      },
    }),
    qaLog,
  };
}

describe("Phase 3D contamination precision", () => {
  it("does not flag nj summary founding from calibratedResumeToPlainText serialization", () => {
    const plain = calibratedResumeToPlainText({
      header: {
        name: "Demetri Simpson",
        title: "Full Stack / AI Engineer",
        email: "demetri@example.com",
        github: "github.com/demetrisimpson",
        location: "Newark, NJ",
      },
      summary: "Full stack engineer building production AI platforms.",
      experience: [
        {
          title: "Founding Engineer",
          company: "Signalyz",
          dates: "2022 – Present",
          bullets: ["Built REST APIs in TypeScript and Node.js."],
        },
      ],
      skills: ["React", "TypeScript", "Node.js"],
    });

    const result = runResumeQa({
      sourceResumeText: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
      jobDescriptionText: FULL_STACK_AI_ENGINEER_JD,
      generatedResumeText: plain,
      targetRoleLabel: TARGET_ROLE_LABEL,
    });

    const contamination = [...result.criticalIssues, ...result.warnings].filter(
      (i) => i.code === "cross_jd_contamination",
    );
    const phantom = contamination.filter((i) =>
      (i.matchedTerms ?? []).some((t) => /nj summary founding|nj summary full/i.test(t)),
    );
    expect(phantom).toHaveLength(0);
  });

  it("Demetri AI Engineer calibrated export is ready or needs_review, not unsafe", () => {
    const plain = calibratedResumeToPlainText({
      header: {
        name: "Demetri Simpson",
        title: "Full Stack / AI Engineer",
        email: "demetri@example.com",
        github: "github.com/demetrisimpson",
        location: "Newark, NJ",
      },
      summary: "Full stack engineer building production AI platforms with React and Node.js.",
      experience: [
        {
          title: "Founding Engineer",
          company: "Signalyz",
          dates: "2022 – Present",
          bullets: [
            "Built a production AI platform using React, TypeScript, Node.js, and Python.",
            "Designed REST APIs backed by PostgreSQL with OAuth and Git-based CI/CD.",
          ],
        },
      ],
      skills: ["React", "TypeScript", "Node.js", "PostgreSQL", "REST APIs"],
    });

    const { standard } = runStandardForPlainText(
      DEMETRI_AI_ENGINEER_SOURCE_RESUME,
      FULL_STACK_AI_ENGINEER_JD,
      plain,
      TARGET_ROLE_LABEL,
      "phase3d-demetri",
    );

    expect(standard.verdict).not.toBe("unsafe");
    expect(standard.diagnostic_codes).not.toContain(STANDARD_CODES.QA_CROSS_JOB_CONTAMINATION);
    expect(["ready", "needs_review"]).toContain(standard.verdict);
  });

  it("Customer Success calibrated export is ready or needs_review, not unsafe", () => {
    const plain = calibratedResumeToPlainText(CUSTOMER_SUCCESS_RESUME);
    const { standard } = runStandardForPlainText(
      plain,
      JD_CSM,
      plain,
      "Customer Success Manager",
      "phase3d-csm",
    );

    expect(standard.verdict).not.toBe("unsafe");
    expect(standard.diagnostic_codes).not.toContain(STANDARD_CODES.QA_CROSS_JOB_CONTAMINATION);
    expect((standard.diagnostic_codes ?? []).filter((c) => c.includes("CONTAMINATION_ARTIFACT")).length).toBe(0);
  });

  it("artifact contamination maps to warning only in Signalyzed Standard", () => {
    const standard = evaluateSignalyzedStandard({
      requestId: "artifact-warn",
      exportId: "exp-artifact",
      exportType: "docx",
      qa: {
        event: "resume_qa_shadow_report",
        qa_score: 70,
        verdict: "needs_review",
        critical_issue_count: 0,
        warning_count: 1,
        issue_categories: { contamination: 1 },
        issue_logs: [
          {
            rule_id: "contamination.section_artifact",
            code: "cross_jd_contamination",
            confidence: "low",
            severity: "medium",
            matched_terms: ["nj summary founding"],
            contamination_subtype: "summary_artifact",
          },
        ],
      },
      export: {
        event: "resume_export_validation_report",
        export_id: "exp-artifact",
        export_type: "docx",
        template_version: "1.0.0",
        validation_passed: true,
        validation_warning_count: 0,
        validation_error_count: 0,
        link_count: 1,
        broken_link_count: 0,
        missing_expected_link_count: 0,
        duplicate_link_count: 0,
        section_count: 4,
        bullet_count: 4,
        page_count: null,
      },
    });

    expect(standard.verdict).not.toBe("unsafe");
    expect(standard.diagnostic_codes).toContain(STANDARD_CODES.QA_CONTAMINATION_ARTIFACT);
    expect(standard.diagnostic_codes).not.toContain(STANDARD_CODES.QA_CROSS_JOB_CONTAMINATION);
  });

  it("AI Sandbox contamination still unsafe", () => {
    const { standard } = runStandardForPlainText(
      DEMETRI_AI_ENGINEER_SOURCE_RESUME,
      FULL_STACK_AI_ENGINEER_JD,
      DEMETRI_CONTAMINATED_GENERATED_RESUME,
      TARGET_ROLE_LABEL,
      "phase3d-sandbox",
    );

    expect(standard.verdict).toBe("unsafe");
    expect(standard.diagnostic_codes).toContain(STANDARD_CODES.QA_CROSS_JOB_CONTAMINATION);
  });

  it("model outputs under NJ DOL still unsafe", () => {
    const { standard } = runStandardForPlainText(
      DEMETRI_AI_ENGINEER_SOURCE_RESUME,
      FULL_STACK_AI_ENGINEER_JD,
      DEMETRI_CONTAMINATED_GENERATED_RESUME,
      TARGET_ROLE_LABEL,
      "phase3d-njdol",
    );

    expect(standard.verdict).toBe("unsafe");
    expect(standard.diagnostic_codes).toContain(STANDARD_CODES.QA_ROLE_CONTAMINATION);
  });

  it("parses resumes severe regression still unsafe", () => {
    const { standard } = runStandardForPlainText(
      DEMETRI_AI_ENGINEER_SOURCE_RESUME,
      FULL_STACK_AI_ENGINEER_JD,
      DEMETRI_CONTAMINATED_GENERATED_RESUME,
      TARGET_ROLE_LABEL,
      "phase3d-bullet",
    );

    expect(standard.verdict).toBe("unsafe");
    expect(standard.diagnostic_codes).toContain(STANDARD_CODES.QA_SEVERE_BULLET_REGRESSION);
  });

  it("no raw content in standard audit rows", () => {
    const plain = calibratedResumeToPlainText(CUSTOMER_SUCCESS_RESUME);
    const { standard } = runStandardForPlainText(plain, JD_CSM, plain, "Customer Success Manager", "phase3d-pii");
    const row = toSignalyzedStandardEventRow({
      result: standard,
      requestId: "phase3d-pii",
      exportId: "exp-pii",
      exportType: "docx",
      templateVersion: "1.0.0",
      sourceReports: { qa: toQaShadowSummary(buildSanitizedQaLog({ requestId: "phase3d-pii", targetRoleLabel: "CSM" }, runResumeQa({ sourceResumeText: plain, jobDescriptionText: JD_CSM, generatedResumeText: plain, targetRoleLabel: "CSM" }))) },
    });
    expect(assertNoPiiInStandardPayload(row as unknown as Record<string, unknown>)).toBe(true);
  });
});
