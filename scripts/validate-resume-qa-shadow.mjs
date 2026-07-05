/**
 * Local Resume QA shadow validation — contaminated Demetri fixture.
 * Usage: node scripts/validate-resume-qa-shadow.mjs
 */
import { runResumeQaShadow } from "../supabase/functions/_shared/resumeQaEngine/shadowIntegration.ts";
import {
  DEMETRI_AI_ENGINEER_SOURCE_RESUME,
  DEMETRI_CONTAMINATED_GENERATED_RESUME,
  FULL_STACK_AI_ENGINEER_JD,
  TARGET_ROLE_LABEL,
} from "../src/test/fixtures/resumeQa/demetriAiEngineerFixtures.ts";

const BLOCKED = [
  /demetri@example\.com/i,
  /github\.com/i,
  /AI Sandbox initiative/i,
  /model outputs for claimant/i,
  /converts resumes and JDs/i,
  /Built a production AI platform using React/i,
  /Integrate OAuth, Stripe, and CI\/CD/i,
];

const logs = [];
const originalLog = console.log;
console.log = (...args) => {
  logs.push(args.map(String).join(" "));
  originalLog(...args);
};

const shadow = runResumeQaShadow({
  enabled: true,
  sourceResumeText: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
  jobDescriptionText: FULL_STACK_AI_ENGINEER_JD,
  generatedResumeText: DEMETRI_CONTAMINATED_GENERATED_RESUME,
  targetRoleLabel: TARGET_ROLE_LABEL,
  requestId: "local-shadow-validation",
  runId: "local-shadow-run",
});

console.log = originalLog;

const reportLine = logs.find((l) => l.includes("resume_qa_shadow_report"));
if (!reportLine) {
  console.error("FAIL: no resume_qa_shadow_report log emitted");
  process.exit(1);
}

const report = JSON.parse(reportLine);
const required = [
  "qa_score",
  "verdict",
  "critical_issue_count",
  "keyword_loss_count",
  "role_contamination_count",
  "bullet_regression_count",
];

const missing = required.filter((k) => report[k] === undefined);
if (missing.length) {
  console.error("FAIL: missing fields:", missing.join(", "));
  process.exit(1);
}

const serialized = JSON.stringify(report);
const leaks = BLOCKED.filter((rx) => rx.test(serialized));
if (leaks.length) {
  console.error("FAIL: raw content detected in shadow log");
  process.exit(1);
}

console.log("\n=== Local shadow validation PASSED ===");
console.log(JSON.stringify({
  qa_score: report.qa_score,
  verdict: report.verdict,
  critical_issue_count: report.critical_issue_count,
  keyword_loss_count: report.keyword_loss_count,
  role_contamination_count: report.role_contamination_count,
  bullet_regression_count: report.bullet_regression_count,
  shadow_flag: "enabled=true (local script)",
}, null, 2));

if (!shadow.result) {
  console.error("FAIL: shadow result missing");
  process.exit(1);
}
