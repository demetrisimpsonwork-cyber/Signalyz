import { describe, expect, it } from "vitest";
import { NJDOL_RESUME_TEXT } from "@/test/fixtures/rag/njdolResume";
import type { RetrievedEvidence } from "@/lib/evidenceRetrieval";
import {
  classifyFromDefensibility,
  computeDefensibilityFactors,
  computeRawDefensibilityScore,
  evaluateHardGates,
  type DefensibilityFactors,
} from "@/lib/groundedDefensibilityScore";
import {
  classifySignalEvidence,
  buildGroundedRecommendationText,
  PARTIAL_REFRAME_PREFIX,
  isClassificationConsistentWithRecommendation,
} from "@/lib/groundedRecommendations";
import { scoreEvidenceForSignal } from "@/lib/evidenceRetrieval";

const salesforceEvidence: RetrievedEvidence = {
  evidence_id: "sf",
  content: "Documented escalation outcomes in Salesforce and tracked repeat-contact drivers to improve first-call resolution.",
  section: "experience",
  company: "NJDOL",
  role_title: "Customer Service Representative",
  similarity: 0.82,
};

const escalationEvidence: RetrievedEvidence = {
  evidence_id: "esc",
  content:
    "Managed customer escalation calls regarding unemployment claims, benefit disputes, and employer compliance inquiries.",
  section: "experience",
  company: "NJDOL",
  role_title: "Customer Service Representative",
  similarity: 0.82,
};

const callQueueEvidence: RetrievedEvidence = {
  evidence_id: "queues",
  content: "Handled inbound and outbound call queues for benefits eligibility and status updates.",
  section: "experience",
  company: "NJDOL",
  role_title: "Customer Service Representative",
  similarity: 0.68,
};

const njdolCorpus = NJDOL_RESUME_TEXT;

function inflatedFactors(): DefensibilityFactors {
  return {
    evidence_directness: 100,
    translation_distance: 100,
    tool_domain_specificity: 100,
    follow_up_defensibility: 100,
  };
}

function chunkResume(): RetrievedEvidence[] {
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

describe("groundedDefensibilityScore hard gates", () => {
  it("TurboTax remains MISSING even with artificially inflated score factors", () => {
    const gates = evaluateHardGates("TurboTax", njdolCorpus);
    const result = classifyFromDefensibility(inflatedFactors(), gates);
    expect(gates.some((g) => g.forced_missing)).toBe(true);
    expect(result.classification).toBe("missing");
    expect(result.final_score).toBeLessThanOrEqual(49);
  });

  it("GA4 remains MISSING even with inflated factors", () => {
    const gates = evaluateHardGates("GA4 analytics reporting", njdolCorpus);
    const result = classifyFromDefensibility(inflatedFactors(), gates);
    expect(result.classification).toBe("missing");
  });

  it("ServiceTitan remains MISSING without direct evidence", () => {
    const gates = evaluateHardGates("ServiceTitan dispatch scheduling", njdolCorpus);
    expect(gates.some((g) => g.id === "strict_tool_missing" && g.forced_missing)).toBe(true);
    const result = classifyFromDefensibility(inflatedFactors(), gates);
    expect(result.classification).toBe("missing");
  });

  it("chat support remains MISSING without chat/channel evidence", () => {
    const gates = evaluateHardGates("chat support", njdolCorpus);
    const result = classifyFromDefensibility(inflatedFactors(), gates);
    expect(result.classification).toBe("missing");
  });

  it("tax preparation remains MISSING without tax-prep evidence", () => {
    const gates = evaluateHardGates("tax preparation", njdolCorpus);
    const result = classifyFromDefensibility(inflatedFactors(), gates);
    expect(result.classification).toBe("missing");
  });
});

describe("Phase 2C calibration classification", () => {
  it("Salesforce becomes PRESENT when Salesforce appears in evidence", () => {
    const result = classifySignalEvidence("Salesforce", [salesforceEvidence], true);
    expect(result.classification).toBe("present");
  });

  it("escalation management becomes PRESENT with direct escalation evidence", () => {
    const result = classifySignalEvidence("customer escalation management", [escalationEvidence], true);
    expect(result.classification).toBe("present");
  });

  it("contact center becomes PARTIAL from inbound call queue evidence", () => {
    const result = classifySignalEvidence("contact center", [callQueueEvidence], true);
    expect(result.classification).toBe("partial");
    const { recommendation } = buildGroundedRecommendationText("contact center", result);
    expect(recommendation).toContain(PARTIAL_REFRAME_PREFIX);
  });

  it("tax filing is never PRESENT without direct tax filing evidence", () => {
    const pool = chunkResume();
    const scored = scoreEvidenceForSignal("tax filing", pool);
    const ranked = scored.ranked.map((item, idx) => ({
      ...item,
      similarity: idx === 0 ? 0.88 : item.similarity,
    }));
    const result = classifySignalEvidence("tax filing", ranked, true);
    expect(result.classification).not.toBe("present");
    expect(["partial", "missing"]).toContain(result.classification);
  });

  it("tax filing customer support is never PRESENT with only NJDOL support evidence", () => {
    const pool = chunkResume();
    const signal = "tax software navigation and filing workflow customer support";
    const scored = scoreEvidenceForSignal(signal, pool);
    const ranked = scored.ranked.map((item, idx) => ({
      ...item,
      similarity: idx === 0 ? 0.88 : item.similarity,
    }));
    const result = classifySignalEvidence(signal, ranked, true);
    expect(result.classification).not.toBe("present");
    expect(result.classification).toBe("partial");
  });

  it("chat support is never PRESENT without chat or channel evidence", () => {
    const result = classifySignalEvidence("chat support", [escalationEvidence], true);
    expect(result.classification).not.toBe("present");
    expect(result.classification).toBe("missing");

    const inflatedGates = evaluateHardGates("chat support", njdolCorpus);
    const inflated = classifyFromDefensibility(inflatedFactors(), inflatedGates);
    expect(inflated.classification).toBe("missing");
  });

  it("written communication customer support is not treated as chat support PRESENT", () => {
    const result = classifySignalEvidence(
      "written communication customer support",
      [escalationEvidence],
      true,
    );
    expect(result.classification).not.toBe("present");
  });

  it("first-call and first-contact do not collapse incorrectly", () => {
    const firstCall = classifySignalEvidence("first-call resolution", [salesforceEvidence], true);
    expect(firstCall.classification).toBe("present");

    const firstContact = classifySignalEvidence("first-contact resolution", [salesforceEvidence], true);
    expect(firstContact.classification).not.toBe("present");
    expect(["partial", "missing"]).toContain(firstContact.classification);
  });

  it("MISSING recommendations do not contain reframe language", () => {
    const result = classifySignalEvidence("TurboTax", [callQueueEvidence], true);
    const { recommendation } = buildGroundedRecommendationText("TurboTax", result);
    expect(result.classification).toBe("missing");
    expect(recommendation).not.toContain(PARTIAL_REFRAME_PREFIX);
    expect(isClassificationConsistentWithRecommendation({
      classification: result.classification,
      classification_reason: result.classification_reason,
      signal_name: "TurboTax",
      recommendation,
      evidence_used: result.evidence_used,
      evidence_confidence: result.evidence_confidence,
      transferability_confidence: result.transferability_confidence,
      grounded: true,
    })).toBe(true);
  });

  it("PARTIAL recommendations contain defensible reframe language", () => {
    const result = classifySignalEvidence("contact center", [callQueueEvidence], true);
    const { recommendation } = buildGroundedRecommendationText("contact center", result);
    expect(result.classification).toBe("partial");
    expect(recommendation).toContain(PARTIAL_REFRAME_PREFIX);
  });
});

describe("defensibility score formula", () => {
  it("computes weighted raw score from factors", () => {
    const factors: DefensibilityFactors = {
      evidence_directness: 80,
      translation_distance: 90,
      tool_domain_specificity: 100,
      follow_up_defensibility: 85,
    };
    expect(computeRawDefensibilityScore(factors)).toBe(89);
  });
});
