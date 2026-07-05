import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { calibratedResumeToPlainText } from "../../supabase/functions/_shared/resumeQaEngine/shadowIntegration.ts";
import { buildResumeAstDashboardMetrics } from "../../supabase/functions/_shared/resumeAst/observatory/aggregates.ts";
import { buildResumeAstShadowEventRow } from "../../supabase/functions/_shared/resumeAst/observatory/persist.ts";
import {
  clearCachedSourceResumeAstShadow,
  runResumeAstShadow,
  runSourceResumeAstShadow,
} from "../../supabase/functions/_shared/resumeAst/shadowIntegration.ts";
import {
  DEMETRI_AI_ENGINEER_SOURCE_RESUME,
  DEMETRI_CONTAMINATED_GENERATED_RESUME,
} from "../../src/test/fixtures/resumeQa/demetriAiEngineerFixtures.ts";

const CUSTOMER_SUCCESS_RESUME = `
Taylor Morgan
Customer Success Manager | Chicago, IL

Professional Summary
CSM with 6+ years driving retention, QBRs, and CRM hygiene for mid-market accounts.

Experience

Customer Success Manager | Relay SaaS | 2021 – Present
- Managed 60 enterprise accounts with 94% gross retention.
- Led quarterly business reviews and renewal playbooks with sales partners.

Skills
Salesforce, Gainsight, QBR facilitation, renewal forecasting, stakeholder management
`.trim();

const MALFORMED_RESUME = `
Summary
Summary
Experience

Built things quickly
- 
- Led stuff

Skills
React, React, TypeScript
Skills

Education
B.A. | Unknown College
`.trim();

const CONTAMINATED_SHAPE = {
  header: { name: "Demetri Simpson", title: "Full Stack / AI Engineer" },
  summary: "AI engineer shipping hiring intelligence products.",
  experience: [
    {
      title: "Founding Engineer",
      company: "Signalyz",
      dates: "2022 – Present",
      bullets: [
        "Built a production AI platform that parses resumes for hiring workflows.",
        "Led the AI Sandbox initiative for rapid prompt iteration across customer pilots.",
      ],
    },
  ],
  skills: ["Python", "TypeScript", "React", "PostgreSQL"],
};

const CASES = [
  {
    label: "demetri_ai_engineer",
    source: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
    generatedText: DEMETRI_CONTAMINATED_GENERATED_RESUME,
  },
  {
    label: "contaminated_calibrated",
    source: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
    generatedText: calibratedResumeToPlainText(CONTAMINATED_SHAPE),
  },
  {
    label: "customer_success",
    source: CUSTOMER_SUCCESS_RESUME,
    generatedText: CUSTOMER_SUCCESS_RESUME,
  },
  {
    label: "malformed",
    source: MALFORMED_RESUME,
    generatedText: MALFORMED_RESUME,
  },
] as const;

const reports: Array<Record<string, unknown>> = [];
const dbRows = [];

for (const testCase of CASES) {
  clearCachedSourceResumeAstShadow();
  runSourceResumeAstShadow({
    enabled: true,
    sourceResumeText: testCase.source,
    requestId: `ast-shadow-${testCase.label}`,
    runId: `run-${testCase.label}`,
  });

  const shadow = runResumeAstShadow({
    enabled: true,
    sourceResumeText: testCase.source,
    generatedResumeText: testCase.generatedText,
    requestId: `ast-shadow-${testCase.label}`,
    runId: `run-${testCase.label}`,
  });

  if (shadow.log) {
    reports.push({
      label: testCase.label,
      log: shadow.log,
      comparison: shadow.comparison,
    });
    dbRows.push(buildResumeAstShadowEventRow(shadow.log));
  }
}

const metrics = buildResumeAstDashboardMetrics(dbRows);
const topProblems = reports.flatMap((report) => {
  const comparison = report.comparison as { top_validation_codes?: string[] } | null;
  return (comparison?.top_validation_codes ?? []).map((code) => ({
    case: report.label,
    code,
  }));
});

const summary = {
  generated_at: new Date().toISOString(),
  shadow_reports: reports,
  dashboard_sample: metrics,
  top_parsing_problems: topProblems.slice(0, 15),
  production_shadow_safe:
    reports.every((report) => {
      const log = report.log as { source_parse_ok?: boolean; generated_parse_ok?: boolean };
      return log.source_parse_ok && log.generated_parse_ok;
    }) && metrics.average_round_trip_fidelity !== null,
};

const outDir = join(process.cwd(), "scripts", "resumeast", "reports");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "validate-shadow-sample.json");
writeFileSync(outPath, JSON.stringify(summary, null, 2));

console.log(JSON.stringify(summary, null, 2));
console.log(`\nSaved: ${outPath}`);
