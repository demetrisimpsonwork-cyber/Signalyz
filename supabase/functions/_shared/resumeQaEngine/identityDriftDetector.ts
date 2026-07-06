import type { DetectorContext, QaIssue } from "./types.ts";
import { parseResumeSections, tokenizeMeaningful } from "./types.ts";
import { buildIssue } from "./issueFactory.ts";
import {
  classifyMissingEmployersDrift,
  extractEmployerNames,
  isAdvisoryIdentityDriftSubtype,
  isStrongIdentityDriftSubtype,
  type IdentityDriftSubtype,
} from "./identityDriftClassifier.ts";

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
  const sourceCompanies = extractEmployerNames(ctx.sourceResumeText);
  const generatedCompanies = extractEmployerNames(ctx.generatedResumeText);

  const lostCompanies = sourceCompanies.filter(
    (c) => !generatedCompanies.some((g) => g.includes(c) || c.includes(g)),
  );

  if (lostCompanies.length > 0) {
    const subtype = classifyMissingEmployersDrift({
      sourceResumeText: ctx.sourceResumeText,
      generatedResumeText: ctx.generatedResumeText,
      missingEmployers: lostCompanies,
    });
    const strong = isStrongIdentityDriftSubtype(subtype);
    issues.push(
      buildIssue({
        ruleId: "identity_drift.missing_employers",
        detector: "identity_drift",
        code: "identity_drift_missing_employers",
        confidence: strong ? "high" : "medium",
        matchedTerms: lostCompanies.map((c) => c.toLowerCase().slice(0, 40)),
        source: "source_resume",
        message: strong
          ? "Identity drift: generated resume drops a current or major source employer."
          : "Identity drift: minor employer omission from source resume — advisory only.",
        suggestedFix: strong
          ? "Keep real employer history from the source resume."
          : "Monitor in shadow mode; omission may be intentional space trimming.",
        proposedSeverity: strong ? "high" : "medium",
        identityDriftSubtype: subtype,
      }),
    );
  }

  for (const term of GENERIC_INFLATION_TERMS) {
    if (ctx.generatedCorpus.includes(term) && !ctx.sourceCorpus.includes(term)) {
      issues.push(
        buildIssue({
          ruleId: "identity_drift.generic_inflation",
          detector: "identity_drift",
          code: "identity_drift_generic_inflation",
          confidence: "medium",
          matchedTerms: [term],
          source: "generated_resume",
          message: `Identity drift: generic inflation term "${term}" added without source support.`,
          evidence: term,
          suggestedFix: "Replace generic hype with concrete source-backed outcomes.",
          proposedSeverity: "medium",
          identityDriftSubtype: "identity_drift.generic_inflation",
        }),
      );
    }
  }

  const sourceMetrics = countNumericClaims(ctx.sourceResumeText);
  const generatedMetrics = countNumericClaims(ctx.generatedResumeText);
  if (sourceMetrics >= 2 && generatedMetrics < sourceMetrics - 1) {
    issues.push(
      buildIssue({
        ruleId: "identity_drift.metric_loss",
        detector: "identity_drift",
        code: "identity_drift_metric_loss",
        confidence: "medium",
        matchedTerms: ["metric_loss"],
        source: "source_resume",
        message: "Identity drift: generated resume loses grounded metrics from the source resume.",
        suggestedFix: "Preserve real quantified outcomes from the source resume.",
        proposedSeverity: "medium",
        identityDriftSubtype: "identity_drift.metric_loss",
      }),
    );
  }

  const sourceSections = parseResumeSections(ctx.sourceResumeText);
  const generatedSections = parseResumeSections(ctx.generatedResumeText);
  const sourceSpecificity = averageSpecificity(sourceSections);
  const generatedSpecificity = averageSpecificity(generatedSections);

  if (generatedSpecificity < sourceSpecificity * 0.65 && generatedSpecificity < 0.35) {
    issues.push(
      buildIssue({
        ruleId: "identity_drift.generic_voice",
        detector: "identity_drift",
        code: "identity_drift_generic_voice",
        confidence: "medium",
        matchedTerms: ["generic_voice"],
        source: "generated_resume",
        message: "Identity drift: generated resume sounds more generic and less grounded than the source.",
        suggestedFix: "Re-anchor bullets to the candidate's actual companies, tools, and outcomes.",
        proposedSeverity: "medium",
        identityDriftSubtype: "identity_drift.generic_voice",
      }),
    );
  }

  return issues;
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

export { isAdvisoryIdentityDriftSubtype, isStrongIdentityDriftSubtype, type IdentityDriftSubtype };
