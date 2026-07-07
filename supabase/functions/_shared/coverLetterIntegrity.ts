/**
 * coverLetterIntegrity — deterministic output-integrity checks and safe helpers
 * for cover-letter text. Pure: no Deno/Node APIs. Importable from edge + vitest
 * + frontend (via relative path).
 */

export interface IntegrityResult {
  ok: boolean;
  issues: string[];
}

/** Mask time abbreviations so naive sentence splitters do not break "2 a.m." */
const TIME_ABBREV =
  /\b(\d{1,2})\s*(?:a\.?\s*m\.?|p\.?\s*m\.?)(?=\s|[.!?]|$)/gi;

/** Domains/emails — keep "Signalyz.ai" intact when splitting on periods. */
const DOMAIN_LITERAL =
  /\b(?:[A-Za-z0-9][-A-Za-z0-9]*\.[A-Za-z]{2,6}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,6})\b/g;

export function repairBrokenDomainSpacing(text: string): string {
  if (typeof text !== "string" || !text.trim()) return typeof text === "string" ? text : "";
  return text
    .replace(/\bSignalyz\.\s+ai\b/gi, "Signalyz.ai")
    .replace(/\b([A-Za-z0-9][-A-Za-z0-9]*)\.\s+ai\b/gi, "$1.ai")
    .replace(/\b([A-Za-z0-9][-A-Za-z0-9]*)\.\s+com\b/gi, "$1.com");
}

export function maskTimeAbbreviations(text: string): {
  masked: string;
  unmask: (value: string) => string;
} {
  if (typeof text !== "string" || !text.trim()) {
    return { masked: typeof text === "string" ? text : "", unmask: (v) => v };
  }
  const tokens = new Map<string, string>();
  let idx = 0;
  let masked = text.replace(TIME_ABBREV, (whole, _hour, offset, full) => {
    const key = `<<T${idx++}>>`;
    tokens.set(key, whole.replace(/\s+/g, " "));
    const after = full.slice(offset + whole.length);
    // Keep a sentence boundary when the time abbrev ends a clause before a new sentence.
    return /^\s+[A-Z]/.test(after) ? `${key}.` : key;
  });
  masked = masked.replace(DOMAIN_LITERAL, (whole, offset, full) => {
    const key = `<<D${idx++}>>`;
    tokens.set(key, whole);
    const after = full.slice(offset + whole.length);
    return /^\s+[A-Z]/.test(after) ? `${key}.` : key;
  });
  return {
    masked,
    unmask: (value: string) => {
      let out = value;
      for (const [key, original] of tokens) {
        out = out.split(`${key}.`).join(original);
        out = out.split(key).join(original);
      }
      return out;
    },
  };
}

/** Split into sentences without breaking masked time tokens or a.m./p.m. */
export function splitSentencesSafe(text: string): string[] {
  if (typeof text !== "string" || !text.trim()) return [];
  const { masked, unmask } = maskTimeAbbreviations(text);
  const matches = masked.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g) ?? [];
  return matches
    .map((sentence) => unmask(sentence.replace(/\s+/g, " ").trim()))
    .filter(Boolean);
}

/**
 * Final integrity validation — flag trust-breaking corruption artifacts.
 * Run after cleanup/segmentation; triggers retry or fallback when invalid.
 */
export function validateCoverLetterIntegrity(text: string): IntegrityResult {
  if (typeof text !== "string" || !text.trim()) {
    return { ok: false, issues: ["empty letter body"] };
  }

  const issues: string[] = [];

  if (/\bundefined\b|\bnull\b|\[object Object\]/i.test(text)) {
    issues.push("cleanup artifact in letter text");
  }

  if (/\bat \d{1,2} a\.\s*(?!m\.)/i.test(text)) {
    issues.push('broken time abbreviation ("at 2 a.")');
  }

  if (/\ba\.\s*\n+\s*m\./i.test(text) || /\bp\.\s*\n+\s*m\./i.test(text)) {
    issues.push("split time abbreviation across lines");
  }

  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  for (const para of paragraphs) {
    // Orphan fragments like "m. And someone..." or "n. And someone..."
    if (/^[a-z]{1,2}\.\s+(And|Or|But|So)\b/.test(para)) {
      issues.push("orphan fragment at paragraph start");
      break;
    }
    // Lowercase single-letter + period starting a paragraph (not "I.")
    if (/^[a-z]\.\s+[A-Za-z]/.test(para) && !/^i\.\s/i.test(para)) {
      issues.push("orphan single-letter fragment at paragraph start");
      break;
    }
  }

  if (/\.\s{2,}[a-z]\.\s+(And|Or)\b/i.test(text)) {
    issues.push("truncated word before orphan fragment");
  }

  if (/\bSignalyz\.\s+ai\b/i.test(text)) {
    issues.push("broken domain spacing (Signalyz.ai)");
  }

  if (/feel free to reach out at/i.test(text)) {
    issues.push("mid-body contact CTA");
  }

  return { ok: issues.length === 0, issues };
}

/** Remove mid-body phone/email reach-out CTAs from cover letter prose. */
export function stripMidBodyContactCta(text: string): string {
  if (typeof text !== "string" || !text.trim()) return typeof text === "string" ? text : "";
  return repairBrokenDomainSpacing(
    text
      .replace(
        /\s*[—–-]?\s*feel free to reach out at[\s\S]*?(?=\.|$)/gi,
        "",
      )
      .replace(/\s*[—–-]?\s*you can reach me at[\s\S]*?(?=\.|$)/gi, "")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([,.])/g, "$1")
      .trim(),
  );
}
