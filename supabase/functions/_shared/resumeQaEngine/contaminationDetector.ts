import type { DetectorContext, QaIssue } from "./types.ts";

const STOP_PHRASES = new Set([
  "new jersey",
  "united states",
  "full stack",
  "job description",
  "work experience",
  "professional summary",
  "customer service",
  "new york",
  "demetri simpson",
  "regional benefits",
  "founding engineer",
]);

/** Distinctive multi-word phrases in generated text absent from source + current JD. */
export function detectCrossJdContamination(ctx: DetectorContext): QaIssue[] {
  const issues: QaIssue[] = [];
  const reference = ctx.referenceCorpus;

  const candidates = extractDistinctivePhrases(ctx.generatedResumeText);
  for (const phrase of candidates) {
    const normalized = phrase.toLowerCase();
    if (STOP_PHRASES.has(normalized)) continue;
    if (normalized.length < 5) continue;
    if (reference.includes(normalized)) continue;

    issues.push({
      code: "cross_jd_contamination",
      severity: "critical",
      message: `Cross-JD contamination: "${phrase}" appears in generated resume but not in source resume or current JD.`,
      evidence: phrase,
      suggestedFix: `Remove "${phrase}" or ground it in the current JD or source resume.`,
    });
  }

  return dedupeIssues(issues);
}

function extractDistinctivePhrases(text: string): string[] {
  const flat = text.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  const phrases = new Set<string>();

  // Title Case pairs/triples: "Health Innovation Lab"
  const titleCasePairs = flat.match(/\b[A-Z][a-z]+(?: [A-Z][a-z]+){1,2}\b/g) ?? [];
  for (const p of titleCasePairs) phrases.add(p.trim());

  // Acronym-led product names: "AI Sandbox"
  const acronymPairs = flat.match(/\b[A-Z]{2,} [A-Z][a-z]+(?: [A-Z][a-z]+)?\b/g) ?? [];
  for (const p of acronymPairs) phrases.add(p.trim());

  // Quoted phrases
  const quoted = text.match(/"([^"]{3,60})"/g) ?? [];
  for (const q of quoted) phrases.add(q.replace(/"/g, "").trim());

  return [...phrases];
}

function dedupeIssues(issues: QaIssue[]): QaIssue[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const key = `${i.code}:${(i.evidence ?? i.message).toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
