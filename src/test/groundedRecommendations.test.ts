import { describe, expect, it, vi } from "vitest";
import type { EvidencePackageItem } from "@signalyz/groundedCalibration";
import type { DirectorCalibrationResult } from "@/components/DirectorCalibrationBlock";
import type { RetrievedEvidence } from "@/lib/evidenceRetrieval";
import { NJDOL_RESUME_TEXT } from "@/test/fixtures/rag/njdolResume";
import type { AlignmentGapsInput } from "@/lib/groundedRecommendationTypes";
import {
  buildGapRegistry,
  buildGroundedRecommendationText,
  classifySignalEvidence,
  buildGroundedRecommendations,
  isClassificationConsistentWithRecommendation,
  PARTIAL_REFRAME_PREFIX,
} from "@/lib/groundedRecommendations";
import { buildGroundedRecommendationInsights } from "@/lib/groundedRecommendationInsights";
import { scoreEvidenceForSignal } from "@/lib/evidenceRetrieval";
import {
  PARTIAL_OVERLAP_THRESHOLD,
  PARTIAL_SIMILARITY_THRESHOLD,
  PRESENT_OVERLAP_THRESHOLD,
  PRESENT_SIMILARITY_THRESHOLD,
  ROUTING_INTAKE_TRANSFERABILITY_THRESHOLD,
  TRANSFERABILITY_CONFIDENCE_THRESHOLD,
} from "@/lib/groundedRecommendationTypes";

const njdolEscalationEvidence: EvidencePackageItem = {
  evidence_id: "chunk-njdol-escalation",
  content:
    "Managed customer escalation calls regarding unemployment claims, benefit disputes, and employer compliance inquiries.",
  section: "experience",
  company: "New Jersey Department of Labor (NJDOL)",
  role_title: "Customer Service Representative",
  similarity: 0.82,
};

const njdolPortfolioEvidence: RetrievedEvidence = {
  evidence_id: "chunk-portfolio",
  content: "Managed a complex case portfolio with tier-2 escalations and repeat-contact tracking.",
  section: "experience",
  company: "NJDOL",
  role_title: "Customer Service Representative",
  similarity: 0.62,
};

const njdolRoutingEvidence: RetrievedEvidence = {
  evidence_id: "chunk-routing",
  content:
    "Maintained accurate case notes and routed unresolved issues to the appropriate escalation queue.",
  section: "experience",
  company: "NJDOL",
  role_title: "Customer Service Representative",
  similarity: 0.68,
};

const njdolIntakeEvidence: RetrievedEvidence = {
  evidence_id: "chunk-intake",
  content:
    "Trained new representatives on escalation intake protocols and de-escalation scripts for distressed callers.",
  section: "experience",
  company: "NJDOL",
  role_title: "Customer Service Representative",
  similarity: 0.72,
};

const njdolCallQueueEvidence: RetrievedEvidence = {
  evidence_id: "chunk-queues",
  content: "Handled inbound and outbound call queues for benefits eligibility and status updates.",
  section: "experience",
  company: "NJDOL",
  role_title: "Customer Service Representative",
  similarity: 0.68,
};

const salesforceOnlyEvidence: RetrievedEvidence = {
  evidence_id: "chunk-salesforce",
  content: "Documented escalation outcomes in Salesforce and tracked repeat-contact drivers.",
  section: "experience",
  company: "NJDOL",
  role_title: "Customer Service Representative",
  similarity: 0.58,
};

function asRetrieved(item: EvidencePackageItem): RetrievedEvidence[] {
  return [
    {
      evidence_id: item.evidence_id,
      content: item.content,
      section: item.section,
      company: item.company,
      role_title: item.role_title,
      similarity: item.similarity,
    },
  ];
}

const MOCK_DIRECTOR: DirectorCalibrationResult = {
  dimensions: [],
  director_signal_tier: { tier: "Senior IC Signal", rationale: "Test" },
  hiring_stage_friction: {
    recruiter_filter_risk: { level: "Moderate", observation: "x" },
    hiring_manager_friction: { level: "Moderate", observation: "x" },
    executive_skepticism: { level: "Low", observation: "x" },
    primary_friction_stage: "Hiring Manager Friction",
  },
  pattern_detection: { undersignaling_patterns: [], ownership_inflation_patterns: [] },
  signal_classifier: {
    target_level_inferred: "Senior IC",
    dimension_scores: {
      commercial: { score: 10, gap: "no_commercial_attribution", missing: ["revenue impact"] },
      ownership: { score: 10, gap: "limited_ownership_scope", missing: ["end-to-end ownership"] },
      authority: { score: 11, gap: "weak_decision_authority", missing: [] },
      cross_functional: { score: 9, gap: "missing_cross_functional_leadership", missing: [] },
      lifecycle: { score: 10, gap: "incomplete_lifecycle_governance", missing: [] },
      risk: { score: 11, gap: "absent_risk_framing", missing: [] },
      narrative: { score: 12, gap: "fragmented_narrative", missing: [] },
    },
    overall_seniority_alignment: "Partial Alignment",
    top_3_gaps: ["limited_ownership_scope", "no_commercial_attribution", "weak_decision_authority"],
  },
};

describe("groundedRecommendations", () => {
  it("buildGapRegistry prioritizes alignment gaps before classifier gaps", () => {
    const gaps = buildGapRegistry(MOCK_DIRECTOR, {
      top_missing_signal: "customer escalation management",
      missing_keywords: ["GA4", "Gainsight"],
      score_rationale: ["[GAP] Limited ownership scope in resume"],
      primary_blocker: "Weak commercial attribution",
    });

    expect(gaps.length).toBeLessThanOrEqual(10);
    expect(gaps[0].toLowerCase()).toContain("escalation");
    expect(gaps.some((g) => g.toLowerCase() === "ga4")).toBe(true);
    const ga4Index = gaps.findIndex((g) => g.toLowerCase() === "ga4");
    const classifierOwnershipIndex = gaps.findIndex((g) =>
      g.toLowerCase().includes("ownership scope"),
    );
    expect(ga4Index).toBeGreaterThan(-1);
    expect(classifierOwnershipIndex).toBeGreaterThan(ga4Index);
  });

  it("classifies PRESENT when direct evidence exceeds thresholds", () => {
    const result = classifySignalEvidence(
      "customer escalation management benefit disputes",
      asRetrieved(njdolEscalationEvidence),
      true,
    );

    expect(result.classification).toBe("present");
    expect(result.classification_reason).toBe("Direct evidence found in retrieved resume content.");
    expect(result.evidence_used[0]).toContain("benefit disputes");
  });

  it("does not classify PRESENT for single-token customer intake match", () => {
    const result = classifySignalEvidence("customer intake", [njdolIntakeEvidence], true);

    expect(result.classification).not.toBe("present");
  });

  it("classifies PARTIAL for defensible ticket routing adjacency", () => {
    const result = classifySignalEvidence(
      "ticket routing and queue management",
      [njdolRoutingEvidence],
      true,
    );

    expect(result.classification).toBe("partial");
    expect(result.classification_reason).toBe(
      "Related experience was found but does not fully satisfy the requested signal.",
    );
    expect(result.transferability_confidence).toBeGreaterThan(0);
  });

  it("classifies PARTIAL for weak-adjacency call-center intake (not MISSING with reframe gap)", () => {
    const classification = classifySignalEvidence(
      "customer intake call handling",
      [njdolCallQueueEvidence, njdolIntakeEvidence],
      true,
    );
    const { recommendation } = buildGroundedRecommendationText(
      "customer intake call handling",
      classification,
    );

    expect(classification.classification).toBe("partial");
    expect(isClassificationConsistentWithRecommendation({
      classification: classification.classification,
      classification_reason: classification.classification_reason,
      signal_name: "customer intake call handling",
      recommendation,
      evidence_used: classification.evidence_used,
      evidence_confidence: classification.evidence_confidence,
      transferability_confidence: classification.transferability_confidence,
      grounded: true,
    })).toBe(true);
    expect(recommendation).toContain("Your resume shows related experience");
  });

  it("classifies PARTIAL conservatively for related portfolio evidence", async () => {
    const { scoreEvidenceForSignal } = await import("@/lib/evidenceRetrieval");
    const scored = scoreEvidenceForSignal(
      "enterprise customer portfolio ownership",
      [njdolPortfolioEvidence],
    );
    const result = classifySignalEvidence(
      "enterprise customer portfolio ownership",
      [njdolPortfolioEvidence],
      true,
    );

    expect(scored.overlap).toBeGreaterThanOrEqual(PARTIAL_OVERLAP_THRESHOLD);
    expect(njdolPortfolioEvidence.similarity).toBeGreaterThanOrEqual(PARTIAL_SIMILARITY_THRESHOLD);
    expect(["partial", "missing"]).toContain(result.classification);
    if (result.classification === "partial") {
      expect(result.classification_reason).toContain("Related experience");
      expect(result.transferability_confidence).toBeGreaterThan(0);
    }
  });

  it("classifies MISSING for GA4 when analytics tools are absent", () => {
    const result = classifySignalEvidence("GA4 analytics reporting", [salesforceOnlyEvidence], true);

    expect(result.classification).toBe("missing");
    expect(result.classification_reason).toBe(
      "Related evidence exists but required tool evidence was not found.",
    );
  });

  it("classifies MISSING for ServiceTitan without tool evidence", () => {
    const result = classifySignalEvidence("ServiceTitan dispatch scheduling", [salesforceOnlyEvidence], true);

    expect(result.classification).toBe("missing");
    expect(result.classification_reason).toBe(
      "Related evidence exists but required tool evidence was not found.",
    );
  });

  it("classifies MISSING for dispatch without dispatch evidence", () => {
    const result = classifySignalEvidence("field service dispatch scheduling", [njdolRoutingEvidence], true);

    expect(result.classification).toBe("missing");
  });

  it("returns ungrounded recommendation when retrieval cannot be verified", () => {
    const classification = classifySignalEvidence("customer escalation", [], false);
    const { recommendation, grounded } = buildGroundedRecommendationText(
      "customer escalation",
      classification,
    );

    expect(grounded).toBe(false);
    expect(recommendation).toContain("could not verify");
  });

  it("buildGroundedRecommendations uses shared retrieve callback", async () => {
    const retrieveForSignal = vi.fn(async (signal: string) => {
      if (signal.toLowerCase().includes("escalation")) {
        return asRetrieved(njdolEscalationEvidence);
      }
      return [];
    });

    const recommendations = await buildGroundedRecommendations({
      director: MOCK_DIRECTOR,
      alignmentGaps: { top_missing_signal: "customer escalation management" },
      retrievalVerified: true,
      retrieveForSignal,
    });

    expect(recommendations.length).toBeGreaterThan(0);
    for (const rec of recommendations) {
      expect(isClassificationConsistentWithRecommendation(rec)).toBe(true);
    }
    const escalation = recommendations.find((r) =>
      r.signal_name.toLowerCase().includes("escalation"),
    );
    expect(["present", "partial"]).toContain(escalation?.classification);
    expect(escalation?.grounded).toBe(true);
    expect(escalation?.recommendation).not.toContain("$50M");
  });

  it("uses exported threshold constants in classification", () => {
    expect(PRESENT_SIMILARITY_THRESHOLD).toBeGreaterThan(PARTIAL_OVERLAP_THRESHOLD);
    expect(PRESENT_OVERLAP_THRESHOLD).toBeGreaterThan(PARTIAL_OVERLAP_THRESHOLD);
    expect(TRANSFERABILITY_CONFIDENCE_THRESHOLD).toBe(0.4);
    expect(ROUTING_INTAKE_TRANSFERABILITY_THRESHOLD).toBe(0.12);
  });

  it("classifies PARTIAL for contact center via call-queue adjacency without direct wording", () => {
    const result = classifySignalEvidence("contact center", [njdolCallQueueEvidence], true);

    expect(result.classification).toBe("partial");
    expect(result.classification_reason).toBe(
      "Related experience was found but does not fully satisfy the requested signal.",
    );
    const { recommendation } = buildGroundedRecommendationText("contact center", result);
    expect(recommendation).toContain(PARTIAL_REFRAME_PREFIX);
  });

  it("does not classify PRESENT for inbound call center without direct call-center wording in evidence", () => {
    const result = classifySignalEvidence("inbound call center", [njdolCallQueueEvidence], true);

    expect(result.classification).not.toBe("present");
    expect(["partial", "missing"]).toContain(result.classification);
    if (result.classification === "partial") {
      const { recommendation } = buildGroundedRecommendationText("inbound call center", result);
      expect(recommendation).toContain(PARTIAL_REFRAME_PREFIX);
    }
  });

  it("uses weakDomainMatch reason when evidence exists but signal stays MISSING", () => {
    const result = classifySignalEvidence("tax preparation", [salesforceOnlyEvidence], true);

    expect(result.classification).toBe("missing");
    expect(result.classification_reason).toBe(
      "Related evidence exists but the required domain, tool, or direct experience was not evidenced.",
    );
    expect(result.evidence_used.length).toBeGreaterThan(0);
  });

  it("classifies MISSING for TurboTax strict tool gap", () => {
    const result = classifySignalEvidence("TurboTax", [njdolCallQueueEvidence], true);

    expect(result.classification).toBe("missing");
    expect(result.classification_reason).toBe(
      "Related evidence exists but required tool evidence was not found.",
    );
  });
});

const TAX_OPERATIONS_GAPS: AlignmentGapsInput = {
  top_missing_signal: "tax software navigation and filing workflow customer support",
  missing_keywords: [
    "tax preparation",
    "TurboTax",
    "tax filing",
    "software troubleshooting",
    "login support",
    "tax season",
    "inbound call center",
    "contact center",
  ],
  score_rationale: [
    "[GAP] No demonstrated tax software or filing workflow support experience",
    "[GAP] Missing tax-season contact center signal",
    "[GAP] No TurboTax or consumer tax platform tooling on resume",
  ],
  primary_blocker: "No tax operations domain evidence",
};

function chunkNjdolResume(): RetrievedEvidence[] {
  const chunks: RetrievedEvidence[] = [];
  for (const line of NJDOL_RESUME_TEXT.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("-")) {
      chunks.push({
        evidence_id: `chunk-${chunks.length}`,
        content: trimmed.replace(/^-\s*/, ""),
        section: "experience",
        company: "NJDOL",
        role_title: "Customer Service Representative",
        similarity: 0.72,
      });
    }
  }
  return chunks;
}

describe("Phase 2B.1 tax operations smoke", () => {
  it("recovers PARTIAL repositioning for NJDOL + Tax Operations JD", async () => {
    const pool = chunkNjdolResume();
    const raw = await buildGroundedRecommendations({
      director: MOCK_DIRECTOR,
      alignmentGaps: TAX_OPERATIONS_GAPS,
      retrievalVerified: true,
      retrieveForSignal: async (signal) => {
        const scored = scoreEvidenceForSignal(signal, pool);
        return scored.ranked
          .map((item, idx) => ({
            ...item,
            similarity:
              idx === 0
                ? Math.min(0.88, 0.4 + scored.overlap * 0.55 + 0.1)
                : item.similarity,
          }))
          .slice(0, 5);
      },
    });

    const insights = buildGroundedRecommendationInsights(raw);
    const partials = raw.filter((r) => r.classification === "partial");
    const missing = raw.filter((r) => r.classification === "missing");

    expect(partials.length).toBeGreaterThanOrEqual(1);
    expect(insights.featured_repositioning).toBeTruthy();
    expect(insights.highest_impact.length).toBeGreaterThan(0);

    const turbotax = raw.find((r) => /turbotax/i.test(r.signal_name));
    const taxPrep = raw.find((r) => /tax preparation/i.test(r.signal_name));
    const taxFiling = raw.find((r) => /tax filing/i.test(r.signal_name));
    expect(turbotax?.classification).toBe("missing");
    expect(taxPrep?.classification).toBe("missing");
    expect(taxFiling?.classification).not.toBe("present");

    const taxPartial = partials.find((r) =>
      /tax|contact center|call center|inbound/i.test(r.signal_name),
    );
    expect(taxPartial).toBeTruthy();

    for (const rec of raw) {
      expect(isClassificationConsistentWithRecommendation(rec)).toBe(true);
    }

    for (const rec of missing) {
      if (rec.evidence_used.length > 0) {
        expect(rec.classification_reason).not.toBe("No supporting evidence was found.");
      }
    }
  });
});
