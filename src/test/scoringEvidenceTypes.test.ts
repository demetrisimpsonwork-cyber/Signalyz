import { describe, expect, it } from "vitest";
import {
  collectAllowedScoringEvidence,
  filterScoringEvidenceRefs,
  finalizeScoringEvidenceLink,
  toScoringEvidenceRef,
} from "@/lib/scoringEvidenceTypes";
import type { EvidencePackageItem } from "@signalyz/groundedCalibration";

const chunkA: EvidencePackageItem = {
  evidence_id: "exp:acme:Led team of 12",
  content: "Led team of 12 analysts across compliance workflows",
  section: "experience",
  company: "Acme",
  role_title: "Manager",
  similarity: 0.72,
};

const chunkB: EvidencePackageItem = {
  evidence_id: "exp:beta:Salesforce CRM",
  content: "Maintained Salesforce CRM pipeline hygiene",
  section: "experience",
  company: "Beta",
  role_title: "Coordinator",
  similarity: 0.58,
};

describe("scoringEvidenceTypes contract", () => {
  it("collectAllowedScoringEvidence unions package and calibrated used_evidence", () => {
    const allowed = collectAllowedScoringEvidence({
      evidencePackage: [chunkA],
      calibratedBullets: [{ used_evidence: [chunkB] }],
    });
    expect(allowed).toHaveLength(2);
    expect(allowed.map((c) => c.evidence_id).sort()).toEqual([chunkA.evidence_id, chunkB.evidence_id].sort());
  });

  it("dedupes by evidence_id across sources", () => {
    const allowed = collectAllowedScoringEvidence({
      evidencePackage: [chunkA],
      calibratedBullets: [{ used_evidence: [chunkA] }],
    });
    expect(allowed).toHaveLength(1);
  });

  it("filterScoringEvidenceRefs drops refs not in allowed pool", () => {
    const ref = toScoringEvidenceRef(chunkA, "pillar: ownership");
    const forged = {
      ...ref,
      evidence_id: "forged:id",
      content: "Invented resume claim",
    };
    const filtered = filterScoringEvidenceRefs([chunkA], [ref, forged]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].evidence_id).toBe(chunkA.evidence_id);
  });

  it("finalizeScoringEvidenceLink uses absent when evidence is empty", () => {
    const link = finalizeScoringEvidenceLink("stakeholder management", []);
    expect(link.linkage).toBe("absent");
    expect(link.evidence).toEqual([]);
  });
});
