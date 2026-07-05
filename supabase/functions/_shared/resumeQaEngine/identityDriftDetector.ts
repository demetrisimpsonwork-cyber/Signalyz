import type { DetectorContext, QaIssue } from "./types.ts";
import { parseResumeSections, tokenizeMeaningful } from "./types.ts";

const GENERIC_INFLATION_TERMS = [
  "visionary",
  "world-class",
  "cutting-edge",
  "best-in-class",
  "thought leader",
  "synergy",
  "rockstar",
  "ninja",
  "guru",
  "passionate self-starter",
  "dynamic professional",
  "results-driven professional",
] as const;

/** Detect generic, inflated, or ungrounded identity drift from source resume. */
export function detectIdentityDrift(ctx: DetectorContext): QaIssue[] {
  const issues: QaIssue[] = [];
  const sourceCompanies = extractCompanyNames(ctx.sourceResumeText);
  const generatedCompanies = extractCompanyNames(ctx.generatedResumeText);

  const lostCompanies = sourceCompanies.filter(
    (c) => !generatedCompanies.some((g) => g.includes(c) || c.includes(g)),
  );
  if (lostCompanies.length > 0) {
    issues.push({
      code: "identity_drift_missing_employers",
      severity: "high",
      message: `Identity drift: generated resume drops source employers (${lostCompanies.join(", ")}).`,
      suggestedFix: "Keep real employer history from the source resume.",
    });
  }

  for (const term of GENERIC_INFLATION_TERMS) {
    if (
      ctx.generatedCorpus.includes(term) &&
      !ctx.sourceCorpus.includes(term)
    ) {
      issues.push({
        code: "identity_drift_generic_inflation",
        severity: "medium",
        message: `Identity drift: generic inflation term "${term}" added without source support.`,
        evidence: term,
        suggestedFix: "Replace generic hype with concrete source-backed outcomes.",
      });
    }
  }

  const sourceMetrics = countNumericClaims(ctx.sourceResumeText);
  const generatedMetrics = countNumericClaims(ctx.generatedResumeText);
  if (sourceMetrics >= 2 && generatedMetrics < sourceMetrics - 1) {
    issues.push({
      code: "identity_drift_metric_loss",
      severity: "medium",
      message: "Identity drift: generated resume loses grounded metrics from the source resume.",
      suggestedFix: "Preserve real quantified outcomes from the source resume.",
    });
  }

  const sourceSections = parseResumeSections(ctx.sourceResumeText);
  const generatedSections = parseResumeSections(ctx.generatedResumeText);
  const sourceSpecificity = averageSpecificity(sourceSections);
  const generatedSpecificity = averageSpecificity(generatedSections);

  if (generatedSpecificity < sourceSpecificity * 0.65 && generatedSpecificity < 0.35) {
    issues.push({
      code: "identity_drift_generic_voice",
      severity: "high",
      message: "Identity drift: generated resume sounds more generic and less grounded than the source.",
      suggestedFix: "Re-anchor bullets to the candidate's actual companies, tools, and outcomes.",
    });
  }

  return issues;
}

function extractCompanyNames(text: string): string[] {
  const companies: string[] = [];
  const roleLines = text.match(/^[^\n]*\|[^\n]+/gm) ?? [];
  for (const line of roleLines) {
    const parts = line.split("|").map((p) => p.trim());
    if (parts.length >= 2) companies.push(parts[1]);
  }
  return companies.filter(Boolean);
}

function countNumericClaims(text: string): number {
  const matches = text.match(/\b\d+(?:\.\d+)?%?\b/g) ?? [];
  return matches.length;
}

function averageSpecificity(sections: ReturnType<typeof parseResumeSections>): number {
  if (sections.length === 0) return 0;
  const scores = sections.map((s) => {
    const tokens = tokenizeMeaningful(s.body);
    const specific = tokens.filter((t) => t.length >= 5).length;
    return specific / Math.max(tokens.length, 1);
  });
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}
