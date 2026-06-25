import type {
  GroundedRecommendation,
  GroundedRecommendationDisplayEvidence,
  GroundedRecommendationInsights,
} from "@/lib/groundedRecommendationTypes";

const CLASSIFICATION_PRIORITY: Record<GroundedRecommendation["classification"], number> = {
  partial: 3,
  present: 2,
  missing: 1,
};

/** Small boost for phone/queue support signals vs account-access gaps on customer-support JDs. */
const CUSTOMER_SUPPORT_FRONT_PATTERN =
  /\b(contact center|call center|inbound (call|inquiry|inquiries|phone)|phone support|high-volume inbound)\b/i;

const ACCOUNT_ACCESS_PATTERN = /\b(account access|login support|account login)\b/i;

function computeCustomerSupportFrontBoost(signalName: string): number {
  const lower = signalName.toLowerCase();
  if (CUSTOMER_SUPPORT_FRONT_PATTERN.test(lower)) return 0.08;
  if (ACCOUNT_ACCESS_PATTERN.test(lower)) return 0;
  return 0;
}

/** Composite priority — JD importance, evidence, transferability, classification tier. */
export function computeRecommendationPriorityScore(
  recommendation: GroundedRecommendation,
  maxImportanceRank: number,
): number {
  const rankNorm =
    recommendation.jd_importance_rank != null && maxImportanceRank > 0
      ? (maxImportanceRank - recommendation.jd_importance_rank) / maxImportanceRank
      : 0;
  const classWeight = CLASSIFICATION_PRIORITY[recommendation.classification] / 3;

  return (
    rankNorm * 0.35 +
    recommendation.evidence_confidence * 0.3 +
    recommendation.transferability_confidence * 0.2 +
    classWeight * 0.15 +
    computeCustomerSupportFrontBoost(recommendation.signal_name)
  );
}

export function normalizeEvidenceKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildDisplayEvidenceMap(
  recommendations: GroundedRecommendation[],
): Record<string, GroundedRecommendationDisplayEvidence[]> {
  const seenContent = new Map<string, string>();
  const display: Record<string, GroundedRecommendationDisplayEvidence[]> = {};

  for (const rec of recommendations) {
    const entries: GroundedRecommendationDisplayEvidence[] = [];
    for (const text of rec.evidence_used) {
      const key = normalizeEvidenceKey(text);
      if (!key) continue;
      if (seenContent.has(key)) {
        entries.push({
          text,
          is_duplicate: true,
          duplicate_of_signal: seenContent.get(key),
        });
      } else {
        seenContent.set(key, rec.signal_name);
        entries.push({ text, is_duplicate: false });
      }
    }
    display[rec.signal_name] = entries;
  }

  return display;
}

function sortByPriority(
  recommendations: GroundedRecommendation[],
  maxImportanceRank: number,
): GroundedRecommendation[] {
  return [...recommendations].sort(
    (a, b) =>
      computeRecommendationPriorityScore(b, maxImportanceRank) -
      computeRecommendationPriorityScore(a, maxImportanceRank),
  );
}

export function selectFeaturedRepositioning(
  partialRecommendations: GroundedRecommendation[],
  maxImportanceRank: number,
): GroundedRecommendation | null {
  if (partialRecommendations.length === 0) return null;
  const sorted = sortByPriority(partialRecommendations, maxImportanceRank);
  return sorted[0] ?? null;
}

export function buildGroundedRecommendationInsights(
  recommendations: GroundedRecommendation[],
): GroundedRecommendationInsights {
  const maxImportanceRank = recommendations.reduce(
    (max, rec) => Math.max(max, rec.jd_importance_rank ?? 0),
    0,
  );

  const partial = recommendations.filter((r) => r.classification === "partial");
  const present = recommendations.filter((r) => r.classification === "present");
  const missing = recommendations.filter((r) => r.classification === "missing");

  const highest_impact = sortByPriority(partial, maxImportanceRank);
  const already_supported = sortByPriority(present, maxImportanceRank);
  const additional_gaps = sortByPriority(missing, maxImportanceRank);

  const featured_repositioning = selectFeaturedRepositioning(partial, maxImportanceRank);

  const orderedForDedupe = [
    ...(featured_repositioning ? [featured_repositioning] : []),
    ...highest_impact.filter((r) => r.signal_name !== featured_repositioning?.signal_name),
    ...already_supported,
    ...additional_gaps,
  ];

  return {
    featured_repositioning,
    highest_impact,
    already_supported,
    additional_gaps,
    display_evidence: buildDisplayEvidenceMap(orderedForDedupe),
  };
}

export function prioritizeGroundedRecommendations(
  recommendations: GroundedRecommendation[],
): GroundedRecommendation[] {
  const maxImportanceRank = recommendations.reduce(
    (max, rec) => Math.max(max, rec.jd_importance_rank ?? 0),
    0,
  );
  const insights = buildGroundedRecommendationInsights(recommendations);
  return [
    ...(insights.featured_repositioning ? [insights.featured_repositioning] : []),
    ...insights.highest_impact.filter(
      (r) => r.signal_name !== insights.featured_repositioning?.signal_name,
    ),
    ...insights.already_supported,
    ...insights.additional_gaps,
  ];
}
