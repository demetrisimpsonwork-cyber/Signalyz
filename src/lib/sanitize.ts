import DOMPurify from "dompurify";

/**
 * Strip all HTML tags from user input text.
 * Used for resume text, JD text, and any freeform input.
 */
export function stripHtml(input: string): string {
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });
}

/** Decode the handful of HTML entities that survive tag stripping. */
function decodeBasicEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&hellip;/gi, "…");
}

/**
 * Normalize pasted resume / JD text without destroying legitimate formatting.
 *
 * - Strips real HTML tags (without eating "<5%" style content) and decodes entities
 * - Removes invisible / zero-width / control characters
 * - Normalizes smart quotes to straight quotes
 * - Collapses non-breaking spaces and runaway whitespace
 * - Cleans common Google Docs / LinkedIn copy-paste artifacts
 *
 * Runtime-agnostic (no DOM dependency) so it is safe in both the browser and tests.
 */
export function sanitizeResumeText(input: string): string {
  if (!input) return "";
  let t = input;

  // Real HTML/XML tags only — avoids matching "a < b" or "<5%".
  t = t.replace(/<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*?)?\/?>/g, " ");
  t = decodeBasicEntities(t);

  // Invisible / zero-width / control characters (keep \n and \t).
  t = t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\u2060\uFEFF]/g, "");

  // Non-breaking and exotic spaces → normal space.
  t = t.replace(/[\u00A0\u2007\u202F\u2009\u2002\u2003]/g, " ");

  // Smart quotes / dashes → ASCII-friendly equivalents.
  t = t
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/\u2026/g, "...");

  // LinkedIn / Google Docs paste artifacts.
  t = t.replace(/\u2022\t/g, "• ");           // bullet + tab → bullet + space
  t = t.replace(/[ \t]+\n/g, "\n");           // trailing spaces per line
  t = t.replace(/\n{3,}/g, "\n\n");           // collapse runaway blank lines
  t = t.replace(/[^\S\n]{2,}/g, " ");          // collapse multi-space runs (keep newlines)

  return t.trim();
}

/**
 * Sanitize HTML content for safe rendering with dangerouslySetInnerHTML.
 * Only allows basic text formatting tags.
 */
export function sanitizeHtml(input: string): string {
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: ["b", "i", "em", "strong", "br", "span"],
    ALLOWED_ATTR: [],
  });
}

/**
 * Input character limits for the application.
 */
export const INPUT_LIMITS = {
  RESUME: 15000,
  JD: 10000,
  LINKEDIN: 2000,
  NAME: 200,
  EMAIL: 200,
  PHONE: 200,
  ADDITIONAL_CONTEXT: 2000,
} as const;

/**
 * Enforce character limit on input text.
 */
export function enforceLimit(text: string, limit: number): string {
  return text.slice(0, limit);
}

/**
 * Validate email format.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validate file upload: type and size.
 */
export const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export function validateFileUpload(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_FILE_TYPES.includes(file.type as any)) {
    // Also check extension as fallback
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "pdf" && ext !== "docx") {
      return { valid: false, error: "Only PDF and DOCX files are accepted." };
    }
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: "File size must be under 5MB." };
  }
  return { valid: true };
}
