import { describe, it, expect } from "vitest";
import {
  classifyGapType,
  detectRequirementTier,
  isDomainOrToolSpecificSignal,
  GAP_TYPE_LABEL,
  DOMAIN_SPECIFICITY_THRESHOLD,
  type GapType,
} from "@/lib/gapTaxonomy";

describe("detectRequirementTier", () => {
  it("returns 'unknown' when no JD text is provided", () => {
    expect(detectRequirementTier("SAP ERP", undefined)).toBe("unknown");
    expect(detectRequirementTier("SAP ERP", "")).toBe("unknown");
  });

  it("returns 'unknown' when the signal is not mentioned in the JD", () => {
    expect(
      detectRequirementTier("aerospace certification", "We need a friendly customer service rep."),
    ).toBe("unknown");
  });

  it("detects a preferred tier from preference markers", () => {
    const jd = "Experience with SAP ERP is a plus. Electrical product knowledge preferred.";
    expect(detectRequirementTier("SAP ERP", jd)).toBe("preferred");
    expect(detectRequirementTier("electrical product knowledge", jd)).toBe("preferred");
  });

  it("detects a required tier from requirement markers", () => {
    const jd = "High-volume inbound phone support is required. Must have 2+ years customer service.";
    expect(detectRequirementTier("inbound phone support", jd)).toBe("required");
  });

  it("defaults conservatively to 'required' when the signal is present but unmarked", () => {
    const jd = "You will handle order coordination and process customer requests daily.";
    expect(detectRequirementTier("order coordination", jd)).toBe("required");
  });

  it("lets a requirement marker override a preference marker in the same sentence", () => {
    const jd = "SAP ERP experience is required, though prior distribution exposure is a plus.";
    expect(detectRequirementTier("SAP ERP", jd)).toBe("required");
  });
});

describe("isDomainOrToolSpecificSignal", () => {
  it("flags tool/platform and industry/product signals", () => {
    expect(isDomainOrToolSpecificSignal("SAP ERP inventory")).toBe(true);
    expect(isDomainOrToolSpecificSignal("electrical product knowledge")).toBe(true);
    expect(isDomainOrToolSpecificSignal("ServiceTitan dispatch")).toBe(true);
  });

  it("does not flag generic capability signals", () => {
    expect(isDomainOrToolSpecificSignal("customer escalation handling")).toBe(false);
    expect(isDomainOrToolSpecificSignal("stakeholder coordination")).toBe(false);
  });
});

describe("classifyGapType — precedence", () => {
  it("returns no gap for a present/matched signal", () => {
    const r = classifyGapType({ signal: "phone support", classification: "present" });
    expect(r.gap_type).toBeNull();
  });

  it("partial => Transferable Gap regardless of tier", () => {
    const r = classifyGapType({
      signal: "order coordination",
      classification: "partial",
      requirementTier: "required",
    });
    expect(r.gap_type).toBe<GapType>("transferable");
    expect(r.gap_type_rationale).toMatch(/related experience/i);
  });

  it("missing + preferred marker => Preferred Gap (even if domain-specific)", () => {
    const r = classifyGapType({
      signal: "SAP ERP",
      classification: "missing",
      requirementTier: "preferred",
    });
    expect(r.gap_type).toBe<GapType>("preferred");
  });

  it("missing + domain/tool-specific signal => Domain Gap", () => {
    const r = classifyGapType({
      signal: "electrical product knowledge",
      classification: "missing",
      requirementTier: "required",
    });
    expect(r.gap_type).toBe<GapType>("domain");
  });

  it("missing + low tool_domain_specificity number => Domain Gap (correct direction, no text marker)", () => {
    const r = classifyGapType({
      signal: "queue triage workflow", // not a text marker — isolates the numeric path
      classification: "missing",
      requirementTier: "required",
      toolDomainSpecificity: DOMAIN_SPECIFICITY_THRESHOLD - 5,
    });
    expect(r.gap_type).toBe<GapType>("domain");
  });

  it("missing + required/core + low domain specificity => Direct Gap", () => {
    const r = classifyGapType({
      signal: "inbound sales quota ownership",
      classification: "missing",
      requirementTier: "required",
      toolDomainSpecificity: 55, // generic (not specific)
    });
    expect(r.gap_type).toBe<GapType>("direct");
    expect(r.gap_type_rationale).toMatch(/not shown/i);
  });

  it("ambiguous (unknown tier, generic signal) defaults conservatively to Direct Gap", () => {
    const r = classifyGapType({
      signal: "consultative selling",
      classification: "missing",
      requirementTier: "unknown",
    });
    expect(r.gap_type).toBe<GapType>("direct");
  });
});

describe("classifyGapType — Graybar CSR fixture", () => {
  const graybarJd = [
    "Customer Service Representative at an electrical distribution branch.",
    "Handle high-volume inbound inquiries and process customer orders.",
    "Coordinate order and request handling with the warehouse team.",
    "SAP ERP experience is a plus.",
    "Electrical product knowledge required to advise customers.",
    "Inbound sales and product recommendation to walk-in customers.",
    "Prior retail or counter sales experience preferred.",
  ].join(" ");

  interface Row {
    signal: string;
    classification: "present" | "partial" | "missing";
    toolDomainSpecificity?: number;
    expected: GapType | null;
  }

  const rows: Row[] = [
    { signal: "high-volume inbound inquiries", classification: "present", expected: null },
    { signal: "order and request coordination", classification: "partial", expected: "transferable" },
    { signal: "SAP ERP", classification: "missing", toolDomainSpecificity: 0, expected: "preferred" },
    { signal: "electrical product knowledge", classification: "missing", toolDomainSpecificity: 22, expected: "domain" },
    { signal: "inbound sales and product recommendation", classification: "missing", toolDomainSpecificity: 55, expected: "direct" },
    { signal: "retail or counter sales experience", classification: "missing", expected: "preferred" },
  ];

  for (const row of rows) {
    it(`classifies "${row.signal}" as ${row.expected ?? "no gap"}`, () => {
      const tier = detectRequirementTier(row.signal, graybarJd);
      const result = classifyGapType({
        signal: row.signal,
        classification: row.classification,
        toolDomainSpecificity: row.toolDomainSpecificity,
        requirementTier: tier,
      });
      expect(result.gap_type).toBe(row.expected);
    });
  }

  it("exposes a human label for every gap type", () => {
    expect(GAP_TYPE_LABEL.direct).toBe("Direct Gap");
    expect(GAP_TYPE_LABEL.transferable).toBe("Transferable Gap");
    expect(GAP_TYPE_LABEL.preferred).toBe("Preferred Gap");
    expect(GAP_TYPE_LABEL.domain).toBe("Domain Gap");
  });
});
