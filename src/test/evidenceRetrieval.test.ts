import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EvidencePackageItem } from "@signalyz/groundedCalibration";

const mockRetrieveResumeEvidence = vi.fn();

vi.mock("@/services/rag/resumeIngestion", () => ({
  retrieveResumeEvidence: (...args: unknown[]) => mockRetrieveResumeEvidence(...args),
}));

vi.mock("@/services/rag/groundedCalibrationClient", () => ({
  getResumeSessionId: () => "session-test",
}));

import {
  buildGroundedNarrative,
  enrichPositioningReportWithEvidence,
  retrieveEvidenceForSection,
  retrieveEvidenceForSignal,
  retrieveEvidenceForTheme,
  runBackgroundDirectorEvidenceEnrichment,
  getDirectorReportEnrichmentKey,
  type RetrievedEvidence,
} from "@/lib/evidenceRetrieval";
import type { DirectorCalibrationResult } from "@/components/DirectorCalibrationBlock";

const njdolEscalationEvidence: EvidencePackageItem = {
  evidence_id: "chunk-njdol-escalation",
  content:
    "Managed customer escalation calls regarding unemployment claims, benefit disputes, and employer compliance inquiries.",
  section: "experience",
  company: "New Jersey Department of Labor (NJDOL)",
  role_title: "Customer Service Representative",
  similarity: 0.82,
};

const njdolSalesforceEvidence: EvidencePackageItem = {
  evidence_id: "chunk-njdol-salesforce",
  content: "Documented escalation outcomes in Salesforce and tracked repeat-contact drivers.",
  section: "experience",
  company: "NJDOL",
  role_title: "Customer Service Representative",
  similarity: 0.71,
};

const forgedEvidence: EvidencePackageItem = {
  evidence_id: "chunk-forged",
  content: "Led a $50M enterprise transformation with SAP and Workday at a Fortune 500 bank.",
  section: "experience",
  company: "Global MegaCorp",
  role_title: "VP Operations",
  similarity: 0.9,
};

function asRetrieved(items: EvidencePackageItem[]): RetrievedEvidence[] {
  return items.map((item) => ({
    evidence_id: item.evidence_id,
    content: item.content,
    section: item.section,
    company: item.company,
    role_title: item.role_title,
    similarity: item.similarity,
  }));
}

const MOCK_DIRECTOR_REPORT: DirectorCalibrationResult = {
  run_id: "run-test-1",
  dimensions: [
    {
      name: "Commercial Impact",
      classification: "Near Director Threshold",
      strength_signal: "Generic strength signal.",
      risk_signal: "Generic risk signal.",
    },
  ],
  director_signal_tier: { tier: "Senior IC Signal", rationale: "Generic tier rationale." },
  hiring_stage_friction: {
    recruiter_filter_risk: { level: "Moderate", observation: "Observation." },
    hiring_manager_friction: { level: "Moderate", observation: "Observation." },
    executive_skepticism: { level: "Low", observation: "Observation." },
    primary_friction_stage: "Hiring Manager Friction",
  },
  pattern_detection: { undersignaling_patterns: [], ownership_inflation_patterns: [] },
};

describe("evidenceRetrieval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRetrieveResumeEvidence.mockResolvedValue([]);
  });

  it("prefers calibrated_bullets.used_evidence before document chunk retrieval", async () => {
    mockRetrieveResumeEvidence.mockResolvedValue([
      {
        id: forgedEvidence.evidence_id,
        content: forgedEvidence.content,
        similarity: forgedEvidence.similarity,
        metadata: {
          section: forgedEvidence.section,
          company: forgedEvidence.company,
          role_title: forgedEvidence.role_title,
        },
      },
    ]);

    const evidence = await retrieveEvidenceForSignal("customer escalation management", {
      calibratedBullets: [{ used_evidence: [njdolEscalationEvidence] }],
      isAuthenticated: true,
    });

    expect(evidence[0]?.evidence_id).toBe("chunk-njdol-escalation");
    expect(mockRetrieveResumeEvidence).not.toHaveBeenCalled();
  });

  it("falls back to document_chunks when calibrated evidence is absent", async () => {
    mockRetrieveResumeEvidence.mockResolvedValue([
      {
        id: njdolEscalationEvidence.evidence_id,
        content: njdolEscalationEvidence.content,
        similarity: njdolEscalationEvidence.similarity,
        metadata: {
          section: njdolEscalationEvidence.section,
          company: njdolEscalationEvidence.company,
          role_title: njdolEscalationEvidence.role_title,
        },
      },
    ]);

    const evidence = await retrieveEvidenceForTheme("escalation management", {
      isAuthenticated: true,
    });

    expect(evidence[0]?.content).toContain("benefit disputes");
    expect(mockRetrieveResumeEvidence).toHaveBeenCalled();
  });

  it("retrieveEvidenceForSection filters calibrated evidence by section", async () => {
    const evidence = await retrieveEvidenceForSection("experience", {
      calibratedBullets: [
        { used_evidence: [njdolEscalationEvidence, njdolSalesforceEvidence] },
      ],
      isAuthenticated: true,
    });

    expect(evidence.length).toBe(2);
    expect(evidence.every((item) => item.section === "experience")).toBe(true);
    expect(mockRetrieveResumeEvidence).not.toHaveBeenCalled();
  });

  it("guest users fail gracefully without throwing", async () => {
    mockRetrieveResumeEvidence.mockRejectedValue(new Error("Authentication required"));

    const evidence = await retrieveEvidenceForSignal("escalation management", {
      isAuthenticated: false,
    });

    expect(evidence).toEqual([]);
    expect(mockRetrieveResumeEvidence).not.toHaveBeenCalled();
  });

  describe("buildGroundedNarrative", () => {
    it("states uncertainty when evidence is missing", () => {
      const result = buildGroundedNarrative("escalation management", []);

      expect(result.grounded).toBe(false);
      expect(result.confidence).toBe("none");
      expect(result.narrative).toContain("could not verify");
      expect(result.narrative).not.toContain("NJDOL");
    });

    it("builds narrative from retrieved content without inventing facts", () => {
      const result = buildGroundedNarrative(
        "escalation management",
        asRetrieved([njdolEscalationEvidence]),
      );

      expect(result.grounded).toBe(true);
      expect(result.narrative).toContain("benefit disputes");
      expect(result.narrative).toContain("NJDOL");
      expect(result.narrative).not.toContain("$50M");
      expect(result.narrative).not.toContain("Fortune 500");
    });

    it("does not hallucinate unsupported tools or metrics from unrelated evidence", () => {
      const result = buildGroundedNarrative(
        "escalation management",
        asRetrieved([forgedEvidence]),
      );

      expect(result.narrative).not.toContain("SAP");
      expect(result.narrative).not.toContain("Workday");
      expect(result.narrative).not.toContain("$50M");
    });

    it("marks low-confidence narratives when similarity is weak", () => {
      const weak: RetrievedEvidence = {
        ...asRetrieved([njdolEscalationEvidence])[0],
        similarity: 0.4,
      };

      const result = buildGroundedNarrative("escalation management", [weak]);

      expect(result.confidence).toBe("low");
      expect(result.narrative).toContain("limited indexed resume evidence");
    });
  });

  describe("runBackgroundDirectorEvidenceEnrichment", () => {
    it("applies enrichment after raw report is already available", async () => {
      const enrichFn = vi.fn(async (data: DirectorCalibrationResult) => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return {
          ...data,
          dimensions: data.dimensions.map((dimension) => ({
            ...dimension,
            grounded_strength_narrative: "At NJDOL, managed escalated benefit disputes.",
          })),
        };
      });

      const activeKeyRef = { current: "run-test-1" };
      let enrichedResult: DirectorCalibrationResult | null = null;
      let enrichedApplied = false;

      const enrichmentPromise = runBackgroundDirectorEvidenceEnrichment({
        directorData: MOCK_DIRECTOR_REPORT,
        enrichmentKey: "run-test-1",
        pipelineStartedAtMs: Date.now(),
        getActiveEnrichmentKey: () => activeKeyRef.current,
        context: { isAuthenticated: false },
        enrichFn,
        onApplyEnriched: (result) => {
          enrichedApplied = true;
          enrichedResult = result;
        },
      });

      expect(enrichedApplied).toBe(false);
      const outcome = await enrichmentPromise;

      expect(outcome.applied).toBe(true);
      expect(enrichedApplied).toBe(true);
      expect(enrichedResult?.dimensions[0]?.grounded_strength_narrative).toContain("NJDOL");
      expect(enrichFn).toHaveBeenCalledOnce();
    });

    it("leaves raw report intact when enrichment fails", async () => {
      const enrichFn = vi.fn(async () => {
        throw new Error("embedding failed");
      });

      const activeKeyRef = { current: "run-test-1" };
      let enrichedApplied = false;

      const outcome = await runBackgroundDirectorEvidenceEnrichment({
        directorData: MOCK_DIRECTOR_REPORT,
        enrichmentKey: "run-test-1",
        pipelineStartedAtMs: Date.now(),
        getActiveEnrichmentKey: () => activeKeyRef.current,
        context: { isAuthenticated: false },
        enrichFn,
        onApplyEnriched: () => {
          enrichedApplied = true;
        },
      });

      expect(outcome.applied).toBe(false);
      expect(enrichedApplied).toBe(false);
    });

    it("does not overwrite a newer report when enrichment is stale", async () => {
      const enrichFn = vi.fn(async (data: DirectorCalibrationResult) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return {
          ...data,
          dimensions: data.dimensions.map((dimension) => ({
            ...dimension,
            grounded_strength_narrative: "stale enrichment",
          })),
        };
      });

      const activeKeyRef = { current: "run-test-1" };
      let enrichedApplied = false;

      const enrichmentPromise = runBackgroundDirectorEvidenceEnrichment({
        directorData: MOCK_DIRECTOR_REPORT,
        enrichmentKey: "run-test-1",
        pipelineStartedAtMs: Date.now(),
        getActiveEnrichmentKey: () => activeKeyRef.current,
        context: { isAuthenticated: false },
        enrichFn,
        onApplyEnriched: () => {
          enrichedApplied = true;
        },
      });

      activeKeyRef.current = "run-test-2";
      const outcome = await enrichmentPromise;

      expect(outcome.applied).toBe(false);
      expect(enrichedApplied).toBe(false);
    });

    it("getDirectorReportEnrichmentKey prefers run_id", () => {
      expect(getDirectorReportEnrichmentKey(MOCK_DIRECTOR_REPORT, "req-2", 123)).toBe("run-test-1");
    });
  });

  describe("Phase A.1 — jdText wired into the gap taxonomy", () => {
    const graybarJd = [
      "Customer Service Representative at an electrical distribution branch.",
      "SAP ERP experience is a plus.",
      "Consultative selling is required for this role.",
    ].join(" ");

    it("classifies Preferred vs Direct gaps from the wired JD text", async () => {
      const enriched = await enrichPositioningReportWithEvidence(MOCK_DIRECTOR_REPORT, {
        isAuthenticated: false,
        jdText: graybarJd,
        alignmentGaps: {
          top_missing_signal: "consultative selling",
          missing_keywords: ["SAP ERP", "consultative selling"],
        },
      });

      const recs = enriched.grounded_recommendations ?? [];
      const erp = recs.find((r) => r.signal_name === "SAP ERP");
      const selling = recs.find((r) => r.signal_name === "consultative selling");

      // Both are unevidenced → missing (evidence classification unchanged).
      expect(erp?.classification).toBe("missing");
      expect(selling?.classification).toBe("missing");

      // The JD wording now differentiates them via the taxonomy.
      expect(erp?.requirement_tier).toBe("preferred");
      expect(erp?.gap_type).toBe("preferred");
      expect(selling?.requirement_tier).toBe("required");
      expect(selling?.gap_type).toBe("direct");
    });

    it("without jdText the requirement tier is unknown (Preferred/Direct stays dormant)", async () => {
      const enriched = await enrichPositioningReportWithEvidence(MOCK_DIRECTOR_REPORT, {
        isAuthenticated: false,
        alignmentGaps: { missing_keywords: ["SAP ERP", "consultative selling"] },
      });

      const recs = enriched.grounded_recommendations ?? [];
      const selling = recs.find((r) => r.signal_name === "consultative selling");
      expect(selling?.requirement_tier).toBe("unknown");
      // A generic signal with no JD signal still resolves conservatively to Direct.
      expect(selling?.gap_type).toBe("direct");
    });
  });
});
