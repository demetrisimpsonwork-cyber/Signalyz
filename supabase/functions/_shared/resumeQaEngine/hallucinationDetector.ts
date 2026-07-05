import type { DetectorContext, QaIssue } from "./types.ts";
import { extractBulletsFromLines, extractMetrics, tokenizeMeaningful } from "./types.ts";

const SAFE_TRANSFER_TERMS =
  /\b(collaborat|cross-functional|stakeholder|documentation|workflow|automation|integration|scalable|reliable|maintainable|production|deployed|monitoring|testing|agile|scrum)\w*\b/i;

/** Claims in generated output that cannot be traced to source, JD, or safe transferable rewrite. */
export function detectUnsupportedClaims(ctx: DetectorContext): QaIssue[] {
  const issues: QaIssue[] = [];
  const allowed = ctx.referenceCorpus;
  const generatedBullets = extractBulletsFromLines(ctx.generatedResumeText);

  for (const bullet of generatedBullets) {
    const metrics = extractMetrics(bullet);
    for (const metric of metrics) {
      if (!allowed.includes(metric.toLowerCase()) && !metricAppearsInSource(metric, ctx.sourceCorpus)) {
        issues.push({
          code: "unsupported_claim",
          severity: "critical",
          message: `Unsupported metric or quantity "${metric}" is not traceable to source resume or current JD.`,
          evidence: bullet,
          suggestedFix: "Remove or replace with a metric grounded in the source resume.",
        });
      }
    }

    const distinctive = tokenizeMeaningful(bullet).filter((t) => t.length >= 7);
    const newTerms = distinctive.filter(
      (term) =>
        !allowed.includes(term) &&
        !SAFE_TRANSFER_TERMS.test(term) &&
        !isCommonResumeTerm(term),
    );

    if (newTerms.length >= 3 && !bulletTraceable(bullet, allowed)) {
      issues.push({
        code: "unsupported_claim",
        severity: "critical",
        message: `Unsupported claim: bullet introduces untraceable terms (${newTerms.slice(0, 4).join(", ")}).`,
        evidence: bullet,
        suggestedFix: "Rewrite bullet using only source-resume facts or JD-aligned transferable language.",
      });
    }
  }

  return dedupeIssues(issues);
}

function metricAppearsInSource(metric: string, sourceCorpus: string): boolean {
  const digits = metric.replace(/[^\d]/g, "");
  return digits.length > 0 && sourceCorpus.includes(digits);
}

function bulletTraceable(bullet: string, allowedCorpus: string): boolean {
  const words = tokenizeMeaningful(bullet);
  const matched = words.filter((w) => allowedCorpus.includes(w));
  return matched.length / Math.max(words.length, 1) >= 0.65;
}

function isCommonResumeTerm(term: string): boolean {
  return /^(experience|responsible|managed|developed|implemented|designed|built|led|improved|across|within|using|through|including)$/i.test(
    term,
  );
}

function dedupeIssues(issues: QaIssue[]): QaIssue[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const key = `${i.code}:${(i.evidence ?? "").slice(0, 80)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
