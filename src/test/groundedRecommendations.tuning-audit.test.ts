import { describe, it } from "vitest";
import { NJDOL_RESUME_TEXT } from "@/test/fixtures/rag/njdolResume";
import { DEMETRI_RESUME } from "@/test/fixtures/scoring/v1/fixtureData";
import type { DirectorCalibrationResult } from "@/components/DirectorCalibrationBlock";
import type { AlignmentGapsInput } from "@/lib/groundedRecommendationTypes";
import { buildGroundedRecommendations, buildGapRegistry } from "@/lib/groundedRecommendations";
import { scoreEvidenceForSignal, type RetrievedEvidence } from "@/lib/evidenceRetrieval";

const BASE_DIRECTOR: DirectorCalibrationResult = {
  dimensions: [],
  director_signal_tier: { tier: "Senior IC Signal", rationale: "Audit" },
  hiring_stage_friction: {
    recruiter_filter_risk: { level: "Moderate", observation: "x" },
    hiring_manager_friction: { level: "Moderate", observation: "x" },
    executive_skepticism: { level: "Low", observation: "x" },
    primary_friction_stage: "Hiring Manager Friction",
  },
  pattern_detection: { undersignaling_patterns: [], ownership_inflation_patterns: [] },
  signal_classifier: {
    target_level_inferred: "Mid-Level",
    dimension_scores: {
      commercial: { score: 9, gap: "no_commercial_attribution", missing: ["renewal", "expansion", "NRR"] },
      ownership: { score: 10, gap: "limited_ownership_scope", missing: ["portfolio ownership"] },
      authority: { score: 11, gap: "weak_decision_authority", missing: [] },
      cross_functional: { score: 12, gap: "missing_cross_functional_leadership", missing: [] },
      lifecycle: { score: 9, gap: "incomplete_lifecycle_governance", missing: ["QBR", "onboarding lifecycle"] },
      risk: { score: 11, gap: "absent_risk_framing", missing: [] },
      narrative: { score: 12, gap: "fragmented_narrative", missing: [] },
    },
    overall_seniority_alignment: "Partial Alignment",
    top_3_gaps: ["limited_ownership_scope", "no_commercial_attribution", "incomplete_lifecycle_governance"],
  },
};

const CHEQ_GAPS: AlignmentGapsInput = {
  top_missing_signal: "mid-market SaaS account portfolio ownership and QBR leadership",
  missing_keywords: ["QBR", "churn", "renewal", "expansion", "Gainsight", "GA4", "NRR", "ARR"],
  score_rationale: [
    "[GAP] Limited portfolio ownership for mid-market SaaS accounts",
    "[GAP] No demonstrated churn reduction or expansion outcomes",
    "[GAP] No GA4 or product analytics tooling on resume",
  ],
  primary_blocker: "Weak commercial retention and expansion signal",
};

const DISPATCHER_GAPS: AlignmentGapsInput = {
  top_missing_signal: "field service dispatch and route scheduling",
  missing_keywords: [
    "ServiceTitan",
    "dispatch",
    "plumbing",
    "field service",
    "route optimization",
    "customer intake",
  ],
  score_rationale: [
    "[GAP] No field service dispatch or technician scheduling experience",
    "[GAP] Missing FSM platform experience",
  ],
  primary_blocker: "No dispatch operations signal",
};

const LOGISTICS_GAPS: AlignmentGapsInput = {
  top_missing_signal: "inventory and warehouse logistics coordination",
  missing_keywords: ["ERP", "warehouse", "purchase order", "shipment tracking", "logistics", "distribution"],
  score_rationale: ["[GAP] No supply chain or inventory workflow experience"],
  primary_blocker: "Missing logistics domain evidence",
};

function chunkResume(resume: string, company = "NJDOL", role = "Customer Service Representative"): RetrievedEvidence[] {
  const chunks: RetrievedEvidence[] = [];
  for (const line of resume.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("-")) {
      chunks.push({
        evidence_id: `chunk-${chunks.length}`,
        content: trimmed.replace(/^-\s*/, ""),
        section: "experience",
        company,
        role_title: role,
        similarity: 0.72,
      });
    }
  }
  return chunks;
}

function makeRetriever(pool: RetrievedEvidence[]) {
  return async (signal: string): Promise<RetrievedEvidence[]> => {
    const scored = scoreEvidenceForSignal(signal, pool);
    return scored.ranked
      .map((item, idx) => ({
        ...item,
        similarity:
          idx === 0
            ? Math.min(0.88, 0.4 + scored.overlap * 0.55 + (item.similarity > 0.5 ? 0.1 : 0))
            : item.similarity,
      }))
      .slice(0, 5);
  };
}

function summarize(label: string, recs: Awaited<ReturnType<typeof buildGroundedRecommendations>>) {
  const present = recs.filter((r) => r.classification === "present").length;
  const partial = recs.filter((r) => r.classification === "partial").length;
  const missing = recs.filter((r) => r.classification === "missing").length;

  console.log("\n" + "=".repeat(60));
  console.log(label);
  console.log("=".repeat(60));
  console.log({ present, partial, missing, total: recs.length });

  const partials = recs.filter((r) => r.classification === "partial");
  for (const r of partials.slice(0, 3)) {
    console.log("PARTIAL:", JSON.stringify({
      signal: r.signal_name,
      reason: r.classification_reason,
      ev_conf: +r.evidence_confidence.toFixed(3),
      transfer: +r.transferability_confidence.toFixed(3),
      recommendation: r.recommendation.slice(0, 180),
    }));
  }

  const keyMissing = recs.filter((r) =>
    /^(GA4|ServiceTitan|dispatch|logistics|Gainsight)$/i.test(r.signal_name.trim()) ||
    r.signal_name.toLowerCase().includes("field service dispatch"),
  );
  for (const r of keyMissing) {
    console.log("KEY:", JSON.stringify({
      signal: r.signal_name,
      class: r.classification,
      reason: r.classification_reason,
    }));
  }

  const intake = recs.find((r) => r.signal_name.toLowerCase() === "customer intake");
  if (intake) {
    console.log("INTAKE:", JSON.stringify({
      class: intake.classification,
      reason: intake.classification_reason,
    }));
  }

  return { present, partial, missing, recs };
}

describe("groundedRecommendations tuning re-audit", () => {
  it("reports CHEQ, Dispatcher, Logistics, SaaS cross-check", async () => {
    const njdolPool = chunkResume(NJDOL_RESUME_TEXT);
    const saasPool = chunkResume(DEMETRI_RESUME, "Signalyz", "Customer Experience Manager");

    const cheq = summarize(
      "CHEQ CSM + NJDOL",
      await buildGroundedRecommendations({
        director: BASE_DIRECTOR,
        alignmentGaps: CHEQ_GAPS,
        retrievalVerified: true,
        retrieveForSignal: makeRetriever(njdolPool),
      }),
    );

    const dispatcher = summarize(
      "Benjamin Franklin Dispatcher + NJDOL",
      await buildGroundedRecommendations({
        director: BASE_DIRECTOR,
        alignmentGaps: DISPATCHER_GAPS,
        retrievalVerified: true,
        retrieveForSignal: makeRetriever(njdolPool),
      }),
    );

    const logistics = summarize(
      "Supply Chain / Logistics + NJDOL",
      await buildGroundedRecommendations({
        director: BASE_DIRECTOR,
        alignmentGaps: LOGISTICS_GAPS,
        retrievalVerified: true,
        retrieveForSignal: makeRetriever(njdolPool),
      }),
    );

    const saasCheq = summarize(
      "SaaS DEMETRI_RESUME + CHEQ cross-check",
      await buildGroundedRecommendations({
        director: BASE_DIRECTOR,
        alignmentGaps: CHEQ_GAPS,
        retrievalVerified: true,
        retrieveForSignal: makeRetriever(saasPool),
      }),
    );

    console.log("\nCHEQ registry:", buildGapRegistry(BASE_DIRECTOR, CHEQ_GAPS));
    console.log("Dispatcher registry:", buildGapRegistry(BASE_DIRECTOR, DISPATCHER_GAPS));

    console.log("\nSUMMARY:", JSON.stringify({
      cheq: { p: cheq.present, pa: cheq.partial, m: cheq.missing },
      dispatcher: { p: dispatcher.present, pa: dispatcher.partial, m: dispatcher.missing },
      logistics: { p: logistics.present, pa: logistics.partial, m: logistics.missing },
      saas_cheq: { p: saasCheq.present, pa: saasCheq.partial, m: saasCheq.missing },
    }));
  });
});
