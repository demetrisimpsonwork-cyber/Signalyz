// Grammar repair for text left behind after unsupported-claim / metric stripping.
//
// When upstream guards delete an unsupported tool, domain, channel, or fabricated
// number from a sentence, they can leave visible scars such as:
//   "improving first-call resolution by % using ."
//   "scaled operations via , reducing cost"
//   "managed vendors ()"
// This module repairs those artifacts so the sentence reads as though it was always
// written that way. It never adds new content — it only removes residue and tidies
// punctuation.

const DANGLING_CONNECTORS = [
  "by", "using", "via", "through", "with", "for", "to", "of", "in", "on", "at",
  "from", "into", "across", "within", "and", "or", "but", "as", "that", "which",
  "including", "leveraging", "reaching", "totaling", "totalling", "such as",
  "up to", "while", "where",
];

const CONNECTOR_ALT = DANGLING_CONNECTORS
  .map((c) => c.replace(/\s+/g, "\\s+"))
  .join("|");

// The (?<!-) guard prevents stripping the tail of a hyphenated compound
// (e.g. "follow-through." must not collapse to "follow-.").
const DANGLING_BEFORE_PUNCT = new RegExp(
  `(?<!-)\\b(?:${CONNECTOR_ALT})\\b\\s*(?=[.,;:!?)]|$)`,
  "gi",
);

const TRAILING_CONNECTOR = new RegExp(
  `\\s+\\b(?:${CONNECTOR_ALT})\\b\\s*$`,
  "i",
);

/**
 * Repair grammatical artifacts left by claim/metric stripping.
 * Idempotent: runs to a fixed point so cascading scars ("by % using .") fully resolve.
 */
export function repairStrippedGrammar(input: string): string {
  if (typeof input !== "string") return "";
  let text = input;
  let previous = "";
  let guard = 0;
  while (text !== previous && guard < 6) {
    previous = text;
    text = onePass(text);
    guard++;
  }
  return finalize(text);
}

function onePass(text: string): string {
  let t = text;

  // Orphaned symbols left when a number was removed (e.g. "by %", "$ ").
  t = t.replace(/(?<![\d.])\s*%/g, ""); // % not preceded by a digit
  t = t.replace(/\$\s*(?!\d)/g, "");     // $ not followed by a digit

  // Empty brackets / parentheses left by removed content.
  t = t.replace(/\(\s*[,;:.\-—]?\s*\)/g, "");
  t = t.replace(/\[\s*[,;:.\-—]?\s*\]/g, "");
  t = t.replace(/\{\s*[,;:.\-—]?\s*\}/g, "");

  // Dangling connectors immediately before terminal punctuation or end of string.
  t = t.replace(DANGLING_BEFORE_PUNCT, "");

  // Collapse accidental double prepositions ("in in", "to to", "of of").
  t = t.replace(/\b(by|to|of|in|on|at|for|with|from|as)\s+\1\b/gi, "$1");

  // Punctuation tidy.
  t = t
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/([,;:])\1+/g, "$1")
    .replace(/,\s*\./g, ".")
    .replace(/\.\s*,/g, ".")
    .replace(/\.{2,}/g, ".")
    .replace(/,\s*,/g, ",")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s+[-–—]\s*(?=[.,;:!?]|$)/g, "") // dangling hyphen/dash
    .trim();

  // Strip leading punctuation/space artifacts.
  t = t.replace(/^[\s,;:.\-—]+/, "");

  // Strip a connector word stranded at the very end (no trailing punctuation).
  t = t.replace(TRAILING_CONNECTOR, "");

  // Trailing stray separators.
  t = t.replace(/[\s,;:\-–—]+$/, "");

  return t.trim();
}

function finalize(text: string): string {
  let t = text.trim();
  if (!t) return "";
  // Capitalize the first alphabetical character.
  t = t.replace(/^([^A-Za-z]*)([a-z])/, (_m, pre: string, ch: string) => pre + ch.toUpperCase());
  // Ensure terminal punctuation.
  if (!/[.!?]$/.test(t)) t += ".";
  return t;
}
