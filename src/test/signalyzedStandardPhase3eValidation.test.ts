// @vitest-environment node
/**
 * Phase 3E production-like validation — five fixtures with bullet preservation guard.
 */
import { describe, it, expect } from "vitest";
import { runResumeQa, calibratedResumeToPlainText } from "@signalyz/resumeQaEngine";
import { buildSanitizedQaLog } from "@signalyz/resumeQaEngine/shadowIntegration";
import { applyLinkPreservationGuard } from "@signalyz/resumeAst/linkPreservation";
import { applyBulletPreservationGuard } from "@signalyz/resumeAst/bulletPreservation";
import { evaluateSignalyzedStandard } from "@/lib/signalyzedStandard/evaluateSignalyzedStandard";
import { STANDARD_CODES } from "@/lib/signalyzedStandard/diagnosticCodes";
import {
  toQaShadowSummary,
  toBulletPreservationSummary,
  toLinkPreservationSummary,
} from "@/lib/signalyzedStandard/adapters";
import { buildSignalyzedDashboardMetrics } from "@/lib/signalyzedStandard/aggregates";
import {
  assertNoPiiInStandardPayload,
  toSignalyzedStandardEventRow,
} from "@/lib/signalyzedStandard/sanitizeStandardAudit";
import {
  DEMETRI_AI_ENGINEER_SOURCE_RESUME,
  DEMETRI_CONTAMINATED_GENERATED_RESUME,
  FULL_STACK_AI_ENGINEER_JD,
  TARGET_ROLE_LABEL,
} from "@/test/fixtures/resumeQa/demetriAiEngineerFixtures";
import type { CalibratedResumePlainShape } from "@signalyz/resumeQaEngine/shadowIntegration";

const CASES = [
  {
    id: "demetri-ai-engineer",
    label: "Demetri AI Engineer",
    source: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
    jd: FULL_STACK_AI_ENGINEER_JD,
    targetRole: TARGET_ROLE_LABEL,
    resume: {
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
            "Built a production AI platform that parses resumes for hiring workflows.",
            "Designed REST APIs backed by PostgreSQL with OAuth and Git-based CI/CD.",
          ],
        },
      ],
      skills: ["React", "TypeScript", "Node.js", "PostgreSQL"],
    } satisfies CalibratedResumePlainShape,
  },
  {
    id: "customer-success",
    label: "Customer Success",
    source: `Taylor Morgan\nCustomer Success Manager | Chicago, IL\nSummary: CSM with retention and QBRs.\nExperience: CSM at Relay SaaS — managed 60 accounts with 94% retention.\nSkills: Salesforce, Gainsight`,
    jd: "Customer Success Manager — retention, QBRs, CRM, enterprise accounts.",
    targetRole: "Customer Success Manager",
    resume: {
      header: { name: "Taylor Morgan", title: "Customer Success Manager", location: "Chicago, IL" },
      summary: "CSM with 6+ years driving retention and QBRs.",
      experience: [
        {
          title: "Customer Success Manager",
          company: "Relay SaaS",
          dates: "2021 – Present",
          bullets: ["Managed 60 enterprise accounts with 94% gross retention."],
        },
      ],
      skills: ["Salesforce", "Gainsight"],
    } satisfies CalibratedResumePlainShape,
  },
  {
    id: "technical-github",
    label: "Technical GitHub/portfolio",
    source: `Jordan Lee\nSoftware Engineer | Seattle, WA | github.com/jlee-dev\nBuilt REST APIs in Go and PostgreSQL.`,
    jd: "Senior Software Engineer — Go, PostgreSQL, REST APIs.",
    targetRole: "Senior Software Engineer",
    resume: {
      header: {
        name: "Jordan Lee",
        title: "Software Engineer",
        github: "github.com/jlee-dev",
        location: "Seattle, WA",
      },
      summary: "Backend engineer building reliable APIs.",
      experience: [
        {
          title: "Senior Software Engineer",
          company: "Northwind Systems",
          dates: "2020 – Present",
          bullets: ["Built REST APIs in Go and PostgreSQL."],
        },
      ],
      skills: ["Go", "PostgreSQL"],
    } satisfies CalibratedResumePlainShape,
  },
  {
    id: "non-technical",
    label: "Non-technical",
    source: `Pat Rivera\nAccount Manager | Denver, CO\nOwned renewal and expansion for 40 SMB accounts.`,
    jd: "Account Manager — renewals, CRM.",
    targetRole: "Account Manager",
    resume: {
      header: { name: "Pat Rivera", title: "Account Manager", location: "Denver, CO" },
      summary: "Relationship manager for mid-market SaaS accounts.",
      experience: [
        {
          title: "Account Manager",
          company: "Horizon Tools",
          dates: "2019 – Present",
          bullets: ["Owned renewal and expansion for 40 SMB accounts."],
        },
      ],
      skills: ["CRM", "renewals"],
    } satisfies CalibratedResumePlainShape,
  },
  {
    id: "link-dropped",
    label: "Previously link-dropped resume",
    source: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
    jd: FULL_STACK_AI_ENGINEER_JD,
    targetRole: TARGET_ROLE_LABEL,
    resume: {
      header: { name: "Demetri Simpson", title: "Full Stack / AI Engineer", location: "Newark, NJ" },
      summary: "Full stack engineer building production AI platforms.",
      experience: [
        {
          title: "Founding Engineer",
          company: "Signalyz",
          dates: "2022 – Present",
          bullets: ["Built a production AI platform that parses resumes for hiring workflows."],
        },
      ],
      skills: ["React", "TypeScript"],
    } satisfies CalibratedResumePlainShape,
  },
];

function evaluateCase(c: (typeof CASES)[number]) {
  const requestId = `phase3e-${c.id}`;
  const link = applyLinkPreservationGuard({ sourceResumeText: c.source, resume: c.resume, requestId });
  const bullet = applyBulletPreservationGuard({ sourceResumeText: c.source, resume: link.resume, requestId });
  const plain = calibratedResumeToPlainText(bullet.resume as CalibratedResumePlainShape);
  const qaResult = runResumeQa({
    sourceResumeText: c.source,
    jobDescriptionText: c.jd,
    generatedResumeText: plain,
    targetRoleLabel: c.targetRole,
    requestId,
  });
  const qaSummary = toQaShadowSummary(buildSanitizedQaLog({ requestId, targetRoleLabel: c.targetRole }, qaResult));
  const standard = evaluateSignalyzedStandard({
    requestId,
    exportId: `exp-${requestId}`,
    exportType: "docx",
    qa: qaSummary,
    link: toLinkPreservationSummary(link.report),
    bullet: toBulletPreservationSummary(bullet.report),
    export: {
      event: "resume_export_validation_report",
      export_id: `exp-${requestId}`,
      export_type: "docx",
      template_version: "1.0.0",
      validation_passed: true,
      validation_warning_count: 0,
      validation_error_count: 0,
      link_count: link.report.generated_link_count_after,
      broken_link_count: 0,
      missing_expected_link_count: link.report.preservation_ok ? 0 : 1,
      duplicate_link_count: 0,
      section_count: 4,
      bullet_count: 4,
      page_count: null,
    },
  });
  return { qaResult, qaSummary, bullet, standard, requestId };
}

describe("Phase 3E production-like validation", () => {
  it("five fixtures — no false unsafe from bullet regression, unsupported claim, or identity drift alone", () => {
    const summaries: Array<Record<string, unknown>> = [];
    const rows: ReturnType<typeof toSignalyzedStandardEventRow>[] = [];

    for (const c of CASES) {
      const { qaSummary, bullet, standard, requestId } = evaluateCase(c);
      const row = toSignalyzedStandardEventRow({
        result: standard,
        requestId,
        exportId: `exp-${requestId}`,
        exportType: "docx",
        templateVersion: "1.0.0",
        sourceReports: { qa: qaSummary, bullet: toBulletPreservationSummary(bullet.report) },
      });
      expect(assertNoPiiInStandardPayload(row as unknown as Record<string, unknown>)).toBe(true);
      rows.push(row);

      summaries.push({
        case: c.id,
        label: c.label,
        bullet_restored: bullet.report.restored_bullet_count,
        signalyzed_score: standard.signalyzed_score,
        verdict: standard.verdict,
        hard_blocker_count: standard.hard_blocker_count,
        diagnostic_codes: standard.diagnostic_codes,
      });

      expect(standard.diagnostic_codes).not.toContain(STANDARD_CODES.QA_SEVERE_BULLET_REGRESSION);
      expect(standard.diagnostic_codes).not.toContain(STANDARD_CODES.QA_UNSUPPORTED_CLAIM);
      expect(standard.verdict).not.toBe("unsafe");
      expect(["ready", "needs_review"]).toContain(standard.verdict);
    }

    const dashboard = buildSignalyzedDashboardMetrics(rows);
    console.log("\n=== Phase 3E after-fix standard summaries ===");
    console.log(JSON.stringify({ summaries, dashboard }, null, 2));

    expect(dashboard.unsafe_pct).toBe(0);
  });

  it("true blocker controls remain unsafe", () => {
    const contaminated = runResumeQa({
      sourceResumeText: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
      jobDescriptionText: FULL_STACK_AI_ENGINEER_JD,
      generatedResumeText: DEMETRI_CONTAMINATED_GENERATED_RESUME,
      targetRoleLabel: TARGET_ROLE_LABEL,
    });
    const qaSummary = toQaShadowSummary(
      buildSanitizedQaLog({ targetRoleLabel: TARGET_ROLE_LABEL }, contaminated),
    );
    const standard = evaluateSignalyzedStandard({
      requestId: "control-contaminated",
      exportId: "exp-control",
      exportType: "docx",
      qa: qaSummary,
      export: {
        event: "resume_export_validation_report",
        export_id: "exp-control",
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
    expect(standard.verdict).toBe("unsafe");
    expect(standard.diagnostic_codes).toContain(STANDARD_CODES.QA_CROSS_JOB_CONTAMINATION);
    expect(standard.diagnostic_codes).toContain(STANDARD_CODES.QA_ROLE_CONTAMINATION);
  });
});
