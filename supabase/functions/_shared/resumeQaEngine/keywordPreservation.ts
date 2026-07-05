import type { DetectorContext, QaIssue } from "./types.ts";

/** High-value technical keywords — loss flagged when present in source/JD but dropped from output. */
export const HIGH_VALUE_KEYWORDS = [
  "React",
  "TypeScript",
  "Node.js",
  "REST APIs",
  "REST API",
  "PostgreSQL",
  "Supabase",
  "Python",
  "Git",
  "OAuth",
  "Stripe",
  "Vercel",
  "Cloudflare",
  "CI/CD",
  "cloud deployment",
] as const;

const KEYWORD_ALIASES: Record<string, RegExp> = {
  "Node.js": /\bnode\.?js\b/i,
  "REST APIs": /\brest(?:ful)?\s+apis?\b/i,
  "REST API": /\brest(?:ful)?\s+apis?\b/i,
  "CI/CD": /\bci\s*\/\s*cd\b/i,
  "cloud deployment": /\bcloud\s+deploy(?:ment|ing)?\b/i,
};

export function detectKeywordLoss(ctx: DetectorContext): QaIssue[] {
  const issues: QaIssue[] = [];
  const generated = ctx.generatedCorpus;

  for (const keyword of HIGH_VALUE_KEYWORDS) {
    const rx = KEYWORD_ALIASES[keyword] ?? new RegExp(`\\b${escapeRegex(keyword)}\\b`, "i");
    const inSource = rx.test(ctx.sourceCorpus);
    const inJd = rx.test(ctx.jdCorpus);
    const inGenerated = rx.test(generated);

    if (!inGenerated && (inSource || inJd)) {
      const severity = inSource && inJd ? "high" : "medium";
      issues.push({
        code: "keyword_loss",
        severity,
        message: `Keyword loss: "${keyword}" appears in ${inSource && inJd ? "source resume and JD" : inSource ? "source resume" : "JD"} but was removed from generated resume.`,
        evidence: keyword,
        suggestedFix: `Restore "${keyword}" where it reflects real experience for this role.`,
      });
    }
  }

  return dedupeByEvidence(issues);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dedupeByEvidence(issues: QaIssue[]): QaIssue[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const key = (i.evidence ?? "").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
