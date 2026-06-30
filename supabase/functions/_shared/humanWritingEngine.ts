/**
 * humanWritingEngine — shared writing-quality layer for long-form generated
 * outputs (calibrated resume, cover letter, LinkedIn, positioning report).
 *
 * Two parts:
 *  1. Reusable PROMPT BLOCKS — drop these into existing system/user prompts so
 *     the model writes like a top human resume writer (primary control).
 *  2. humanizeProse() — a deterministic, grammar-safe post-processor that
 *     rewrites/removes the most common AI tells from generated prose
 *     (safety net). It never adds an AI call and never changes interfaces.
 *
 * Scope: writing quality only. No scoring, parsing, fabrication, ranking, or
 * export logic lives here. Pure string transforms.
 */

import { scrubAiTells } from "./aiTellScrubber.ts";

// ──────────────────────────────────────────────────────────────────────────
// PROMPT BLOCKS
// ──────────────────────────────────────────────────────────────────────────

/** Core anti-AI writing rules. Applies to every long-form output. */
export const HUMAN_WRITING_RULES = `HUMAN WRITING (write like a top human resume writer, not an LLM):
- Aggressively avoid these AI tells — rewrite naturally, never just delete in a way that breaks grammar:
  "this demonstrates", "this experience demonstrates", "this foundation", "that discipline applies", "transferable skills", "applicable experience", "relevant experience", "throughout my career", "in this role", "this opportunity", "I believe", "I am excited", "I am writing to apply", "I would welcome the opportunity", "the conversation this letter is meant to start", "leveraged", "utilized", "results-driven", "dynamic", "passionate", "proven track record", "skilled professional".
- Prefer direct, concrete language over corporate filler. Cut words that don't add meaning.
- Vary sentence length and structure. No two sentences in a row should share the same shape or opening word.
- Do not over-explain. Trust the reader. State the fact; don't narrate why it matters in every sentence.`;

/** Narrative judgment: stop the fact→keyword→fact→keyword pattern. */
export const NARRATIVE_PRINCIPLE = `NARRATIVE JUDGMENT:
- Do NOT write in a "resume fact → JD keyword → resume fact → JD keyword" loop.
- Use this arc instead: professional identity → evidence → evidence → why this role makes sense.
- Make fewer but stronger connections. The reader does not need every sentence to map explicitly to the job description.`;

/** Resume Professional Summary voice + sharpness. */
export const SUMMARY_STANDARD = `SUMMARY STANDARD:
- Lead with a sharp professional identity, not a generic label. Avoid openers like "Customer support professional with...", "Experienced professional with...", "Results-driven professional...".
- Prefer identity grounded in environment and stakes, e.g. "Operations professional experienced in high-volume, accuracy-critical environments where documentation, investigation, and process integrity directly affect business outcomes."
- Keep implied first person: no candidate name, no third-person pronouns, no narration of the resume.`;

/** Experience bullet craft. */
export const BULLET_STANDARD = `BULLET STANDARD (professionally edited, not mechanically rewritten):
- Prefer: concrete action → clear responsibility → evidence → outcome (only when the source supports it).
- Avoid: repeated openings, bloated bullets, generic filler, overuse of "managed/coordinated/maintained", and forced JD terminology.
- Never fabricate metrics, authority, or domain (warehouse/inventory/technical) terms the resume does not support.`;

/** Cover letter standard — sound like a real person. */
export const COVER_LETTER_STANDARD = `COVER LETTER STANDARD (sound like a real, credible person — not an essay, template, LinkedIn post, or AI argument):
- Structure: strong human opening → specific proof from the resume → specific proof from the resume → honest bridge to the target role → confident close.
- Avoid fake enthusiasm and company flattery. Banned: "I am excited to apply", "I believe I would be a strong fit", "I would welcome the opportunity", "Thank you for your consideration", "I am writing to apply".
- If the candidate is switching domains, acknowledge the transfer honestly without over-selling. Example tone: "While I have not worked on a warehouse floor, I have spent years reconciling records, catching discrepancies before they became larger problems, and documenting every step. The environment changes, but the habit of accuracy does not."
- Grounded, direct, credible. No exaggeration.`;

/** LinkedIn standard. */
export const LINKEDIN_STANDARD = `LINKEDIN STANDARD:
- Sound like a real high-performing professional — clear, confident, specific, human, grounded.
- Not copied resume bullets. Not corporate filler. Not fake thought leadership.
- No unsupported tools, industries, or claims.`;

/** Positioning / hiring report standard. */
export const REPORT_STANDARD = `REPORT STANDARD (an expert recruiter explaining the truth clearly):
- Plain language over jargon. Examples: "This helps you.", "This may hold you back.", "This is worth surfacing.", "Do not claim this unless you can defend it."
- No repetitive diagnostic phrasing, no over-explaining, and no contradictions (never mark the same concept as both matched and missing).`;

/**
 * Recruiter Psychology — the writing-psychology layer shared by every long-form
 * output. The goal is recruiter TRUST, not more keywords, enthusiasm, or
 * explanation. Inject alongside the output-specific STANDARD blocks.
 */
export const RECRUITER_PSYCHOLOGY = `RECRUITER PSYCHOLOGY (write to build recruiter trust, not to impress):
- Write like an elite resume writer and former recruiter. Every sentence must make the candidate more believable, hireable, or credible. If a sentence does not, cut it or rewrite it.
- Prefer quiet authority over hype: concrete evidence, specific responsibility, clear scope, accurate outcomes, believable confidence. Never over-sell.
- Each sentence should silently answer a recruiter's real questions — can this person do the job, handle the environment, own accuracy and follow-through, and be trusted — through evidence. Never state those questions directly.
- Reduce or rewrite weak, low-credibility patterns (rewrite naturally, never delete in a way that breaks grammar): "demonstrated ability", "proven track record", "successfully", "strategic", "key", "effective", "relevant experience", "applicable experience", "transferable skills", "this demonstrates", "this experience", "this foundation", "that discipline applies", "throughout my career", "I believe", "I am excited", "I am writing to apply", "I would welcome the opportunity", "additionally", "furthermore", "in this role", "this opportunity".
- Anti-repetition: each artifact has a different job — do not reuse the same evidence angle across the packet. Summary = high-level value proposition; bullets = specific proof; cover letter = human narrative and fit; LinkedIn = professional positioning; hiring report = recruiter interpretation of risk and opportunity.
- Quality bar before finalizing each section: "Would a skeptical recruiter believe a top-tier human resume writer produced this?" If not, rewrite. Never invent, exaggerate, inflate, or weaken fabrication safeguards.`;

// ──────────────────────────────────────────────────────────────────────────
// DETERMINISTIC POST-PROCESSOR
// ──────────────────────────────────────────────────────────────────────────

// Domain nouns where "dynamic" is a legitimate technical term and must be kept.
const DYNAMIC_DOMAIN = "(?:pricing|programming|range|content|data|allocation|scaling|link|ip|dns|host|library|typing)";

// Grammar-safe phrase rewrites. Order matters (specific → general).
const PHRASE_REWRITES: Array<[RegExp, string]> = [
  [/\bthis(?:\s+experience)?\s+demonstrates(?:\s+that)?\b\s*/gi, ""],
  [/\bthis foundation\b\s*/gi, ""],
  [/\bthroughout my career,?\s*/gi, ""],
  [/\bin this role,?\s*/gi, ""],
  [/\bthis opportunity\b/gi, "this role"],
  [/\btransferable skills include\b/gi, "experience includes"],
  [/\b(?:transferable|applicable|relevant) skills\b/gi, "experience"],
  [/\b(?:applicable|relevant) experience\b/gi, "experience"],
  // "experience" is uncountable, so any indefinite article in front of the
  // replaced phrase must be consumed too — otherwise we'd emit "a experience".
  [/\b(?:a|an)\s+proven track record of\b/gi, "experience"],
  [/\bproven track record of\b/gi, "experience"],
  [/\b(?:a|an)\s+proven track record\b/gi, "experience"],
  [/\bproven track record\b/gi, "experience"],
  // "proven ability to X" / "demonstrated ability to X" are PROMPT-ONLY.
  // Swapping the noun phrase for "experience" leaves a dangling "a experience"
  // or an ungrammatical "experience to X"; gerund conversion ("X-ing") is not
  // safe for irregular verbs. The prompt layer bans these instead.
  [/\bskilled professional\b/gi, "professional"],
  [/\bpassionate about\b/gi, "focused on"],
  [/\bresults[-\s]driven\b,?\s*/gi, ""],
  [/\bpassionate\b,?\s*/gi, ""],
  // P9: leading filler — "I believe (that)" hedges credibility, "successfully"
  // is an empty intensifier before a verb. Both are safe to drop.
  [/\bI believe (?:that )?/gi, ""],
  [/\bsuccessfully\s+/gi, ""],
  [new RegExp(`\\bdynamic\\b,?\\s+(?!${DYNAMIC_DOMAIN}\\b)`, "gi"), ""],
];

// P9: formulaic sentence-initial transitions add no meaning. Stripped only at a
// sentence boundary so mid-sentence uses of these words are never touched.
const LEADING_TRANSITIONS = /(^|[.!?]\s+)(?:additionally|furthermore|moreover|in conclusion)\b,?\s*/gi;

// Whole sentences dominated by AI filler are dropped (these are never real proof).
const DROP_MARKERS = [
  "i am excited",
  "i am writing to apply",
  "i would welcome the opportunity",
  "the conversation this letter is meant to start",
  "that discipline applies",
  "thank you for your consideration",
];

function tidy(text: string): string {
  let t = text;
  t = t.replace(/[ \t]{2,}/g, " ");
  t = t.replace(/\s+([,.;:!?])/g, "$1");
  t = t.replace(/([,;:])\1+/g, "$1");
  t = t.replace(/,\s*\./g, ".");
  t = t.replace(/([.!?])\s*[,;:]+\s*/g, "$1 ");
  t = t.replace(/^[\s,;:]+/, "");
  t = t.replace(/[ \t]{2,}/g, " ").trim();
  t = t.replace(/(^|[.!?]\s+)([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());
  return t;
}

/**
 * Rewrite/remove common AI tells from generated prose while preserving clean,
 * human writing and legitimate domain terms. Safe to run on full paragraphs.
 */
export function humanizeProse(input: string): string {
  if (typeof input !== "string" || !input.trim()) return typeof input === "string" ? input : "";

  // 1. Word-level swaps (utilize→use, leveraged→used, "in order to"→"to").
  let t = scrubAiTells(input);

  // 2. Grammar-safe phrase rewrites.
  for (const [rx, rep] of PHRASE_REWRITES) t = t.replace(rx, rep);

  // 2b. Strip formulaic transitions at sentence starts (keep the boundary).
  t = t.replace(LEADING_TRANSITIONS, (_m, boundary: string) => boundary);

  // 3. Drop whole sentences that are pure AI filler.
  const sentences = t.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((s) => {
    const low = s.toLowerCase();
    return !DROP_MARKERS.some((m) => low.includes(m));
  });
  let out = kept.length ? kept.join(" ") : t;

  out = tidy(out);
  // Never return empty for non-empty input (fall back to phrase-rewritten text).
  if (!out.trim()) out = tidy(t);
  return out;
}
