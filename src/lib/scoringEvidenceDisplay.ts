import type {
  EvidenceConfidence,
  ScoringEvidence,
  ScoringEvidenceLink,
  ScoringEvidenceLinkage,
  ScoringEvidenceRef,
} from "@/lib/scoringEvidenceTypes";

/** Maximum characters shown for a resume excerpt in UI. */
export const DISPLAY_EXCERPT_MAX_LENGTH = 160;

export interface DisplayExcerpt {
  excerpt: string;
  section: string;
  company: string;
}

export interface DisplayEvidenceLink {
  signal: string;
  linkage: ScoringEvidenceLinkage;
  excerpts: DisplayExcerpt[];
}

export type ConfidenceTone = EvidenceConfidence;

export interface DisplayConfidence {
  label: string;
  tone: ConfidenceTone;
}

export interface DisplayLinksResult {
  matched: DisplayEvidenceLink[];
  missing: DisplayEvidenceLink[];
  confidence: DisplayConfidence;
}

const LINKAGE_STRENGTH: Record<ScoringEvidenceLinkage, number> = {
  supports: 0,
  partial: 1,
  absent: 2,
};

function excerptFingerprint(ref: ScoringEvidenceRef): string {
  return `${ref.content.trim()}|${ref.section}|${ref.company}`;
}

function strongestSimilarity(link: ScoringEvidenceLink): number {
  if (link.evidence.length === 0) return -1;
  return Math.max(...link.evidence.map((ref) => ref.similarity));
}

function compareMatchedLinks(a: ScoringEvidenceLink, b: ScoringEvidenceLink): number {
  const linkageDiff = LINKAGE_STRENGTH[a.linkage] - LINKAGE_STRENGTH[b.linkage];
  if (linkageDiff !== 0) return linkageDiff;
  return strongestSimilarity(b) - strongestSimilarity(a);
}

/** Missing gaps: surface absent first, then weaker support. */
function compareMissingLinks(a: ScoringEvidenceLink, b: ScoringEvidenceLink): number {
  const absentDiff = LINKAGE_STRENGTH[b.linkage] - LINKAGE_STRENGTH[a.linkage];
  if (absentDiff !== 0) return absentDiff;
  return strongestSimilarity(b) - strongestSimilarity(a);
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Formats a retrieved evidence ref for safe UI display. */
export function formatExcerpt(ref: Pick<ScoringEvidenceRef, "content" | "section" | "company">): DisplayExcerpt {
  const normalized = normalizeWhitespace(ref.content);
  const excerpt =
    normalized.length <= DISPLAY_EXCERPT_MAX_LENGTH
      ? normalized
      : `${normalized.slice(0, DISPLAY_EXCERPT_MAX_LENGTH - 1).trimEnd()}…`;

  return {
    excerpt,
    section: ref.section?.trim() || "unknown",
    company: ref.company?.trim() || "",
  };
}

/** Maps evidence_confidence to user-facing label and tone. */
export function confidenceLabel(confidence: EvidenceConfidence): DisplayConfidence {
  switch (confidence) {
    case "high":
      return { label: "High coverage", tone: "high" };
    case "medium":
      return { label: "Medium coverage", tone: "medium" };
    default:
      return { label: "Low coverage", tone: "low" };
  }
}

function toDisplayLink(
  link: ScoringEvidenceLink,
  seenExcerpts: Set<string>,
): DisplayEvidenceLink {
  const sortedRefs = [...link.evidence].sort((a, b) => b.similarity - a.similarity);
  const excerpts: DisplayExcerpt[] = [];

  for (const ref of sortedRefs) {
    const fingerprint = excerptFingerprint(ref);
    if (seenExcerpts.has(fingerprint)) continue;
    seenExcerpts.add(fingerprint);
    excerpts.push(formatExcerpt(ref));
  }

  return {
    signal: link.signal,
    linkage: link.linkage,
    excerpts,
  };
}

function pickLinks(
  links: ScoringEvidenceLink[],
  compare: (a: ScoringEvidenceLink, b: ScoringEvidenceLink) => number,
  maxLinks: number,
  seenExcerpts: Set<string>,
): DisplayEvidenceLink[] {
  const sorted = [...links].sort(compare);
  const selected: DisplayEvidenceLink[] = [];

  for (const link of sorted) {
    if (selected.length >= maxLinks) break;
    const displayLink = toDisplayLink(link, seenExcerpts);
    selected.push(displayLink);
  }

  return selected;
}

/**
 * Prepares scoring_evidence for UI consumption.
 * Never synthesizes evidence — only formats existing references.
 */
export function pickDisplayLinks(
  scoringEvidence: ScoringEvidence | null | undefined,
  isPro: boolean,
): DisplayLinksResult {
  const confidence = confidenceLabel(scoringEvidence?.evidence_confidence ?? "low");

  if (!scoringEvidence) {
    return { matched: [], missing: [], confidence };
  }

  const maxMatched = isPro ? 2 : 1;
  const maxMissing = isPro ? 2 : 1;
  const seenExcerpts = new Set<string>();

  const matched = pickLinks(
    scoringEvidence.matched_evidence,
    compareMatchedLinks,
    maxMatched,
    seenExcerpts,
  );

  const missing = pickLinks(
    scoringEvidence.missing_evidence,
    compareMissingLinks,
    maxMissing,
    seenExcerpts,
  );

  return { matched, missing, confidence };
}

/** Test helper — ensures display payloads omit internal metadata fields. */
export function assertDisplayPayloadSafe(value: unknown): void {
  const forbidden = ["evidence_id", "similarity", "relevance_reason", "role_title", "explanation_hint"];
  const json = JSON.stringify(value);
  for (const key of forbidden) {
    if (json.includes(`"${key}"`)) {
      throw new Error(`Display payload leaked internal field: ${key}`);
    }
  }
}
