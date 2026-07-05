import type { DetectorContext, QaIssue } from "./types.ts";
import { extractBulletsFromLines, tokenizeMeaningful } from "./types.ts";

const REGRESSION_PATTERNS: Array<{
  sourceRx: RegExp;
  weakenedRx: RegExp;
  label: string;
}> = [
  {
    sourceRx: /converts?\s+resumes?\s+and\s+jds?\s+into\s+structured\s+outputs?/i,
    weakenedRx: /parses?\s+resumes?/i,
    label: "structured output conversion weakened to resume parsing only",
  },
  {
    sourceRx: /production\s+ai\s+platform/i,
    weakenedRx: /parses?\s+resumes?/i,
    label: "production AI platform scope collapsed",
  },
];

/** Compare source strongest bullets vs generated — flag weakening. */
export function detectBulletRegressions(ctx: DetectorContext): QaIssue[] {
  const issues: QaIssue[] = [];
  const sourceBullets = extractBulletsFromLines(ctx.sourceResumeText);
  const generatedBullets = extractBulletsFromLines(ctx.generatedResumeText);

  for (const pattern of REGRESSION_PATTERNS) {
    const sourceHit = sourceBullets.find((b) => pattern.sourceRx.test(b));
    const genHit = generatedBullets.find((b) => pattern.weakenedRx.test(b));
    if (sourceHit && genHit && !pattern.sourceRx.test(genHit)) {
      issues.push({
        code: "bullet_regression",
        severity: "critical",
        message: `Severe bullet regression: ${pattern.label}.`,
        evidence: `Source: ${sourceHit}\nGenerated: ${genHit}`,
        suggestedFix: "Restore the fuller source claim instead of narrowing scope.",
      });
    }
  }

  for (const sourceBullet of sourceBullets) {
    const genMatch = findBestGeneratedMatch(sourceBullet, generatedBullets);
    if (!genMatch) continue;

    const regression = scoreBulletRegression(sourceBullet, genMatch);
    if (regression.severe) {
      issues.push({
        code: "bullet_regression",
        severity: "critical",
        message: `Bullet regression: generated version weakens a strong source bullet (${regression.lostTerms.slice(0, 4).join(", ")}).`,
        evidence: `Source: ${sourceBullet}\nGenerated: ${genMatch}`,
        suggestedFix: "Keep the stronger source phrasing and only retarget keywords for the role.",
      });
    } else if (regression.moderate) {
      issues.push({
        code: "bullet_regression",
        severity: "high",
        message: `Bullet regression: generated version drops meaningful source detail.`,
        evidence: `Source: ${sourceBullet}\nGenerated: ${genMatch}`,
        suggestedFix: "Merge source specificity back into the generated bullet.",
      });
    }
  }

  return dedupeIssues(issues);
}

function findBestGeneratedMatch(sourceBullet: string, generatedBullets: string[]): string | undefined {
  const sourceTokens = new Set(tokenizeMeaningful(sourceBullet));
  let best: { bullet: string; overlap: number } | undefined;

  for (const gen of generatedBullets) {
    const genTokens = tokenizeMeaningful(gen);
    const overlap = genTokens.filter((t) => sourceTokens.has(t)).length;
    if (!best || overlap > best.overlap) best = { bullet: gen, overlap };
  }

  return best && best.overlap >= 2 ? best.bullet : undefined;
}

function scoreBulletRegression(
  sourceBullet: string,
  generatedBullet: string,
): { severe: boolean; moderate: boolean; lostTerms: string[] } {
  const sourceTerms = tokenizeMeaningful(sourceBullet).filter((t) => t.length >= 5);
  const generatedSet = new Set(tokenizeMeaningful(generatedBullet));
  const lostTerms = sourceTerms.filter((t) => !generatedSet.has(t));

  const sourceLen = sourceBullet.length;
  const genLen = generatedBullet.length;
  const lengthDrop = sourceLen > 0 ? 1 - genLen / sourceLen : 0;

  const severe =
    lostTerms.length >= 3 && lengthDrop >= 0.25 && generatedBullet.length < sourceBullet.length;
  const moderate = lostTerms.length >= 2 && lengthDrop >= 0.15;

  return { severe, moderate, lostTerms };
}

function dedupeIssues(issues: QaIssue[]): QaIssue[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const key = (i.evidence ?? i.message).slice(0, 100);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
