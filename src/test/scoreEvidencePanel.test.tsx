import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { buildScoringEvidence } from "@/lib/scoringEvidenceBuilder";
import ScoreEvidencePanel from "@/components/ScoreEvidencePanel";
import type { ScoringBreakdown } from "@/lib/scoreEvidence";

const SAMPLE_BREAKDOWN: ScoringBreakdown = {
  role_outcomes_alignment: 68,
  tools_and_workflow_alignment: 72,
  domain_and_context_alignment: 61,
  context_and_scale_alignment: 55,
  communication_and_leadership_alignment: 64,
};

function buildNjdolScoringEvidence() {
  return buildScoringEvidence({
    evidencePackage: [
      {
        evidence_id: "chunk-njdol-escalation",
        content:
          "Managed customer escalation calls regarding unemployment claims, benefit disputes, and employer compliance inquiries at New Jersey Department of Labor (NJDOL).",
        section: "experience",
        company: "NJDOL",
        role_title: "Customer Service Representative",
        similarity: 0.71,
      },
      {
        evidence_id: "chunk-njdol-salesforce",
        content:
          "Documented escalation outcomes in Salesforce and tracked repeat-contact drivers to improve first-call resolution.",
        section: "experience",
        company: "NJDOL",
        role_title: "Customer Service Representative",
        similarity: 0.58,
      },
    ],
    calibrated_bullets: [],
    scoring_breakdown: SAMPLE_BREAKDOWN,
    top_matched_signal: "customer escalation experience",
    top_missing_signal: "tax filing workflows",
    missing_keywords: ["tax filing", "call center"],
    score_rationale: [
      "[STRENGTH] Escalation handling aligns with JD priority.",
      "[GAP] Tax filing workflows are under-signaled.",
    ],
  });
}

describe("ScoreEvidencePanel", () => {
  it("renders breakdown and rationale without scoringEvidence", () => {
    render(
      <ScoreEvidencePanel
        title="Why this score · this run"
        breakdown={SAMPLE_BREAKDOWN}
        topMatchedSignal="customer escalation experience"
        topMissingSignal="tax filing workflows"
        strengths={["Escalation handling aligns with JD priority."]}
        gaps={["Tax filing workflows are under-signaled."]}
        showRationale
      />,
    );

    expect(screen.getByText("Why this score · this run")).toBeInTheDocument();
    expect(screen.getByText("Role Outcomes Alignment")).toBeInTheDocument();
    expect(screen.getByText("68%")).toBeInTheDocument();
    expect(screen.getByText(/Matched signal:/)).toBeInTheDocument();
    expect(screen.getByText(/Under-signaled priority:/)).toBeInTheDocument();
    expect(screen.getByText("What's landing")).toBeInTheDocument();
    expect(screen.getByText("Screen-out risks")).toBeInTheDocument();
    expect(screen.queryByText("Resume evidence")).not.toBeInTheDocument();
  });

  it("renders Resume evidence when scoringEvidence exists", () => {
    render(
      <ScoreEvidencePanel
        breakdown={SAMPLE_BREAKDOWN}
        topMatchedSignal="customer escalation experience"
        scoringEvidence={buildNjdolScoringEvidence()}
        isPro
      />,
    );

    expect(screen.getByText("Resume evidence")).toBeInTheDocument();
  });

  it("keeps Resume evidence collapsed by default", () => {
    render(
      <ScoreEvidencePanel
        breakdown={SAMPLE_BREAKDOWN}
        scoringEvidence={buildNjdolScoringEvidence()}
        isPro
      />,
    );

    expect(screen.getByText("Resume evidence")).toBeInTheDocument();
    expect(screen.queryByText("Resume-backed")).not.toBeInTheDocument();
  });

  it("does not expose internal metadata in the DOM", () => {
    const { container } = render(
      <ScoreEvidencePanel
        breakdown={SAMPLE_BREAKDOWN}
        scoringEvidence={buildNjdolScoringEvidence()}
        isPro
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /resume evidence/i }));
    expect(container.textContent).not.toContain("evidence_id");
    expect(container.textContent).not.toContain("similarity");
    expect(container.textContent).not.toContain("relevance_reason");
  });

  it("preserves breakdown bar rendering when scoringEvidence is present", () => {
    render(
      <ScoreEvidencePanel
        breakdown={SAMPLE_BREAKDOWN}
        scoringEvidence={buildNjdolScoringEvidence()}
        isPro
      />,
    );

    expect(screen.getByText("Tools & Workflow Alignment")).toBeInTheDocument();
    expect(screen.getByText("72%")).toBeInTheDocument();
    expect(
      screen.getByText(/Weighted across five employer-priority dimensions/),
    ).toBeInTheDocument();
  });
});
