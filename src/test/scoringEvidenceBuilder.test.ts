import { describe, expect, it } from "vitest";
import {
  buildScoringEvidence,
  collectScoringEvidenceIds,
} from "@/lib/scoringEvidenceBuilder";
import { collectAllowedScoringEvidence } from "@/lib/scoringEvidenceTypes";
import type { ScoringBreakdown } from "@/lib/scoreEvidence";
import type { EvidencePackageItem } from "@signalyz/groundedCalibration";

const SAMPLE_BREAKDOWN: ScoringBreakdown = {
  role_outcomes_alignment: 68,
  tools_and_workflow_alignment: 72,
  domain_and_context_alignment: 61,
  context_and_scale_alignment: 55,
  communication_and_leadership_alignment: 64,
};

const njdolEscalationEvidence: EvidencePackageItem = {
  evidence_id: "chunk-njdol-escalation",
  content:
    "Managed customer escalation calls regarding unemployment claims, benefit disputes, and employer compliance inquiries at New Jersey Department of Labor (NJDOL).",
  section: "experience",
  company: "NJDOL",
  role_title: "Customer Service Representative",
  similarity: 0.71,
};

const njdolSalesforceEvidence: EvidencePackageItem = {
  evidence_id: "chunk-njdol-salesforce",
  content:
    "Documented escalation outcomes in Salesforce and tracked repeat-contact drivers to improve first-call resolution.",
  section: "experience",
  company: "NJDOL",
  role_title: "Customer Service Representative",
  similarity: 0.58,
};

const njdolTier2Evidence: EvidencePackageItem = {
  evidence_id: "chunk-njdol-tier2",
  content:
    "Coordinated tier-2 escalations with supervisors, legal reviewers, and partner agencies to resolve complex claimant cases within SLA targets.",
  section: "experience",
  company: "NJDOL",
  role_title: "Customer Service Representative",
  similarity: 0.62,
};

describe("buildScoringEvidence", () => {
  it("builds matched_evidence from NJDOL escalation evidence", () => {
    const result = buildScoringEvidence({
      evidencePackage: [njdolEscalationEvidence, njdolSalesforceEvidence, njdolTier2Evidence],
      calibrated_bullets: [],
      scoring_breakdown: SAMPLE_BREAKDOWN,
      top_matched_signal: "customer escalation experience",
      top_missing_signal: "call center queue management",
      score_rationale: [
        "[STRENGTH] Escalation handling aligns with JD priority.",
        "[GAP] Call center volume metrics are under-signaled.",
      ],
      missing_keywords: ["call center"],
    });

    expect(result.matched_evidence).toHaveLength(1);
    expect(result.matched_evidence[0].signal).toBe("customer escalation experience");
    expect(result.matched_evidence[0].linkage).toBe("supports");
    expect(result.matched_evidence[0].evidence.length).toBeGreaterThan(0);
    expect(result.matched_evidence[0].evidence[0].evidence_id).toBe("chunk-njdol-escalation");
  });

  it("marks missing call center evidence as absent when no evidence supports it", () => {
    const result = buildScoringEvidence({
      evidencePackage: [njdolEscalationEvidence, njdolSalesforceEvidence],
      calibrated_bullets: [],
      scoring_breakdown: SAMPLE_BREAKDOWN,
      top_matched_signal: "customer escalation experience",
      top_missing_signal: "call center queue management",
      missing_keywords: ["call center"],
      score_rationale: ["[GAP] Call center volume metrics are under-signaled."],
    });

    const callCenterLinks = result.missing_evidence.filter((link) =>
      /call center/i.test(link.signal),
    );
    expect(callCenterLinks.length).toBeGreaterThan(0);
    for (const link of callCenterLinks) {
      expect(link.linkage).toBe("absent");
      expect(link.evidence).toEqual([]);
    }
  });

  it("filters out forged evidence IDs — output IDs must exist in allowed pool only", () => {
    const forged: EvidencePackageItem = {
      evidence_id: "forged:fake-chunk",
      content: "Invented claim that never appeared in retrieval",
      section: "experience",
      company: "FakeCo",
      role_title: "Analyst",
      similarity: 0.99,
    };

    const allowed = collectAllowedScoringEvidence({
      evidencePackage: [njdolEscalationEvidence],
      calibratedBullets: [{ used_evidence: [forged] }],
    });

    const result = buildScoringEvidence({
      evidencePackage: [njdolEscalationEvidence],
      calibrated_bullets: [{ used_evidence: [forged] }],
      scoring_breakdown: SAMPLE_BREAKDOWN,
      top_matched_signal: "customer escalation experience",
    });

    const allowedIds = new Set(allowed.map((item) => item.evidence_id));
    const outputIds = collectScoringEvidenceIds(result);
    expect(outputIds.every((id) => allowedIds.has(id))).toBe(true);
    expect(outputIds).not.toContain("forged-not-in-sources");
  });

  it("produces pillar_evidence without changing score values", () => {
    const result = buildScoringEvidence({
      evidencePackage: [njdolEscalationEvidence, njdolSalesforceEvidence, njdolTier2Evidence],
      calibrated_bullets: [],
      scoring_breakdown: SAMPLE_BREAKDOWN,
      top_matched_signal: "customer escalation experience",
    });

    for (const [pillar, score] of Object.entries(SAMPLE_BREAKDOWN)) {
      const entry = result.pillar_evidence[pillar as keyof ScoringBreakdown];
      expect(entry).toBeDefined();
      expect(entry?.score).toBe(score);
    }

    expect(result.pillar_evidence.tools_and_workflow_alignment?.supporting_evidence.some(
      (ref) => ref.evidence_id === "chunk-njdol-salesforce",
    )).toBe(true);
  });

  it("returns low confidence for empty evidence", () => {
    const result = buildScoringEvidence({
      evidencePackage: [],
      calibrated_bullets: [],
      scoring_breakdown: SAMPLE_BREAKDOWN,
      top_matched_signal: "customer escalation experience",
      top_missing_signal: "call center",
    });

    expect(result.evidence_confidence).toBe("low");
    expect(result.matched_evidence[0].linkage).toBe("absent");
    expect(result.missing_evidence.every((link) => link.linkage === "absent")).toBe(true);
  });

  it("returns high confidence with 3+ chunks and strong similarity", () => {
    const result = buildScoringEvidence({
      evidencePackage: [njdolEscalationEvidence, njdolSalesforceEvidence, njdolTier2Evidence],
      calibrated_bullets: [],
      scoring_breakdown: SAMPLE_BREAKDOWN,
      top_matched_signal: "customer escalation experience",
    });

    expect(result.evidence_confidence).toBe("high");
  });

  it("emits sample scoring_evidence output for inspection", () => {
    const sample = buildScoringEvidence({
      evidencePackage: [njdolEscalationEvidence, njdolSalesforceEvidence, njdolTier2Evidence],
      calibrated_bullets: [
        {
          used_evidence: [njdolEscalationEvidence],
        },
      ],
      scoring_breakdown: SAMPLE_BREAKDOWN,
      top_matched_signal: "customer escalation experience",
      top_missing_signal: "call center queue management",
      missing_keywords: ["call center"],
      score_rationale: [
        "[STRENGTH] Escalation handling aligns with JD priority.",
        "[GAP] Call center volume metrics are under-signaled.",
      ],
    });

    expect(sample.matched_evidence[0].linkage).toBe("supports");
    expect(sample.evidence_confidence).toBe("high");
    expect(Object.keys(sample.pillar_evidence)).toHaveLength(5);
  });
});

export const SAMPLE_SCORING_EVIDENCE_OUTPUT = buildScoringEvidence({
  evidencePackage: [njdolEscalationEvidence, njdolSalesforceEvidence, njdolTier2Evidence],
  calibrated_bullets: [{ used_evidence: [njdolEscalationEvidence] }],
  scoring_breakdown: SAMPLE_BREAKDOWN,
  top_matched_signal: "customer escalation experience",
  top_missing_signal: "call center queue management",
  missing_keywords: ["call center"],
  score_rationale: [
    "[STRENGTH] Escalation handling aligns with JD priority.",
    "[GAP] Call center volume metrics are under-signaled.",
  ],
});
