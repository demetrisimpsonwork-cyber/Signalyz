/**
 * Pure, dependency-free helpers for shaping resume bullets.
 *
 * Used by the assemble-calibrated-resume edge function and exercised directly
 * in unit tests. Keep this file free of Deno/Node globals so it can run in both
 * runtimes.
 */

export interface BulletShortenResult {
  text: string;
  shortened: boolean;
}

// A résumé "Skills:" / "Tools:" section line that leaked into the experience
// bullets. Requires the heading keyword to be immediately followed by a colon,
// so normal bullets that merely mention a skill ("Skills training delivered…",
// "Built a skills matrix that tracked…") are never matched.
const SECTION_HEADING_BULLET =
  /^\s*(?:technical|core|key|professional|additional|hard|soft|relevant)?\s*(?:skills?|tools|competencies|technologies|proficiencies)(?:\s*(?:&|and)\s*tools)?\s*:/i;

/** True when a bullet is really a Skills/Tools section heading, not experience. */
export function isSectionHeadingBullet(bullet: string): boolean {
  return typeof bullet === "string" && SECTION_HEADING_BULLET.test(bullet);
}

/**
 * Shorten an over-long bullet WITHOUT cutting mid-thought.
 *
 * Strategy:
 * 1. If under the soft cap, leave it untouched.
 * 2. Prefer trimming at the last sentence boundary (. ! ?) within the hard cap.
 * 3. Otherwise trim at the last clause boundary (; , — –) within the hard cap.
 * 4. If no safe boundary exists, keep the full text — a slightly long complete
 *    sentence is always preferable to a truncated, corrupted one.
 */
export function shortenBullet(
  text: string,
  opts: { softCap?: number; hardCap?: number } = {},
): BulletShortenResult {
  const softCap = opts.softCap ?? 240;
  const hardCap = opts.hardCap ?? 280;
  const t = (text || "").trim();
  if (t.length <= softCap) return { text: t, shortened: false };

  const minKeep = Math.floor(softCap * 0.5);

  const sentenceCut = lastBoundaryIndex(t, /[.!?]/, minKeep, hardCap);
  if (sentenceCut !== -1) {
    return { text: t.slice(0, sentenceCut + 1).trim(), shortened: true };
  }

  const clauseCut = lastBoundaryIndex(t, /[;,—–]/, minKeep, hardCap);
  if (clauseCut !== -1) {
    const clause = t.slice(0, clauseCut).trim().replace(/[,;\s—–]+$/, "");
    if (clause.length >= minKeep) return { text: clause, shortened: true };
  }

  // No safe boundary within the hard cap — keep the complete text rather than
  // corrupting it with a mid-word cut.
  return { text: t, shortened: false };
}

function lastBoundaryIndex(
  text: string,
  charClass: RegExp,
  minKeep: number,
  hardCap: number,
): number {
  let idx = -1;
  const limit = Math.min(text.length - 1, hardCap);
  for (let i = minKeep; i <= limit; i++) {
    if (charClass.test(text[i])) idx = i;
  }
  return idx;
}

const TOKEN_STOP = new Set([
  "the", "and", "for", "with", "that", "this", "from", "across", "through",
  "into", "over", "under", "their", "them", "while", "within", "between",
]);

function bulletTokens(b: string): Set<string> {
  return new Set(
    (b.toLowerCase().match(/[a-z0-9]{4,}/g) || []).filter((w) => !TOKEN_STOP.has(w)),
  );
}

/** Jaccard token-overlap ratio between two bullets (0–1). */
export function tokenOverlapRatio(a: string, b: string): number {
  const ta = bulletTokens(a);
  const tb = bulletTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  const union = ta.size + tb.size - shared;
  return union === 0 ? 0 : shared / union;
}

export interface CapRoleBulletsResult {
  bullets: string[];
  reduced: boolean;
  from: number;
  to: number;
}

/**
 * Intentional bullet-density policy (replaces the old silent 4/3 hard slice).
 *
 * - First role: target 4 bullets, allow up to 5 when evidence is distinct.
 * - Other roles: target 3 bullets, allow up to 4 when evidence is distinct.
 * - Near-duplicate bullets are merged (the longer, more specific one wins)
 *   BEFORE anything is dropped, so unique evidence is never silently removed
 *   to satisfy the target.
 */
export function capRoleBullets(
  bullets: string[],
  roleIndex: number,
  overlapThreshold = 0.7,
): CapRoleBulletsResult {
  const from = bullets.length;
  const target = roleIndex === 0 ? 4 : 3;
  const hardMax = roleIndex === 0 ? 5 : 4;

  if (from <= target) {
    return { bullets, reduced: false, from, to: from };
  }

  // Step 1: collapse near-duplicates, keeping the longer (more evidence) one.
  const kept: string[] = [];
  for (const b of bullets) {
    const dupIdx = kept.findIndex((k) => tokenOverlapRatio(k, b) > overlapThreshold);
    if (dupIdx >= 0) {
      if (b.length > kept[dupIdx].length) kept[dupIdx] = b;
      continue;
    }
    kept.push(b);
  }

  // Step 2: only after dedup, enforce the hard ceiling.
  const capped = kept.length > hardMax ? kept.slice(0, hardMax) : kept;

  return {
    bullets: capped,
    reduced: capped.length !== from,
    from,
    to: capped.length,
  };
}
