import { describe, expect, it } from "vitest";
import { buildScoringEvidence } from "@/lib/scoringEvidenceBuilder";
import {
  assertDisplayPayloadSafe,
  confidenceLabel,
  formatExcerpt,
  pickDisplayLinks,
} from "@/lib/scoringEvidenceDisplay";
import type { ScoringBreakdown } from "@/lib/scoreEvidence";
import type { ScoringEvidence, ScoringEvidenceRef } from "@/lib/scoringEvidenceTypes";

const SAMPLE_BREAKDOWN: ScoringBreakdown = {
  role_outcomes_alignment: 68,
  tools_and_workflow_alignment: 72,
  domain_and_context_alignment: 61,
  context_and_scale_alignment: 55,
  communication_and_leadership_alignment: 64,
};

const njdolEscalationRef: ScoringEvidenceRef = {
  evidence_id: "chunk-njdol-escalation",
  content:
    "Managed customer escalation calls regarding unemployment claims, benefit disputes, and employer compliance inquiries at New Jersey Department of Labor (NJDOL).",
  section: "experience",
  company: "NJDOL",
  role_title: "Customer Service Representative",
  similarity: 0.71,
  relevance_reason: "internal-only",
};

const njdolSalesforceRef: ScoringEvidenceRef = {
  evidence_id: "chunk-njdol-salesforce",
  content:
    "Documented escalation outcomes in Salesforce and tracked repeat-contact drivers to improve first-call resolution.",
  section: "experience",
  company: "NJDOL",
  role_title: "Customer Service Representative",
  similarity: 0.58,
  relevance_reason: "internal-only",
};

function buildNjdolScoringEvidence(): ScoringEvidence {
  return buildScoringEvidence({
    evidencePackage: [
      {
        evidence_id: njdolEscalationRef.evidence_id,
        content: njdolEscalationRef.content,
        section: njdolEscalationRef.section,
        company: njdolEscalationRef.company,
        role_title: njdolEscalationRef.role_title,
        similarity: njdolEscalationRef.similarity,
      },
      {
        evidence_id: njdolSalesforceRef.evidence_id,
        content: njdolSalesforceRef.content,
        section: njdolSalesforceRef.section,
        company: njdolSalesforceRef.company,
        role_title: njdolSalesforceRef.role_title,
        similarity: njdolSalesforceRef.similarity,
      },
      {
        evidence_id: "chunk-njdol-tier2",
        content:
          "Coordinated tier-2 escalations with supervisors, legal reviewers, and partner agencies to resolve complex claimant cases within SLA targets.",
        section: "experience",
        company: "NJDOL",
        role_title: "Customer Service Representative",
        similarity: 0.62,
      },
    ],
    calibrated_bullets: [{ used_evidence: [njdolEscalationRef as any] }],
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

describe("confidenceLabel", () => {
  it("maps high confidence", () => {
    expect(confidenceLabel("high")).toEqual({ label: "High coverage", tone: "high" });
  });

  it("maps medium confidence", () => {
    expect(confidenceLabel("medium")).toEqual({ label: "Medium coverage", tone: "medium" });
  });

  it("maps low confidence", () => {
    expect(confidenceLabel("low")).toEqual({ label: "Low coverage", tone: "low" });
  });
});

describe("formatExcerpt", () => {
  it("normalizes whitespace and preserves meaning", () => {
    const formatted = formatExcerpt({
      content: "Managed   customer\nescalation   calls",
      section: "experience",
      company: "NJDOL",
    });
    expect(formatted.excerpt).toBe("Managed customer escalation calls");
    expect(formatted.section).toBe("experience");
    expect(formatted.company).toBe("NJDOL");
  });

  it("clamps long excerpts without rewriting content", () => {
    const longContent = `${"A".repeat(200)} escalation handling`;
    const formatted = formatExcerpt({
      content: longContent,
      section: "experience",
      company: "NJDOL",
    });
    expect(formatted.excerpt.length).toBeLessThanOrEqual(160);
    expect(formatted.excerpt.endsWith("…")).toBe(true);
    expect(formatted.excerpt.startsWith("A")).toBe(true);
  });
});

describe("pickDisplayLinks", () => {
  it("selects NJDOL matched evidence with supports linkage", () => {
    const display = pickDisplayLinks(buildNjdolScoringEvidence(), true);
    expect(display.matched.length).toBeGreaterThan(0);
    expect(display.matched[0].linkage).toBe("supports");
    expect(display.matched[0].signal).toBe("customer escalation experience");
    expect(display.matched[0].excerpts[0].excerpt).toContain("escalation");
    expect(display.matched[0].excerpts[0].company).toBe("NJDOL");
  });

  it("selects missing evidence as absent when unsupported", () => {
    const display = pickDisplayLinks(buildNjdolScoringEvidence(), true);
    const taxGap = display.missing.find((link) => /tax filing/i.test(link.signal));
    expect(taxGap).toBeDefined();
    expect(taxGap?.linkage).toBe("absent");
    expect(taxGap?.excerpts).toEqual([]);
  });

  it("dedupes repeated evidence across matched links", () => {
    const scoringEvidence = buildNjdolScoringEvidence();
    scoringEvidence.matched_evidence.push({
      signal: "duplicate escalation signal",
      linkage: "supports",
      evidence: [njdolEscalationRef],
    });

    const display = pickDisplayLinks(scoringEvidence, true);
    const allExcerpts = display.matched.flatMap((link) => link.excerpts);
    const uniqueExcerpts = new Set(allExcerpts.map((e) => e.excerpt));
    expect(allExcerpts.length).toBe(uniqueExcerpts.size);
  });

  it("applies free-tier display limits", () => {
    const display = pickDisplayLinks(buildNjdolScoringEvidence(), false);
    expect(display.matched.length).toBeLessThanOrEqual(1);
    expect(display.missing.length).toBeLessThanOrEqual(1);
  });

  it("applies pro display limits", () => {
    const display = pickDisplayLinks(buildNjdolScoringEvidence(), true);
    expect(display.matched.length).toBeLessThanOrEqual(2);
    expect(display.missing.length).toBeLessThanOrEqual(2);
  });

  it("prefers supports linkage over absent for matched selection", () => {
    const scoringEvidence = buildNjdolScoringEvidence();
    scoringEvidence.matched_evidence = [
      { signal: "weak signal", linkage: "absent", evidence: [] },
      {
        signal: "customer escalation experience",
        linkage: "supports",
        evidence: [njdolEscalationRef],
      },
    ];

    const display = pickDisplayLinks(scoringEvidence, false);
    expect(display.matched[0].linkage).toBe("supports");
  });

  it("does not generate synthetic evidence", () => {
    const display = pickDisplayLinks(buildNjdolScoringEvidence(), true);
    for (const link of [...display.matched, ...display.missing]) {
      for (const excerpt of link.excerpts) {
        expect(excerpt.excerpt).not.toMatch(/invented|synthetic|forged/i);
        expect(excerpt.excerpt.length).toBeGreaterThan(0);
      }
    }
  });

  it("does not leak evidence_id or internal metadata", () => {
    const display = pickDisplayLinks(buildNjdolScoringEvidence(), true);
    expect(() => assertDisplayPayloadSafe(display)).not.toThrow();
    const serialized = JSON.stringify(display);
    expect(serialized).not.toContain("evidence_id");
    expect(serialized).not.toContain("similarity");
    expect(serialized).not.toContain("relevance_reason");
  });

  it("returns low confidence label for empty scoring evidence input", () => {
    const display = pickDisplayLinks(null, false);
    expect(display.confidence).toEqual({ label: "Low coverage", tone: "low" });
    expect(display.matched).toEqual([]);
    expect(display.missing).toEqual([]);
  });
});

export const SAMPLE_DISPLAY_OUTPUT = pickDisplayLinks(buildNjdolScoringEvidence(), true);
