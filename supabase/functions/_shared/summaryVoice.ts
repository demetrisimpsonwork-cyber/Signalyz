/**
 * enforceSummaryVoice — deterministic voice guard for the calibrated-resume
 * Professional Summary.
 *
 * The Professional Summary must read like an elite executive resume writer's
 * work: IMPLIED FIRST PERSON, with no candidate name, no third-person pronouns,
 * and no narration of the resume document itself.
 *
 * This is a SAFETY NET applied after AI generation — the generation prompt is
 * the primary control. It only normalizes the summary string; it performs no
 * I/O and touches nothing else in the pipeline.
 *
 * Pure: string in → string out.
 */

export interface SummaryVoiceOptions {
  /** Candidate name(s) to scrub (e.g. the parsed resume header name). */
  names?: string[];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Third-person references that must never appear in an implied-first-person summary.
const THIRD_PERSON_RX = /\b(he|she|they|him|his|her|hers|them|their|theirs)\b/gi;

// Phrases that narrate the resume/candidate rather than stating experience.
const NARRATION_PATTERNS: RegExp[] = [
  /\bthe candidate(?:'s)?\b/gi,
  /\bthe (?:resume|résumé|cv)\s+(?:shows?|demonstrates?|indicates?|reflects?|lists?|states?|notes?)\b/gi,
  /\bexperience includes\b/gi,
  /\b(?:is|are|was|were)\s+listed\b/gi,
  /\blisted\b/gi,
  /\bthroughout\b/gi,
  /\bwork history\b/gi,
  /\b(?:resume|résumé)\b/gi,
];

/** Clean up grammar/punctuation artifacts left behind by token removal. */
function tidy(text: string): string {
  let t = text;
  t = t.replace(/\s{2,}/g, " ");
  // remove space before punctuation
  t = t.replace(/\s+([,.;:])/g, "$1");
  // connector immediately before clause/terminal punctuation = dangling → drop it.
  // The (?<!-) guard prevents stripping the tail of a hyphenated compound
  // (e.g. "follow-through." must not become "follow-.").
  t = t.replace(/(?<!-)\b(?:and|but|with|via|using|through|by|for|to|of|in|on|at|as)\s*([.,;:])/gi, "$1");
  // collapse duplicate punctuation
  t = t.replace(/([,.;:])\1+/g, "$1");
  t = t.replace(/,\s*\./g, ".");
  // leading dangling punctuation / connectors at the very start
  t = t.replace(/^[\s,;:]+/, "");
  t = t.replace(/^(?:and|but|with|via|using|through|by)\b[\s,]+/i, "");
  // clause boundaries left with orphan punctuation after a removal
  t = t.replace(/([.!?])\s*[,;:]+\s*/g, "$1 ");
  t = t.replace(/\s{2,}/g, " ").trim();
  // capitalize the first letter of each sentence
  t = t.replace(/(^|[.!?]\s+)([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());
  // single, clean terminal period
  t = t.replace(/[\s,;:]+$/, "");
  if (t && !/[.!?]$/.test(t)) t += ".";
  return t;
}

/**
 * Enforce implied-first-person voice on a Professional Summary.
 * Removes candidate name(s), third-person pronouns, and resume-narration
 * phrasing, then repairs the resulting grammar.
 */
export function enforceSummaryVoice(
  input: string,
  options: SummaryVoiceOptions = {},
): string {
  if (typeof input !== "string" || !input.trim()) return "";
  let t = input;

  // 1. Scrub candidate name(s) — full name and individual tokens.
  for (const raw of options.names ?? []) {
    const name = (raw || "").trim();
    if (!name) continue;
    t = t.replace(new RegExp(`\\b${escapeRegExp(name)}(?:'s)?\\b`, "gi"), "");
    for (const token of name.split(/\s+/)) {
      if (token.length >= 2) {
        t = t.replace(new RegExp(`\\b${escapeRegExp(token)}(?:'s)?\\b`, "gi"), "");
      }
    }
  }

  // 2. Remove resume-narration phrases.
  for (const rx of NARRATION_PATTERNS) t = t.replace(rx, "");

  // 3. Remove third-person pronouns (implied first person only).
  t = t.replace(THIRD_PERSON_RX, "");

  return tidy(t);
}
