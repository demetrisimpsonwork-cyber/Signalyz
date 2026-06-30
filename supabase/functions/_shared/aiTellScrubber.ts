/**
 * scrubAiTells — deterministic, grammar-safe removal of the most common AI
 * writing "tells" from generated resume prose (summary + experience bullets).
 *
 * This is a SAFETY NET applied after generation; the prompts are the primary
 * control. To avoid corrupting legitimate domain terminology (e.g. "dynamic
 * pricing", "various stakeholders"), this scrubber ONLY performs substitutions
 * that are always safe and essentially never the better word in real resume
 * writing:
 *
 *   utilize/utilized/utilizing → use/used/using
 *   leveraged/leveraging       → used/using
 *   "in order to"              → "to"
 *
 * Adjective-style buzzwords ("dynamic", "passionate", "results-driven",
 * "various", "demonstrates") are handled at the prompt level, because blanket
 * deletion mid-sentence risks breaking grammar or removing real domain terms.
 *
 * Pure: string in → string out.
 */

/** Preserve the leading-capital case of the matched token on its replacement. */
function matchCase(matched: string, replacement: string): string {
  if (!matched) return replacement;
  const first = matched[0];
  if (first === first.toUpperCase() && first !== first.toLowerCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

const UTILIZE_MAP: Record<string, string> = {
  utilize: "use",
  utilizes: "uses",
  utilized: "used",
  utilizing: "using",
  utilization: "use",
};

export function scrubAiTells(input: string): string {
  if (typeof input !== "string" || !input) return typeof input === "string" ? input : "";
  let t = input;

  // utilize family → use family
  t = t.replace(/\butiliz(?:e|es|ed|ing|ation)\b/gi, (m) => {
    const base = UTILIZE_MAP[m.toLowerCase()] ?? "use";
    return matchCase(m, base);
  });

  // leveraged / leveraging (verb forms only — leaves the noun "leverage" alone)
  t = t.replace(/\bleveraged\b/gi, (m) => matchCase(m, "used"));
  t = t.replace(/\bleveraging\b/gi, (m) => matchCase(m, "using"));

  // "in order to" → "to"
  t = t.replace(/\bin order to\b/gi, (m) => matchCase(m, "to"));

  // collapse any double spacing introduced above (none of the swaps add spaces,
  // but keep output clean regardless)
  t = t.replace(/[ \t]{2,}/g, " ");

  return t;
}
