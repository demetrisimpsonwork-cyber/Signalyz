/**
 * resumeTextPolish — deterministic, attachment-ready grammar polish for
 * calibrated-resume summary, bullets, and project descriptions.
 *
 * Pure: string in → string out. Conservative by design — it only inserts a
 * missing article before a small set of singular nouns after a preposition, and
 * fixes a couple of known awkward phrasings. It never changes casing (so "SAP"
 * stays "SAP"), never touches hyphenated compounds ("follow-through"), and never
 * rewrites verbs (so pastTense output like "Independently"/"Demonstrated" is
 * left intact).
 */

// Singular nouns that read wrong without an article after a preposition
// ("in regulated environment" → "in a regulated environment").
const ARTICLE_NOUNS =
  "environment|portfolio|role|process|workflow|setting|pipeline|queue|department|division|organization|market|framework|team";

// Words that already determine the noun — if one of these leads, do nothing.
const DETERMINERS = new Set([
  "a", "an", "the", "this", "that", "these", "those", "its", "our", "their",
  "his", "her", "my", "your", "each", "every", "one", "no", "any", "some",
  "several", "multiple", "various", "many", "few", "two", "three", "other",
  "another", "same", "both", "all", "such",
]);

const ARTICLE_RX = new RegExp(
  // Modifiers may be comma-separated adjectives, e.g. "compliance-sensitive, auditable environment".
  `\\b(across|in|within|into|through|from|under)\\s+((?:[a-z][a-z-]*,?\\s+){0,3})(${ARTICLE_NOUNS})\\b`,
  "gi",
);

/** Insert a missing "a"/"an" before singular nouns that follow a preposition. */
function addMissingArticles(text: string): string {
  return text.replace(ARTICLE_RX, (whole, prep: string, mods: string, noun: string) => {
    const firstWord = ((mods || "").trim().split(/\s+/)[0] || noun)
      .replace(/,$/, "")
      .toLowerCase();
    if (DETERMINERS.has(firstWord)) return whole; // already determined
    const article = /^[aeiou]/i.test(firstWord) ? "an" : "a";
    return `${prep} ${article} ${mods}${noun}`;
  });
}

/**
 * Apply deterministic text polish to a piece of resume prose.
 * Safe to call on the summary, any bullet, or a project description.
 */
export function polishResumeText(text: string): string {
  if (typeof text !== "string" || !text.trim()) return typeof text === "string" ? text : "";
  let t = text;

  // Awkward fixed phrasings. Only the ungrammatical "at same time" (missing
  // "the") is normalized — the correct "at the same time" is left untouched.
  t = t.replace(/\bat same time\b/gi, "simultaneously");

  // Missing articles after prepositions.
  t = addMissingArticles(t);

  // Collapse any accidental double spaces introduced above.
  t = t.replace(/[ \t]{2,}/g, " ");
  return t;
}
