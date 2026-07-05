import type { ResumeAst, ResumeAstObservabilitySummary, ValidationDiagnostic } from "./types.ts";
import { validateResumeAst } from "./validator.ts";

const BLOCKED_LOG_PATTERNS = /resume_text|@|\.com|github\.com|linkedin\.com|phone:/i;

/** Sanitized observability — counts and fingerprints only. No resume text or PII. */
export function buildResumeAstObservability(input: {
  ast: ResumeAst;
  parseTimeMs: number;
  diagnostics?: ValidationDiagnostic[];
}): ResumeAstObservabilitySummary {
  const validation = input.diagnostics ?? validateResumeAst(input.ast).diagnostics;
  const validationErrors = validation.filter((d) => d.severity === "error").length;

  const summary: ResumeAstObservabilitySummary = {
    resume_sections: collectSectionKinds(input.ast),
    bullet_count: input.ast.bullets.length,
    experience_count: input.ast.experience.length,
    project_count: input.ast.projects.length,
    skill_count: input.ast.skills.length,
    validation_errors: validationErrors,
    fingerprint: input.ast.metadata.fingerprint ?? "unknown",
    parse_time_ms: input.parseTimeMs,
  };

  assertObservabilitySafe(summary);
  return summary;
}

export function listResumeSectionKinds(ast: ResumeAst): string[] {
  return collectSectionKinds(ast);
}

function collectSectionKinds(ast: ResumeAst): string[] {
  const sections: string[] = [];
  if (ast.header.rawLines.length > 0) sections.push("header");
  if (ast.professionalSummary.text || ast.professionalSummary.bullets.length > 0) {
    sections.push("professional_summary");
  }
  if (ast.experience.length > 0) sections.push("experience");
  if (ast.projects.length > 0) sections.push("projects");
  if (ast.education.length > 0) sections.push("education");
  if (ast.skills.length > 0) sections.push("skills");
  if (ast.certifications.length > 0) sections.push("certifications");
  if (ast.links.length > 0) sections.push("links");
  if (ast.awards.length > 0) sections.push("awards");
  for (const custom of ast.customSections) {
    if (custom.title !== "Preamble") sections.push(`custom:${custom.title.toLowerCase().replace(/\s+/g, "_")}`);
  }
  return sections;
}

export function assertObservabilitySafe(summary: ResumeAstObservabilitySummary): void {
  const serialized = JSON.stringify(summary);
  if (serialized.length > 2000) {
    throw new Error("resume_ast_observability: payload too large");
  }
  if (BLOCKED_LOG_PATTERNS.test(serialized)) {
    throw new Error("resume_ast_observability: blocked content in summary");
  }
}

export function logResumeAstObservability(summary: ResumeAstObservabilitySummary): void {
  assertObservabilitySafe(summary);
  console.log(
    JSON.stringify({
      event: "resume_ast_observability",
      ...summary,
    }),
  );
}
