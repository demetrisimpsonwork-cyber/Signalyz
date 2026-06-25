import { describe, expect, it } from "vitest";
import type { GroundedRecommendation } from "@/lib/groundedRecommendationTypes";
import {
  buildDisplayEvidenceMap,
  buildGroundedRecommendationInsights,
  computeRecommendationPriorityScore,
  prioritizeGroundedRecommendations,
  selectFeaturedRepositioning,
} from "@/lib/groundedRecommendationInsights";
import {
  isClassificationConsistentWithRecommendation,
  isTransferableReframeRecommendation,
  PARTIAL_REFRAME_PREFIX,
} from "@/lib/groundedRecommendations";

function makeRec(
  overrides: Partial<GroundedRecommendation> & Pick<GroundedRecommendation, "signal_name" | "classification">,
): GroundedRecommendation {
  return {
    classification_reason: "test",
    recommendation: overrides.recommendation ?? "No defensible evidence",
    evidence_used: overrides.evidence_used ?? [],
    evidence_confidence: overrides.evidence_confidence ?? 0.5,
    transferability_confidence: overrides.transferability_confidence ?? 0.5,
    grounded: overrides.grounded ?? true,
    jd_importance_rank: overrides.jd_importance_rank ?? 0,
    ...overrides,
  };
}

describe("groundedRecommendationInsights", () => {
  it("ranks PARTIAL above MISSING when JD importance is equal", () => {
    const partial = makeRec({
      signal_name: "customer intake",
      classification: "partial",
      jd_importance_rank: 5,
      evidence_confidence: 0.6,
      transferability_confidence: 0.4,
      recommendation: `${PARTIAL_REFRAME_PREFIX} At NJDOL, Trained intake protocols.`,
    });
    const missing = makeRec({
      signal_name: "GA4",
      classification: "missing",
      jd_importance_rank: 5,
      evidence_confidence: 0.4,
      transferability_confidence: 0,
    });

    expect(computeRecommendationPriorityScore(partial, 9)).toBeGreaterThan(
      computeRecommendationPriorityScore(missing, 9),
    );
  });

  it("groups recommendations into impact, supported, and gaps", () => {
    const recs = [
      makeRec({ signal_name: "intake", classification: "partial", jd_importance_rank: 1 }),
      makeRec({ signal_name: "escalation", classification: "present", jd_importance_rank: 0 }),
      makeRec({ signal_name: "GA4", classification: "missing", jd_importance_rank: 2 }),
    ];

    const insights = buildGroundedRecommendationInsights(recs);

    expect(insights.highest_impact.map((r) => r.signal_name)).toEqual(["intake"]);
    expect(insights.already_supported.map((r) => r.signal_name)).toEqual(["escalation"]);
    expect(insights.additional_gaps.map((r) => r.signal_name)).toEqual(["GA4"]);
    expect(insights.featured_repositioning?.signal_name).toBe("intake");
  });

  it("deduplicates identical evidence across recommendations", () => {
    const sharedEvidence = "Coordinated tier-2 escalations with supervisors and partner agencies.";
    const recs = [
      makeRec({
        signal_name: "intake",
        classification: "partial",
        evidence_used: [sharedEvidence],
      }),
      makeRec({
        signal_name: "routing",
        classification: "partial",
        evidence_used: [sharedEvidence],
      }),
    ];

    const display = buildDisplayEvidenceMap(recs);

    expect(display.intake[0].is_duplicate).toBe(false);
    expect(display.routing[0].is_duplicate).toBe(true);
    expect(display.routing[0].duplicate_of_signal).toBe("intake");
  });

  it("prioritizeGroundedRecommendations orders featured partial before missing gaps", () => {
    const recs = [
      makeRec({ signal_name: "GA4", classification: "missing", jd_importance_rank: 0 }),
      makeRec({
        signal_name: "routing",
        classification: "partial",
        jd_importance_rank: 2,
        evidence_confidence: 0.7,
        transferability_confidence: 0.5,
      }),
      makeRec({
        signal_name: "intake",
        classification: "partial",
        jd_importance_rank: 1,
        evidence_confidence: 0.9,
        transferability_confidence: 0.8,
      }),
    ];

    const ordered = prioritizeGroundedRecommendations(recs);
    const names = ordered.map((r) => r.signal_name);

    expect(names[0]).toBe("intake");
    expect(names.indexOf("routing")).toBeLessThan(names.indexOf("GA4"));
  });

  it("selectFeaturedRepositioning picks highest-confidence partial", () => {
    const partials = [
      makeRec({
        signal_name: "routing",
        classification: "partial",
        evidence_confidence: 0.55,
        transferability_confidence: 0.3,
      }),
      makeRec({
        signal_name: "intake",
        classification: "partial",
        evidence_confidence: 0.92,
        transferability_confidence: 0.85,
      }),
    ];

    expect(selectFeaturedRepositioning(partials, 5)?.signal_name).toBe("intake");
  });

  it("contact center outranks account access for Tax Support JD partials", () => {
    const contactCenter = makeRec({
      signal_name: "contact center",
      classification: "partial",
      jd_importance_rank: 3,
      evidence_confidence: 0.6,
      transferability_confidence: 0.65,
    });
    const accountAccess = makeRec({
      signal_name: "account access",
      classification: "partial",
      jd_importance_rank: 2,
      evidence_confidence: 0.62,
      transferability_confidence: 0.5,
    });

    expect(
      selectFeaturedRepositioning([contactCenter, accountAccess], 5)?.signal_name,
    ).toBe("contact center");
    expect(
      computeRecommendationPriorityScore(contactCenter, 5),
    ).toBeGreaterThan(computeRecommendationPriorityScore(accountAccess, 5));
  });
});

describe("classification consistency", () => {
  it("requires PARTIAL when recommendation uses transferable reframe language", () => {
    const rec = makeRec({
      signal_name: "intake",
      classification: "partial",
      recommendation: `${PARTIAL_REFRAME_PREFIX} At NJDOL, Trained intake protocols.`,
    });

    expect(isTransferableReframeRecommendation(rec.recommendation)).toBe(true);
    expect(isClassificationConsistentWithRecommendation(rec)).toBe(true);
  });

  it("rejects MISSING when recommendation uses transferable reframe language", () => {
    const rec = makeRec({
      signal_name: "intake",
      classification: "missing",
      recommendation: `${PARTIAL_REFRAME_PREFIX} At NJDOL, Trained intake protocols.`,
    });

    expect(isClassificationConsistentWithRecommendation(rec)).toBe(false);
  });

  it("allows MISSING without transferable reframe language", () => {
    const rec = makeRec({
      signal_name: "GA4",
      classification: "missing",
      recommendation:
        "No defensible evidence for \"GA4\" was found in indexed resume content. Do not imply this signal on your resume or in interviews without additional experience.",
    });

    expect(isClassificationConsistentWithRecommendation(rec)).toBe(true);
  });
});
