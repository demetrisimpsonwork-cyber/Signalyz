/**
 * Prompt-injection neutralization for untrusted resume / job-description text.
 *
 * This does NOT try to be a perfect filter — it removes the obvious, high-signal
 * injection vectors (role markers, instruction overrides, hidden characters,
 * markup) while leaving normal resume prose intact. The primary defense is the
 * delimiter wrapping + system instruction in the prompt; this is defense in
 * depth.
 *
 * Pure and dependency-free so it runs under both Deno (edge) and Node (tests).
 */

export interface SanitizeResult {
  text: string;
  neutralized: boolean;
}

const INJECTION_PATTERNS: RegExp[] = [
  // ChatML / role tokens, e.g. <|im_start|>system
  /<\|[^|>]*\|>/g,
  // XML-ish role / instruction tags
  /<\/?(?:system|assistant|user|developer|instructions?|prompt)\b[^>]*>/gi,
  // Bracketed role / instruction tags, e.g. [system] [/INST]
  /\[\/?(?:system|assistant|user|developer|inst|instructions?|prompt)\]/gi,
  // Role markers at line start, e.g. "System:", "Assistant:", "Developer:"
  /^[ \t]*(?:system|assistant|developer)\s*:/gim,
  // "ignore previous instructions" family
  /ignore\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|earlier|above|preceding)\s+(?:instructions?|prompts?|messages?|context|directions?)/gi,
  /disregard\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|earlier|above|preceding)\b[^.\n]*/gi,
  /forget\s+(?:all\s+|everything\s+)?(?:previous|prior|above|earlier|you\s+were\s+told)\b[^.\n]*/gi,
  // Role reassignment / jailbreak phrasing
  /you\s+are\s+now\s+(?:a|an|the)\b[^.\n]*/gi,
  /\bnew\s+instructions?\s*:/gi,
  /\bsystem\s+prompt\s*:/gi,
  /\boverride\s+(?:the\s+)?(?:system|previous|prior)\b[^.\n]*/gi,
];

/** Remove invisible / zero-width / control characters (keeps \n and \t). */
function stripInvisible(text: string): string {
  return text.replace(
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\u2060\uFEFF]/g,
    "",
  );
}

/** Strip real HTML/XML tags without eating things like "<5%" or "a < b". */
function stripTags(text: string): string {
  return text.replace(/<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*?)?\/?>/g, " ");
}

/** Strip fenced code-block markers (``` and ~~~), which are common wrappers. */
function stripCodeFences(text: string): string {
  return text.replace(/```+[^\n]*/g, " ").replace(/~~~+[^\n]*/g, " ");
}

/**
 * Neutralize untrusted text before it is embedded in a Claude prompt.
 * Returns the cleaned text and whether anything was neutralized (for logging).
 */
export function sanitizeUntrustedText(input: string): SanitizeResult {
  if (!input) return { text: "", neutralized: false };

  const before = input;
  let t = stripInvisible(input);
  t = stripTags(t);
  t = stripCodeFences(t);

  for (const rx of INJECTION_PATTERNS) {
    t = t.replace(rx, " ");
  }

  // Collapse runs of spaces/tabs introduced by removals (preserve newlines).
  t = t.replace(/[^\S\n]{2,}/g, " ");
  // Trim trailing spaces on each line.
  t = t.replace(/[ \t]+\n/g, "\n");

  return { text: t, neutralized: t !== before };
}
