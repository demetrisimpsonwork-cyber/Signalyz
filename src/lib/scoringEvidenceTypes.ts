/**
 * R3A — Grounded scoring evidence contract.
 *
 * STRICT RULE: scoring_evidence must NEVER create evidence.
 *
 * All evidence references must originate from exactly one of:
 *   1. evidencePackage (client retrieval, pre-invoke)
 *   2. calibrated_bullets[].used_evidence (edge grounding response)
 *
 * If no qualifying item exists for a signal, pillar, or screen-out link:
 *   linkage = "absent" and evidence = []
 *
 * Forbidden:
 *   - Parsing resume/JD text into new evidence items
 *   - Synthesizing excerpts from score_rationale or AI narrative
 *   - Inferring or generating evidence_id / content / similarity
 */

import type { EvidencePackageItem } from "@signalyz/groundedCalibration";
import type { ScoringBreakdown } from "@/lib/scoreEvidence";

export type ScoringEvidenceLinkage = "supports" | "partial" | "absent";

/** Reference to an existing retrieved chunk — never fabricated. */
export type ScoringEvidenceRef = Pick<
  EvidencePackageItem,
  "evidence_id" | "content" | "section" | "company" | "role_title" | "similarity"
> & {
  /** Why this existing chunk was linked (classification only — not new evidence). */
  relevance_reason: string;
};

export interface ScoringEvidenceLink {
  signal: string;
  linkage: ScoringEvidenceLinkage;
  /** Only items from allowed sources. Empty when linkage is "absent". */
  evidence: ScoringEvidenceRef[];
}

export interface PillarEvidenceEntry {
  /** Mirror of breakdown value — not recomputed from evidence. */
  score: number;
  supporting_evidence: ScoringEvidenceRef[];
  /** Deterministic classification hint — must not quote unsourced resume text as evidence. */
  explanation_hint: string;
}

export type EvidenceConfidence = "high" | "medium" | "low";

export interface ScoringEvidence {
  matched_evidence: ScoringEvidenceLink[];
  missing_evidence: ScoringEvidenceLink[];
  pillar_evidence: Partial<Record<keyof ScoringBreakdown, PillarEvidenceEntry>>;
  evidence_confidence: EvidenceConfidence;
}

export interface ScoringEvidenceSources {
  evidencePackage?: EvidencePackageItem[] | null;
  calibratedBullets?: Array<{ used_evidence?: EvidencePackageItem[] | null }> | null;
}

/** Allowed evidence pool — union of retrieval package and calibrated bullet usage. */
export function collectAllowedScoringEvidence(
  sources: ScoringEvidenceSources,
): EvidencePackageItem[] {
  const seen = new Set<string>();
  const allowed: EvidencePackageItem[] = [];

  const append = (items: EvidencePackageItem[] | null | undefined) => {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (!item?.evidence_id?.trim() || !item.content?.trim()) continue;
      if (seen.has(item.evidence_id)) continue;
      seen.add(item.evidence_id);
      allowed.push(item);
    }
  };

  append(sources.evidencePackage ?? undefined);
  for (const bullet of sources.calibratedBullets ?? []) {
    append(bullet?.used_evidence ?? undefined);
  }

  return allowed;
}

export function toScoringEvidenceRef(
  item: EvidencePackageItem,
  relevanceReason: string,
): ScoringEvidenceRef {
  return {
    evidence_id: item.evidence_id,
    content: item.content,
    section: item.section,
    company: item.company,
    role_title: item.role_title,
    similarity: item.similarity,
    relevance_reason: relevanceReason,
  };
}

/** Returns refs that exist in the allowed pool; drops any ID not from allowed sources. */
export function filterScoringEvidenceRefs(
  allowed: EvidencePackageItem[],
  refs: ScoringEvidenceRef[],
): ScoringEvidenceRef[] {
  const byId = new Map(allowed.map((item) => [item.evidence_id, item]));
  return refs
    .map((ref) => {
      const source = byId.get(ref.evidence_id);
      if (!source) return null;
      return toScoringEvidenceRef(source, ref.relevance_reason);
    })
    .filter((ref): ref is ScoringEvidenceRef => ref !== null);
}

/** Enforces absent linkage when no evidence refs remain after filtering. */
export function finalizeScoringEvidenceLink(
  signal: string,
  refs: ScoringEvidenceRef[],
  partialWhenNonEmpty = true,
): ScoringEvidenceLink {
  if (refs.length === 0) {
    return { signal, linkage: "absent", evidence: [] };
  }

  const maxSimilarity = Math.max(...refs.map((r) => r.similarity));
  const linkage: ScoringEvidenceLinkage =
    maxSimilarity >= 0.65 ? "supports" : partialWhenNonEmpty ? "partial" : "absent";

  return {
    signal,
    linkage: linkage === "absent" ? "absent" : linkage,
    evidence: linkage === "absent" ? [] : refs,
  };
}
