import { calibratedResumeToPlainText } from "../../supabase/functions/_shared/resumeQaEngine/shadowIntegration.ts";
import { extractStructuredLinks } from "../../supabase/functions/_shared/resumeAst/linkExtraction.ts";
import {
  applyLinkPreservationGuard,
  logLinkPreservationReport,
} from "../../supabase/functions/_shared/resumeAst/linkPreservation.ts";
import {
  DEMETRI_AI_ENGINEER_SOURCE_RESUME,
} from "../../src/test/fixtures/resumeQa/demetriAiEngineerFixtures.ts";

const CUSTOMER_SUCCESS_RESUME = `
Taylor Morgan
Customer Success Manager | Chicago, IL

Professional Summary
CSM with 6+ years driving retention, QBRs, and CRM hygiene for mid-market accounts.

Experience

Customer Success Manager | Relay SaaS | 2021 – Present
- Managed 60 enterprise accounts with 94% gross retention.

Skills
Salesforce, Gainsight, QBR facilitation
`.trim();

const ENGINEERING_RESUME = `
Jordan Lee
Software Engineer | Seattle, WA | jordan.lee@example.com | github.com/jlee-dev

Summary
Backend engineer building reliable APIs and data pipelines.

Experience

Senior Software Engineer | Northwind Systems | 2020 – Present
- Built REST APIs in Go and PostgreSQL serving 2M+ monthly requests.

Skills
Go, PostgreSQL, REST APIs, Git, CI/CD
`.trim();
import { GENERATED_MISSING_LINKS } from "../../src/test/fixtures/resumeAst/linkPreservationFixtures.ts";

const CASES = [
  { label: "demetri_ai_engineer", source: DEMETRI_AI_ENGINEER_SOURCE_RESUME },
  { label: "customer_success", source: CUSTOMER_SUCCESS_RESUME },
  { label: "engineering", source: ENGINEERING_RESUME },
  { label: "non_technical", source: CUSTOMER_SUCCESS_RESUME },
] as const;

const summaries = [];

for (const testCase of CASES) {
  const sourceLinks = extractStructuredLinks(testCase.source);
  const before = structuredClone(GENERATED_MISSING_LINKS);
  const preserved = applyLinkPreservationGuard({
    sourceResumeText: testCase.source,
    resume: before,
    requestId: `link-val-${testCase.label}`,
  });
  logLinkPreservationReport(preserved.report);

  const afterLinks = extractStructuredLinks(calibratedResumeToPlainText(preserved.resume));

  summaries.push({
    label: testCase.label,
    source_link_count: sourceLinks.length,
    source_link_types: [...new Set(sourceLinks.map((l) => l.type))],
    generated_before: preserved.report.generated_link_count_before,
    generated_after: preserved.report.generated_link_count_after,
    restored_link_count: preserved.report.restored_link_count,
    link_types_restored: preserved.report.link_types_restored,
    preservation_ok: preserved.report.preservation_ok,
    after_link_count: afterLinks.length,
    report: preserved.report,
  });
}

console.log(JSON.stringify({ link_preservation_validation: summaries }, null, 2));

const allOk = summaries.every((s) => s.preservation_ok);
process.exitCode = allOk ? 0 : 1;
