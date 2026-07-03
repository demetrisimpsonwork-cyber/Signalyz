import { describe, it, expect } from "vitest";
import {
  applyHiringReportIntegrityGate,
  canTechnicalSignalTransferFromResume,
  gateExportBuilderChanges,
  hasSupportedTechnicalPresence,
  isJdSourcedBullet,
  normalizeAtomicGapLabel,
  HIRING_REPORT_TRUST_COPY,
} from "@signalyz/hiringReportIntegrity";
import { classifyGapType } from "@/lib/gapTaxonomy";
import { classifySignalEvidence } from "@/lib/groundedRecommendations";

const CS_RESUME = `
Customer Service Representative | NJDOL | 2019 – 2023
- Managed customer escalation calls regarding unemployment claims and benefit disputes.
- Coordinated tier-2 escalations with supervisors, legal reviewers, and partner agencies.
- Documented escalation outcomes in Salesforce and tracked repeat-contact drivers.
`.trim();

const SOFTWARE_JD = `
Software Engineer I
Modify and/or enhance existing components of a small scale with guidance from a supervisor or senior engineer.
Requirements: SDLC, unit testing, integration testing, RESTful API, programming languages, cloud AI services, n-tier architecture.
`.trim();

const JD_BULLET =
  "Modify and/or enhance existing components of a small scale with guidance from a supervisor or senior engineer";

describe("hiringReportIntegrity — export builder gating", () => {
  const approvedRewrite = {
    original_bullet: "Managed customer escalation calls regarding unemployment claims and benefit disputes.",
    revised_bullet:
      "Owned resolution for high-volume customer escalation calls regarding unemployment claims and benefit disputes.",
    gap_fixed: "ownership scope",
  };

  const flaggedRewrite = {
    original_bullet: JD_BULLET,
    revised_bullet:
      "Developed and enhanced software components under senior engineer guidance while applying SDLC and unit testing practices.",
    gap_fixed: "SDLC",
  };

  it("validator-failed rewrite is not shown as an approved Export Builder change", () => {
    const gated = gateExportBuilderChanges({
      changes_diff: [approvedRewrite, flaggedRewrite],
      final_resume_text: `${approvedRewrite.revised_bullet}\n${flaggedRewrite.revised_bullet}`,
      validator: {
        status: "revise",
        issues: [
          `The rewrite "${flaggedRewrite.revised_bullet.slice(0, 60)}" introduces fabricated software engineering claims unsupported by the resume.`,
        ],
      },
      resumeText: CS_RESUME,
      jdText: SOFTWARE_JD,
    });

    expect(gated.changes_diff).toHaveLength(1);
    expect(gated.changes_diff[0].original_bullet).toBe(approvedRewrite.original_bullet);
    expect(gated.rejected_changes).toHaveLength(1);
  });

  it("validator-failed rewrite appears only under rejected/needs-confirmation", () => {
    const gated = gateExportBuilderChanges({
      changes_diff: [flaggedRewrite],
      final_resume_text: flaggedRewrite.revised_bullet,
      validator: {
        status: "revise",
        issues: ["Unsupported fabrication in revised bullet about unit testing and RESTful API development."],
      },
      resumeText: CS_RESUME,
      jdText: SOFTWARE_JD,
    });

    expect(gated.changes_diff).toHaveLength(0);
    expect(gated.rejected_changes[0].rejection_reason).toMatch(/Validator|JD language/i);
  });

  it("JD requirement line is not treated as an original resume bullet", () => {
    expect(isJdSourcedBullet(JD_BULLET, SOFTWARE_JD, CS_RESUME)).toBe(true);
    const gated = gateExportBuilderChanges({
      changes_diff: [
        {
          original_bullet: JD_BULLET,
          revised_bullet: "Enhanced software components with SDLC discipline.",
          gap_fixed: "SDLC",
        },
      ],
      final_resume_text: "Enhanced software components with SDLC discipline.",
      validator: { status: "pass", issues: [] },
      resumeText: CS_RESUME,
      jdText: SOFTWARE_JD,
    });
    expect(gated.changes_diff).toHaveLength(0);
    expect(gated.rejected_changes[0].rejection_reason).toMatch(/JD language/i);
  });
});

describe("hiringReportIntegrity — technical gap classification", () => {
  it("customer service evidence does not support unit testing", () => {
    expect(canTechnicalSignalTransferFromResume("unit testing experience", CS_RESUME)).toBe(false);
  });

  it("customer service evidence does not support RESTful API", () => {
    expect(canTechnicalSignalTransferFromResume("RESTful API development", CS_RESUME)).toBe(false);
  });

  it("customer service evidence does not support programming languages", () => {
    expect(canTechnicalSignalTransferFromResume("programming languages", CS_RESUME)).toBe(false);
  });

  it("customer service evidence does not support cloud AI services", () => {
    expect(canTechnicalSignalTransferFromResume("cloud AI services", CS_RESUME)).toBe(false);
  });

  it('vague "AI-powered engine" does not automatically support n-tiered architecture', () => {
    const resume = "Built an AI-powered professional signal calibration engine for job seekers.";
    expect(hasSupportedTechnicalPresence("n-tier architecture", resume)).toBe(false);
  });

  it("long assessment sentences are normalized to atomic gap labels", () => {
    const raw =
      "No software development lifecycle (SDLC), unit testing, or integration testing experience is present in the resume.";
    expect(normalizeAtomicGapLabel(raw)).toBe("SDLC");
  });

  it("approved non-technical transferable rewrites still work", () => {
    const gated = gateExportBuilderChanges({
      changes_diff: [
        {
          original_bullet:
            "Managed customer escalation calls regarding unemployment claims and benefit disputes.",
          revised_bullet:
            "Owned resolution for high-volume customer escalation calls regarding unemployment claims and benefit disputes.",
          gap_fixed: "ownership scope",
        },
      ],
      final_resume_text:
        "Owned resolution for high-volume customer escalation calls regarding unemployment claims and benefit disputes.",
      validator: { status: "pass", issues: [] },
      resumeText: CS_RESUME,
      jdText: SOFTWARE_JD,
    });
    expect(gated.changes_diff).toHaveLength(1);
    expect(gated.rejected_changes).toHaveLength(0);
  });
});

describe("hiringReportIntegrity — integration", () => {
  it("applyHiringReportIntegrityGate completes without stripping valid export builder output", () => {
    const result = applyHiringReportIntegrityGate(
      {
        consistency_validator: { status: "pass", issues: [] },
        export_builder: {
          final_resume_text: CS_RESUME,
          changes_diff: [
            {
              original_bullet:
                "Managed customer escalation calls regarding unemployment claims and benefit disputes.",
              revised_bullet:
                "Owned resolution for high-volume customer escalation calls regarding unemployment claims and benefit disputes.",
              gap_fixed: "ownership scope",
            },
          ],
        },
        signal_classifier: {
          top_3_gaps: [
            "No software development lifecycle (SDLC), unit testing, or integration testing experience is present in the resume.",
          ],
        },
      },
      CS_RESUME,
      SOFTWARE_JD,
    );

    expect(result.export_builder?.changes_diff).toHaveLength(1);
    expect(result.signal_classifier?.top_3_gaps?.[0]).toBe("SDLC");
  });

  it("report footer trust copy no longer says Zero fabrication", () => {
    expect(HIRING_REPORT_TRUST_COPY.toLowerCase()).not.toContain("zero fabrication");
    expect(HIRING_REPORT_TRUST_COPY).toMatch(/Built from your real experience/i);
  });
});

describe("gap taxonomy + grounded recommendations — technical guardrails", () => {
  it("classifies technical partial gaps as direct when resume lacks construction evidence", () => {
    const { gap_type } = classifyGapType({
      signal: "unit testing",
      classification: "partial",
      resumeText: CS_RESUME,
    });
    expect(gap_type).toBe("direct");
  });

  it("downgrades unsupported technical present signals", () => {
    const result = classifySignalEvidence(
      "n-tier architecture",
      [
        {
          evidence_id: "1",
          content: "Built an AI-powered professional signal calibration engine.",
          section: "experience",
          company: "Signalyz",
          role_title: "Founder",
          similarity: 0.8,
        },
      ],
      true,
      "Built an AI-powered professional signal calibration engine for job seekers.",
    );
    expect(result.classification).toBe("missing");
  });
});
