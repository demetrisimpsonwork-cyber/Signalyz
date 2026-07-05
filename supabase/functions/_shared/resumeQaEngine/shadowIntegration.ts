import { runResumeQa, type ResumeQaInput, type ResumeQaResult } from "./resumeQaEngine.ts";
import { buildShadowDashboardSummary } from "./shadowDashboard.ts";

/** Rolling shadow dashboard buffer (in-memory, per browser session). */
let shadowDashboardBuffer: Array<{ result: ResumeQaResult; label?: "clean" | "contaminated" }> = [];
const SHADOW_DASHBOARD_WINDOW = 20;

/** Parse ENABLE_RESUME_QA_SHADOW — default false. */
export function isResumeQaShadowEnabled(flagValue?: string | boolean | null): boolean {
  if (flagValue === true) return true;
  if (flagValue === false || flagValue == null) return false;
  const normalized = String(flagValue).trim().toLowerCase();
  return normalized === "true" || normalized === "1";
}

export interface ResumeQaShadowLog {
  event: "resume_qa_shadow_report";
  request_id?: string;
  run_id?: string;
  target_role_label: string;
  qa_score: number;
  verdict: ResumeQaResult["verdict"];
  critical_issue_count: number;
  warning_count: number;
  issue_categories: Record<string, number>;
  keyword_loss_count: number;
  unsupported_claim_count: number;
  role_contamination_count: number;
  bullet_regression_count: number;
  formatting_issue_count: number;
  identity_drift_count: number;
  issue_logs?: ResumeQaResult["issueLogs"];
  confusion_log_count?: number;
  dashboard_summary?: {
    top_rules: Array<{ rule_id: string; trigger_count: number; critical_count: number }>;
    critical_rate: number;
    likely_false_positives: Array<{ rule_id: string; clean_critical_hits: number }>;
  };
  error?: { name: string; message: string };
}

export interface CalibratedResumePlainShape {
  header?: {
    name?: string;
    title?: string;
    email?: string;
    phone?: string;
    linkedin?: string;
    github?: string;
    website?: string;
    location?: string;
  };
  summary?: string;
  core_competencies?: string[];
  experience?: Array<{
    company?: string;
    title?: string;
    dates?: string;
    bullets?: string[];
  }>;
  independent_projects?: Array<{
    name?: string;
    description?: string;
    bullets?: string[];
  }>;
  skills?: string[];
  certifications?: string[];
  education?: Array<{
    institution?: string;
    degree?: string;
    year?: string;
  }>;
}

export interface RunResumeQaShadowInput extends ResumeQaInput {
  enabled: boolean;
}

export interface RunResumeQaShadowResult {
  log: ResumeQaShadowLog | null;
  result: ResumeQaResult | null;
  error?: { name: string; message: string };
}

/** Convert structured calibrated resume to plain text for QA (internal only). */
export function calibratedResumeToPlainText(resume: CalibratedResumePlainShape): string {
  const lines: string[] = [];
  const header = resume.header ?? {};

  if (header.name) lines.push(header.name);
  if (header.title) lines.push(header.title);
  const contact = [header.email, header.phone, header.linkedin, header.github, header.website, header.location].filter(Boolean);
  if (contact.length) lines.push(contact.join(" | "));

  if (resume.summary) {
    lines.push("");
    lines.push("Summary");
    lines.push(resume.summary);
  }

  if (resume.experience?.length) {
    lines.push("");
    lines.push("Experience");
    for (const exp of resume.experience) {
      lines.push(`${exp.title ?? ""} | ${exp.company ?? ""} | ${exp.dates ?? ""}`.replace(/\s+\|\s+\|/g, " | ").trim());
      for (const bullet of exp.bullets ?? []) {
        if (bullet) lines.push(`- ${bullet}`);
      }
    }
  }

  if (resume.independent_projects?.length) {
    lines.push("");
    lines.push("Projects");
    for (const project of resume.independent_projects) {
      if (project.name) lines.push(project.name);
      if (project.description) lines.push(project.description);
      for (const bullet of project.bullets ?? []) {
        if (bullet) lines.push(`- ${bullet}`);
      }
    }
  }

  if (resume.skills?.length) {
    lines.push("");
    lines.push("Skills");
    lines.push(resume.skills.join(", "));
  }

  if (resume.core_competencies?.length) {
    lines.push("");
    lines.push("Core Competencies");
    lines.push(resume.core_competencies.join(", "));
  }

  if (resume.education?.length) {
    lines.push("");
    lines.push("Education");
    for (const edu of resume.education) {
      lines.push(`${edu.degree ?? ""} | ${edu.institution ?? ""} | ${edu.year ?? ""}`.trim());
    }
  }

  if (resume.certifications?.length) {
    lines.push("");
    lines.push("Certifications");
    lines.push(resume.certifications.join(", "));
  }

  return lines.join("\n").trim();
}

export function buildSanitizedQaLog(
  input: Pick<ResumeQaInput, "runId" | "requestId" | "targetRoleLabel">,
  result: ResumeQaResult,
  dashboard?: ReturnType<typeof buildShadowDashboardSummary>,
): ResumeQaShadowLog {
  const highWarnings = result.warnings.filter((i) => i.severity === "high");

  return {
    event: "resume_qa_shadow_report",
    request_id: input.requestId,
    run_id: input.runId,
    target_role_label: input.targetRoleLabel,
    qa_score: result.qaScore,
    verdict: result.verdict,
    critical_issue_count: result.criticalIssues.length,
    warning_count: result.warnings.filter((i) => i.severity === "medium" || i.severity === "low").length + highWarnings.length,
    issue_categories: {
      contamination: result.criticalIssues.filter((i) => i.code === "cross_jd_contamination").length,
      keyword_loss: result.keywordLoss.length,
      unsupported_claim: result.unsupportedClaims.length,
      role_contamination: result.roleContamination.length,
      bullet_regression: result.bulletRegressions.length,
      formatting: result.formattingIssues.length,
      identity_drift: result.identityDrift.length,
    },
    keyword_loss_count: result.keywordLoss.length,
    unsupported_claim_count: result.unsupportedClaims.length,
    role_contamination_count: result.roleContamination.length,
    bullet_regression_count: result.bulletRegressions.length,
    formatting_issue_count: result.formattingIssues.length,
    identity_drift_count: result.identityDrift.length,
    issue_logs: result.issueLogs,
    confusion_log_count: result.issueLogs.length,
    dashboard_summary: dashboard
      ? {
          top_rules: dashboard.top_rules.slice(0, 20).map((r) => ({
            rule_id: r.rule_id,
            trigger_count: r.trigger_count,
            critical_count: r.critical_count,
          })),
          critical_rate: dashboard.critical_rate,
          likely_false_positives: dashboard.likely_false_positives.slice(0, 10),
        }
      : undefined,
  };
}

function logShadowError(requestId: string | undefined, error: unknown): { name: string; message: string } {
  const name = error instanceof Error ? error.name : "Error";
  const message = error instanceof Error ? error.message : "unknown";
  console.log(
    JSON.stringify({
      event: "resume_qa_shadow_report",
      request_id: requestId,
      error: { name, message: sanitizeErrorMessage(message) },
    }),
  );
  return { name, message: sanitizeErrorMessage(message) };
}

function sanitizeErrorMessage(message: string): string {
  return message.slice(0, 120).replace(/[\r\n]+/g, " ");
}

const BLOCKED_LOG_SUBSTRINGS =
  /resume_text|jd_text|original_resume_text|generated_resume_text|@|\.com|github\.com|linkedin/i;

/** Ensure log payload never includes raw resume/JD content. */
export function assertSanitizedShadowLog(log: ResumeQaShadowLog): void {
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      if (BLOCKED_LOG_SUBSTRINGS.test(value)) {
        throw new Error("resume_qa_shadow_report log contains blocked content");
      }
      if (value.length > 80) {
        throw new Error("resume_qa_shadow_report log contains oversized string field");
      }
      return;
    }
    if (value && typeof value === "object") {
      for (const nested of Object.values(value as Record<string, unknown>)) {
        visit(nested);
      }
    }
  };

  visit(log);
}

/**
 * Run Resume QA in shadow mode. Never throws; does not mutate resume output.
 */
export function runResumeQaShadow(input: RunResumeQaShadowInput): RunResumeQaShadowResult {
  if (!input.enabled) {
    return { log: null, result: null };
  }

  try {
    const result = runResumeQa(input);
    shadowDashboardBuffer = [...shadowDashboardBuffer, { result, label: "clean" }].slice(
      -SHADOW_DASHBOARD_WINDOW,
    );
    const dashboard = buildShadowDashboardSummary(shadowDashboardBuffer);
    const log = buildSanitizedQaLog(input, result, dashboard);
    assertSanitizedShadowLog(log);
    console.log(JSON.stringify(log));
    return { log, result };
  } catch (error) {
    const err = logShadowError(input.requestId, error);
    return { log: null, result: null, error: err };
  }
}
