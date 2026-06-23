import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { buildScoringEvidence } from "@/lib/scoringEvidenceBuilder";
import { assertDisplayPayloadSafe } from "@/lib/scoringEvidenceDisplay";
import {
  ScoringEvidenceBadge,
  ScoringEvidenceExcerpt,
  ScoringEvidenceSection,
} from "@/components/scoring-evidence";
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

describe("ScoringEvidenceBadge", () => {
  it("renders high coverage label", () => {
    render(<ScoringEvidenceBadge confidence={{ label: "High coverage", tone: "high" }} />);
    expect(screen.getByText("High coverage")).toBeInTheDocument();
  });
});

describe("ScoringEvidenceExcerpt", () => {
  it("renders excerpt and metadata without internal fields", () => {
    const { container } = render(
      <ScoringEvidenceExcerpt
        excerpt={{
          excerpt: "Managed customer escalation calls regarding unemployment claims.",
          section: "experience",
          company: "NJDOL",
        }}
      />,
    );
    expect(screen.getByText(/Managed customer escalation calls/)).toBeInTheDocument();
    expect(screen.getByText("experience · NJDOL")).toBeInTheDocument();
    expect(container.textContent).not.toContain("evidence_id");
  });
});

describe("ScoringEvidenceSection", () => {
  it("is collapsed by default", () => {
    render(<ScoringEvidenceSection scoringEvidence={buildNjdolScoringEvidence()} isPro />);
    expect(screen.getByText("Resume evidence")).toBeInTheDocument();
    expect(screen.queryByText("Resume-backed")).not.toBeInTheDocument();
    expect(screen.queryByText("Not found in resume")).not.toBeInTheDocument();
  });

  it("expands to show resume-backed and absent labels", () => {
    render(<ScoringEvidenceSection scoringEvidence={buildNjdolScoringEvidence()} isPro />);
    fireEvent.click(screen.getByRole("button", { name: /resume evidence/i }));
    expect(screen.getByText("Resume-backed")).toBeInTheDocument();
    expect(screen.getAllByText("Not found in resume").length).toBeGreaterThan(0);
    expect(screen.getByText(/Managed customer escalation calls/)).toBeInTheDocument();
  });

  it("applies free-tier link limits when expanded", () => {
    render(<ScoringEvidenceSection scoringEvidence={buildNjdolScoringEvidence()} isPro={false} />);
    fireEvent.click(screen.getByRole("button", { name: /resume evidence/i }));
    expect(screen.getAllByText("Not found in resume")).toHaveLength(1);
  });

  it("shows up to two missing links for pro when expanded", () => {
    render(<ScoringEvidenceSection scoringEvidence={buildNjdolScoringEvidence()} isPro />);
    fireEvent.click(screen.getByRole("button", { name: /resume evidence/i }));
    expect(screen.getAllByText("Not found in resume").length).toBeLessThanOrEqual(2);
  });

  it("does not render internal metadata in the DOM", () => {
    const { container } = render(
      <ScoringEvidenceSection scoringEvidence={buildNjdolScoringEvidence()} isPro />,
    );
    fireEvent.click(screen.getByRole("button", { name: /resume evidence/i }));
    expect(container.textContent).not.toContain("evidence_id");
    expect(container.textContent).not.toContain("similarity");
    expect(container.textContent).not.toContain("relevance_reason");
  });

  it("returns null when scoring evidence is missing", () => {
    const { container } = render(<ScoringEvidenceSection scoringEvidence={null} isPro />);
    expect(container.firstChild).toBeNull();
  });

  it("keeps expanded display payload safe for UI consumption", () => {
    render(<ScoringEvidenceSection scoringEvidence={buildNjdolScoringEvidence()} isPro />);
    fireEvent.click(screen.getByRole("button", { name: /resume evidence/i }));
    expect(() =>
      assertDisplayPayloadSafe({
        matched: [
          {
            signal: "customer escalation experience",
            linkage: "supports",
            excerpts: [{ excerpt: "Managed customer escalation calls", section: "experience", company: "NJDOL" }],
          },
        ],
      }),
    ).not.toThrow();
  });
});
