import type { DetectorContext, QaIssue } from "./types.ts";
import { extractBulletsFromLines, extractMetrics, tokenizeMeaningful } from "./types.ts";
import { buildIssue } from "./issueFactory.ts";
import { phraseMatchesCorpus } from "./synonymGraph.ts";
import {
  classifyUnsupportedClaim,
  isAdvisoryUnsupportedClaimSubtype,
  isHardBlockerUnsupportedClaimSubtype,
  type UnsupportedClaimSubtype,
} from "./unsupportedClaimClassifier.ts";

function resolveUnsupportedClaimConfidence(
  subtype: UnsupportedClaimSubtype,
  ruleId: string,
): import("./types.ts").QaConfidence {
  if (isHardBlockerUnsupportedClaimSubtype(subtype)) {
    return ruleId === "hallucination.unsupported_metric" ? "very_high" : "high";
  }
  return "medium";
}

function isAdvisoryUnsupportedIssue(subtype: UnsupportedClaimSubtype): boolean {
  return (
    isAdvisoryUnsupportedClaimSubtype(subtype) ||
    subtype === "protected_claim_regression"
  );
}

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
        const subtype = classifyUnsupportedClaim({
          ruleId: "hallucination.unsupported_metric",
          matchedTerms: [metric],
          targetRoleLabel: ctx.targetRoleLabel,
          referenceCorpus: allowed,
          sourceCorpus: ctx.sourceCorpus,
          evidence: bullet,
        });
        const advisory = isAdvisoryUnsupportedIssue(subtype);
        const confidence = resolveUnsupportedClaimConfidence(subtype, "hallucination.unsupported_metric");
        issues.push(
          buildIssue({
            ruleId: "hallucination.unsupported_metric",
            detector: "hallucination",
            code: "unsupported_claim",
            confidence,
            matchedTerms: [metric],
            source: "generated_resume",
            message: advisory
              ? "Advisory: metric phrasing differs from source — review only."
              : `Unsupported metric or quantity "${metric}" is not traceable to source resume or current JD.`,
            evidence: bullet,
            suggestedFix: advisory
              ? "No action required in shadow mode unless metric is truly ungrounded."
              : "Remove or replace with a metric grounded in the source resume.",
            proposedSeverity: advisory ? "medium" : "critical",
            unsupportedClaimSubtype: subtype,
          }),
        );
      }
    }

    const distinctive = tokenizeMeaningful(bullet).filter((t) => t.length >= 7);
    const newTerms = distinctive.filter(
      (term) =>
        !phraseMatchesCorpus(term, allowed) &&
        !allowed.includes(term) &&
        !SAFE_TRANSFER_TERMS.test(term) &&
        !isCommonResumeTerm(term),
    );

    if (newTerms.length >= 4 && !bulletTraceable(bullet, allowed)) {
      const matchedTerms = newTerms.slice(0, 4);
      const subtype = classifyUnsupportedClaim({
        ruleId: "hallucination.untracked_terms",
        matchedTerms,
        targetRoleLabel: ctx.targetRoleLabel,
        referenceCorpus: allowed,
        sourceCorpus: ctx.sourceCorpus,
        evidence: bullet,
      });
      const advisory = isAdvisoryUnsupportedIssue(subtype);
      const confidence = resolveUnsupportedClaimConfidence(subtype, "hallucination.untracked_terms");
      issues.push(
        buildIssue({
          ruleId: "hallucination.untracked_terms",
          detector: "hallucination",
          code: "unsupported_claim",
          confidence,
          matchedTerms,
          source: "generated_resume",
          message: advisory
            ? "Advisory: generic or role-language rewrite terms — not a true unsupported claim."
            : `Unsupported claim: bullet introduces untraceable terms (${matchedTerms.join(", ")}).`,
          evidence: bullet,
          suggestedFix: advisory
            ? "Monitor in shadow mode; terms are likely transferable role language."
            : "Rewrite bullet using only source-resume facts or JD-aligned transferable language.",
          proposedSeverity: isHardBlockerUnsupportedClaimSubtype(subtype) ? "high" : "medium",
          unsupportedClaimSubtype: subtype,
        }),
      );
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
    const key = `${i.code}:${(i.matchedTerms ?? []).join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
