// Bullet strength ranking and opening-verb diversification.
//
// Priority 3 — within a single role, lead with the strongest, most defensible
// bullet. Strength favors measurable outcomes, ownership, scope/complexity, and
// decision-making. Facts are never moved across roles.
//
// Priority 4 — reduce detectable AI rhythm by varying repeated leading verbs
// (Managed... Coordinated... Supported... Handled...) with close, meaning-
// preserving synonyms. Verbs are only ever swapped for equivalents of similar
// register, so no claim is strengthened or weakened.

const STRONG_LEAD_VERBS = new Set([
  "led", "drove", "owned", "architected", "directed", "launched", "built", "scaled",
  "spearheaded", "established", "redesigned", "transformed", "overhauled", "founded",
  "negotiated", "secured", "delivered", "executed", "championed", "pioneered",
]);

const PARTIAL_LEAD_VERBS = new Set([
  "managed", "coordinated", "developed", "created", "implemented", "designed",
  "improved", "streamlined", "oversaw", "administered", "trained", "supervised",
  "resolved", "optimized", "automated", "standardized", "facilitated",
]);

const PASSIVE_LEAD_VERBS = new Set([
  "helped", "assisted", "supported", "participated", "involved", "tasked",
  "responsible", "handled", "worked", "contributed",
]);

const OUTCOME_TERMS = [
  "increased", "reduced", "improved", "grew", "saved", "achieved", "exceeded",
  "decreased", "boosted", "lowered", "raised", "generated", "eliminated",
  "accelerated", "resulting in", "leading to", "which led to", "driving", "enabling",
];

const SCOPE_RX =
  /(?:\bcross[- ]?functional\b|\bend[- ]?to[- ]?end\b|\benterprise[- ]?wide\b|\bcompany[- ]?wide\b|\bmulti[- ]?site\b|\bhigh[- ]?volume\b|\bp&l\b|\bbudget\b|\brevenue\b|\bportfolio\b|\bregional\b|\bnationwide\b|\bglobal\b|\bgovernance\b)/gi;

const DECISION_RX =
  /\b(decid|prioriti|strateg|roadmap|negotiat|approv|authoriz|govern|policy|framework|allocat)/i;

/** Score a single bullet's evidence strength. Higher = stronger / lead-worthy. */
export function scoreBulletStrength(bullet: string): number {
  const text = (bullet || "").trim();
  if (!text) return Number.NEGATIVE_INFINITY;
  const lower = text.toLowerCase();
  let score = 0;

  // Measurable outcome (strongest signal).
  if (/\d+(?:\.\d+)?\s?%/.test(text)) score += 5;
  if (/\$\s?\d/.test(text)) score += 5;
  if (/\b\d+(?:\.\d+)?\s?[x×]\b/.test(text)) score += 4;
  else if (/\b\d[\d,]*\+?\b/.test(text)) score += 2; // any other quantity

  // Outcome language.
  if (OUTCOME_TERMS.some((t) => lower.includes(t))) score += 3;

  // Scope / complexity.
  const scopeHits = (text.match(SCOPE_RX) || []).length;
  score += Math.min(scopeHits, 3) * 2;

  // Ownership via the leading verb.
  const firstWord = lower.split(/\s+/)[0]?.replace(/[^a-z]/g, "") || "";
  if (STRONG_LEAD_VERBS.has(firstWord)) score += 3;
  else if (PARTIAL_LEAD_VERBS.has(firstWord)) score += 1;
  else if (PASSIVE_LEAD_VERBS.has(firstWord)) score -= 2;

  // Decision-making cues.
  if (DECISION_RX.test(lower)) score += 2;

  // Mild complexity bonus (detailed bullets edge out terse ones), capped.
  score += Math.min(text.length / 80, 2);

  return score;
}

/**
 * Reorder bullets within a single role so the strongest leads. Stable for ties
 * (original order preserved). Facts are not modified, only reordered.
 */
export function rankBulletsByStrength(bullets: string[]): string[] {
  if (!Array.isArray(bullets) || bullets.length < 2) return bullets || [];
  return bullets
    .map((b, i) => ({ b, i, s: scoreBulletStrength(b) }))
    .sort((a, b) => (b.s - a.s) || (a.i - b.i))
    .map((x) => x.b);
}

// Meaning-preserving leading-verb synonyms (similar register, no inflation).
const LEAD_SYNONYMS: Record<string, string[]> = {
  managed: ["oversaw", "directed", "administered", "headed"],
  coordinated: ["organized", "orchestrated", "arranged", "aligned"],
  supported: ["assisted", "aided", "backed", "bolstered"],
  handled: ["processed", "addressed", "fielded", "administered"],
  led: ["directed", "headed", "guided", "drove"],
  oversaw: ["supervised", "directed", "monitored", "managed"],
  maintained: ["sustained", "upheld", "preserved", "kept"],
  developed: ["built", "created", "designed", "established"],
  created: ["built", "developed", "produced", "established"],
  improved: ["enhanced", "strengthened", "upgraded", "refined"],
  trained: ["coached", "mentored", "onboarded", "instructed"],
  provided: ["delivered", "offered", "supplied", "furnished"],
  assisted: ["aided", "supported", "helped", "backed"],
  processed: ["handled", "completed", "executed", "cleared"],
  communicated: ["liaised", "corresponded", "conveyed", "relayed"],
  collaborated: ["partnered", "teamed", "worked", "cooperated"],
  monitored: ["tracked", "reviewed", "watched", "audited"],
  resolved: ["addressed", "settled", "remedied", "cleared"],
  organized: ["arranged", "coordinated", "structured", "ordered"],
  delivered: ["provided", "produced", "supplied", "completed"],
  implemented: ["deployed", "introduced", "rolled out", "instituted"],
};

/**
 * Diversify repeated leading verbs across a sequence of bullets to reduce AI
 * rhythm. Uses a shared `used` counter so repetition is reduced across the whole
 * resume, not just within one role. Only swaps when a verb has already appeared
 * and a fresh synonym is available; otherwise leaves the bullet untouched.
 */
export function diversifyBulletOpenings(
  bullets: string[],
  used: Map<string, number> = new Map(),
): string[] {
  if (!Array.isArray(bullets)) return [];
  return bullets.map((bullet) => {
    if (typeof bullet !== "string" || !bullet.trim()) return bullet;
    const match = bullet.match(/^([A-Za-z][a-z]+)(\b[\s\S]*)$/);
    if (!match) return bullet;
    const original = match[1];
    const rest = match[2];
    const key = original.toLowerCase();

    const seen = used.get(key) || 0;
    if (seen === 0) {
      used.set(key, 1);
      return bullet;
    }

    const synonyms = LEAD_SYNONYMS[key];
    if (!synonyms || synonyms.length === 0) {
      used.set(key, seen + 1);
      return bullet;
    }

    const replacement = synonyms.find((syn) => (used.get(syn) || 0) === 0);
    if (!replacement) {
      used.set(key, seen + 1);
      return bullet;
    }

    used.set(replacement, 1);
    return matchCase(original, replacement) + rest;
  });
}

function matchCase(source: string, target: string): string {
  if (source === source.toUpperCase()) return target.toUpperCase();
  if (source[0] === source[0]?.toUpperCase()) {
    return target.charAt(0).toUpperCase() + target.slice(1);
  }
  return target;
}
