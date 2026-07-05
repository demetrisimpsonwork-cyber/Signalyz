// @vitest-environment node
/**
 * Phase 3D production-like validation — same five fixtures as prod smoke,
 * evaluated locally with updated contamination precision (no deploy).
 */
import { describe, it, expect } from "vitest";
import { runResumeQa, calibratedResumeToPlainText } from "@signalyz/resumeQaEngine";
import { buildSanitizedQaLog } from "@signalyz/resumeQaEngine/shadowIntegration";
import { evaluateSignalyzedStandard } from "@/lib/signalyzedStandard/evaluateSignalyzedStandard";
import { STANDARD_CODES } from "@/lib/signalyzedStandard/diagnosticCodes";
import { toQaShadowSummary } from "@/lib/signalyzedStandard/adapters";
import { buildSignalyzedDashboardMetrics } from "@/lib/signalyzedStandard/aggregates";
import {
  assertNoPiiInStandardPayload,
  toSignalyzedStandardEventRow,
} from "@/lib/signalyzedStandard/sanitizeStandardAudit";
import {
  applyLinkPreservationGuard,
} from "@signalyz/resumeAst/linkPreservation";
import {
  DEMETRI_AI_ENGINEER_SOURCE_RESUME,
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
      summary:
        "Full stack engineer building production AI platforms with React, TypeScript, and Node.js.",
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
      skills: ["React", "TypeScript", "Node.js", "PostgreSQL", "REST APIs", "CI/CD"],
    } satisfies CalibratedResumePlainShape,
  },
  {
    id: "customer-success",
    label: "Customer Success",
    source: `Taylor Morgan
Customer Success Manager | Chicago, IL | taylor.morgan@example.com
Summary: CSM with 6+ years driving retention, QBRs, and CRM hygiene.
Experience: Customer Success Manager at Relay SaaS — managed 60 enterprise accounts with 94% gross retention.
Skills: Salesforce, Gainsight, QBR facilitation`,
    jd: "Customer Success Manager — retention, QBRs, CRM, enterprise accounts, Salesforce, Gainsight.",
    targetRole: "Customer Success Manager",
    resume: {
      header: {
        name: "Taylor Morgan",
        title: "Customer Success Manager",
        email: "taylor.morgan@example.com",
        location: "Chicago, IL",
      },
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
    label: "Technical with GitHub/portfolio",
    source: `Jordan Lee
Software Engineer | Seattle, WA | jordan.lee@example.com | github.com/jlee-dev
Summary: Backend engineer building reliable APIs.
Experience: Senior Software Engineer at Northwind Systems — built REST APIs in Go and PostgreSQL.
Skills: Go, PostgreSQL, REST APIs`,
    jd: "Senior Software Engineer — Go, PostgreSQL, REST APIs, CI/CD.",
    targetRole: "Senior Software Engineer",
    resume: {
      header: {
        name: "Jordan Lee",
        title: "Software Engineer",
        email: "jordan.lee@example.com",
        github: "github.com/jlee-dev",
        website: "jordanlee.dev",
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
      skills: ["Go", "PostgreSQL", "REST APIs"],
    } satisfies CalibratedResumePlainShape,
  },
  {
    id: "non-technical",
    label: "Non-technical",
    source: `Pat Rivera
Account Manager | Denver, CO | pat.rivera@example.com
Summary: Relationship manager for mid-market SaaS accounts.
Experience: Account Manager at Horizon Tools — owned renewal and expansion for 40 SMB accounts.
Skills: CRM, stakeholder management, renewals`,
    jd: "Account Manager — renewals, CRM, mid-market SaaS, stakeholder management.",
    targetRole: "Account Manager",
    resume: {
      header: {
        name: "Pat Rivera",
        title: "Account Manager",
        email: "pat.rivera@example.com",
        phone: "(303) 555-0198",
        location: "Denver, CO",
      },
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
      header: {
        name: "Demetri Simpson",
        title: "Full Stack / AI Engineer",
        email: "demetri@example.com",
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
      skills: ["React", "TypeScript"],
    } satisfies CalibratedResumePlainShape,
  },
];

describe("Phase 3D production-like standard validation", () => {
  it("evaluates five fixtures — ready/needs_review for clean, unsafe only for true blockers", () => {
    const summaries: Array<Record<string, unknown>> = [];
    const eventRows: ReturnType<typeof toSignalyzedStandardEventRow>[] = [];

    for (const c of CASES) {
      const preserved = applyLinkPreservationGuard({
        sourceResumeText: c.source,
        resume: c.resume,
        requestId: `phase3d-${c.id}`,
      });
      const plain = calibratedResumeToPlainText(preserved.resume as CalibratedResumePlainShape);
      const qaResult = runResumeQa({
        sourceResumeText: c.source,
        jobDescriptionText: c.jd,
        generatedResumeText: plain,
        targetRoleLabel: c.targetRole,
        requestId: `phase3d-${c.id}`,
      });
      const qaLog = buildSanitizedQaLog(
        { requestId: `phase3d-${c.id}`, targetRoleLabel: c.targetRole },
        qaResult,
      );
      const qaSummary = toQaShadowSummary(qaLog);

      const contaminationIssues = (qaSummary.issue_logs ?? []).filter(
        (i) => i.code === "cross_jd_contamination",
      );
      const phantomTerms = contaminationIssues.flatMap((i) => i.matched_terms ?? []).filter((t) =>
        /nj summary|il summary|wa summary|co summary/i.test(t),
      );

      const standard = evaluateSignalyzedStandard({
        requestId: `phase3d-${c.id}`,
        exportId: `exp-phase3d-${c.id}`,
        exportType: "docx",
        qa: qaSummary,
        link: {
          event: "resume_link_preservation_report",
          source_link_count: 1,
          generated_link_count_before: 0,
          generated_link_count_after: preserved.report.generated_link_count_after,
          restored_link_count: preserved.report.restored_link_count,
          link_types_restored: preserved.report.link_types_restored,
          duplicate_link_count: 0,
          broken_link_count: 0,
          preservation_ok: preserved.report.preservation_ok,
        },
        export: {
          event: "resume_export_validation_report",
          export_id: `exp-phase3d-${c.id}`,
          export_type: "docx",
          template_version: "1.0.0",
          validation_passed: true,
          validation_warning_count: 0,
          validation_error_count: 0,
          link_count: preserved.report.generated_link_count_after,
          broken_link_count: 0,
          missing_expected_link_count: preserved.report.preservation_ok ? 0 : 1,
          duplicate_link_count: 0,
          section_count: 4,
          bullet_count: 4,
          page_count: null,
        },
      });

      const row = toSignalyzedStandardEventRow({
        result: standard,
        requestId: `phase3d-${c.id}`,
        exportId: `exp-phase3d-${c.id}`,
        exportType: "docx",
        templateVersion: "1.0.0",
        sourceReports: { qa: qaSummary },
      });
      expect(assertNoPiiInStandardPayload(row as unknown as Record<string, unknown>)).toBe(true);
      eventRows.push(row);

      summaries.push({
        case: c.id,
        label: c.label,
        phantom_contamination_terms: phantomTerms,
        qa_contamination_critical: qaResult.criticalIssues.filter((i) => i.code === "cross_jd_contamination").length,
        signalyzed_score: standard.signalyzed_score,
        verdict: standard.verdict,
        hard_blocker_count: standard.hard_blocker_count,
        diagnostic_codes: standard.diagnostic_codes,
        link_preservation_ok: preserved.report.preservation_ok,
      });

      expect(phantomTerms).toHaveLength(0);
      expect(standard.diagnostic_codes).not.toContain(STANDARD_CODES.QA_CROSS_JOB_CONTAMINATION);
    }

    const dashboard = buildSignalyzedDashboardMetrics(eventRows);
    console.log("\n=== Phase 3D after-fix standard summaries ===");
    console.log(JSON.stringify({ summaries, dashboard }, null, 2));

    expect(summaries.every((s) => !s.diagnostic_codes || !(s.diagnostic_codes as string[]).includes(STANDARD_CODES.QA_CROSS_JOB_CONTAMINATION))).toBe(true);
    expect(summaries.filter((s) => s.verdict === "unsafe")).toHaveLength(0);
    expect(dashboard.unsafe_pct).toBe(0);
  });
});
