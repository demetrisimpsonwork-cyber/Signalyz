/**
 * User-facing evidence excerpt formatting for grounded recommendations.
 */

export const EVIDENCE_EXCERPT_MAX_CHARS = 200;

/** Cap a resume evidence snippet for display — never dump a full summary block. */
export function capEvidenceExcerpt(text: string, maxLen = EVIDENCE_EXCERPT_MAX_CHARS): string {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length <= maxLen) return trimmed;

  const sentenceEnd = trimmed.lastIndexOf(".", maxLen);
  if (sentenceEnd >= Math.floor(maxLen * 0.45)) {
    return trimmed.slice(0, sentenceEnd + 1);
  }

  const wordEnd = trimmed.lastIndexOf(" ", maxLen - 1);
  const end = wordEnd > Math.floor(maxLen * 0.55) ? wordEnd : maxLen;
  return `${trimmed.slice(0, end).trim().replace(/[,;\s]+$/, "")}…`;
}

/** Shorten a signal name when it is an entire gap sentence used as a registry key. */
export function shortenSignalLabel(signal: string, maxLen = 72): string {
  const trimmed = signal.trim();
  if (trimmed.length <= maxLen) return trimmed;
  const cut = trimmed.lastIndexOf(" ", maxLen - 1);
  const end = cut > maxLen * 0.5 ? cut : maxLen;
  return `${trimmed.slice(0, end).trim()}…`;
}

/** User-facing copy when the same resume evidence backs multiple gaps. */
export function formatDuplicateEvidenceNote(duplicateOfSignal: string): string {
  const label = shortenSignalLabel(duplicateOfSignal, 56);
  return `Same resume evidence as "${label}" — shown above.`;
}
