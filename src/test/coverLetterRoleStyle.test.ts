import { describe, it, expect } from "vitest";
import {
  detectRoleCategory,
  roleStyleGuidance,
  buildRoleStyleBlock,
} from "../../supabase/functions/_shared/coverLetterRoleStyle";

describe("detectRoleCategory (Phase 9.12)", () => {
  it("classifies a CarMax-style retail role as customer_service_retail_ops", () => {
    const jd =
      "As a Customer Specialist in Training, you will deliver an iconic, customer-first experience. CarMax is the nation's largest retailer of used cars.";
    expect(detectRoleCategory(jd, "Customer Specialist")).toBe("customer_service_retail_ops");
  });

  it("classifies a SaaS customer success role", () => {
    const jd =
      "Customer Success Manager owning renewals and expansion for a book of business across our SaaS platform, using Gainsight.";
    expect(detectRoleCategory(jd, "Customer Success Manager")).toBe("customer_success_saas");
  });

  it("classifies a technical role", () => {
    const jd =
      "Full-stack software engineer building API integrations and owning production deployment of our web application.";
    expect(detectRoleCategory(jd, "Software Engineer")).toBe("technical_ai_product");
  });

  it("classifies a claims / compliance role", () => {
    const jd =
      "Claims Specialist handling adjudication of benefit claims under strict regulatory compliance and SLA targets.";
    expect(detectRoleCategory(jd, "Claims Specialist")).toBe("admin_claims_compliance_ops");
  });

  it("falls back to general for an ambiguous JD", () => {
    expect(detectRoleCategory("Join our team and make a difference.", "")).toBe("general");
  });

  it("returns general for empty input", () => {
    expect(detectRoleCategory("", "")).toBe("general");
  });
});

describe("roleStyleGuidance (Phase 9.12)", () => {
  it("emphasizes retail/ops strengths and forbids product/sales/appraisal claims", () => {
    const g = roleStyleGuidance("customer_service_retail_ops");
    expect(g).toMatch(/customer guidance|workflow ownership|documentation accuracy/i);
    expect(g).toMatch(/do not claim/i);
    expect(g).toMatch(/sales|inventory|appraisal|repair/i);
  });

  it("forbids quota / book-of-business / renewals for SaaS", () => {
    const g = roleStyleGuidance("customer_success_saas");
    expect(g).toMatch(/onboarding|stakeholder support|retention/i);
    expect(g).toMatch(/quota|book-of-business|renewals|expansion/i);
  });

  it("forbids ML research / leadership overreach for technical roles", () => {
    const g = roleStyleGuidance("technical_ai_product");
    expect(g).toMatch(/api integration|production ownership|debugging/i);
    expect(g).toMatch(/ml research|senior engineering leadership|people management/i);
  });

  it("forbids leadership/legal overreach for claims/compliance roles", () => {
    const g = roleStyleGuidance("admin_claims_compliance_ops");
    expect(g).toMatch(/regulated workflows|sla handling|compliance judgment/i);
    expect(g).toMatch(/leadership|legal authority|adjudication scope/i);
  });

  it("provides a safe general fallback", () => {
    const g = roleStyleGuidance("general");
    expect(g).toMatch(/resume-supported strengths/i);
    expect(g).toMatch(/do not claim any domain-specific experience/i);
  });
});

describe("buildRoleStyleBlock (Phase 9.12)", () => {
  it("routes a retail JD to the retail guidance block", () => {
    const block = buildRoleStyleBlock(
      "CarMax retailer of used cars, customer-first experience.",
      "Customer Specialist",
    );
    expect(block).toMatch(/customer service \/ retail \/ operations/i);
  });
});
