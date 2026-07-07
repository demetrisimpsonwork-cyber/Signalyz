import { describe, it, expect } from "vitest";
import {
  detectRoleCategory,
  roleStyleGuidance,
  buildRoleStyleBlock,
  detectSevereTechnicalGap,
  detectTechnicalResumeEvidence,
  letterUnderusesTechnicalEvidence,
  buildTechnicalEvidencePriorityBlock,
  buildSevereGapRealismBlock,
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

  it("classifies a Pinterest-style product apprenticeship before generic PM technical", () => {
    const jd =
      "Product Manager Apprenticeship at Pinterest. Learn product discovery, user research, and cross-functional collaboration.";
    expect(detectRoleCategory(jd, "Product Manager Apprentice")).toBe("product_apprenticeship");
  });

  it("classifies a Staff AI Engineer JD as technical_ai_product", () => {
    const jd =
      "Staff AI Engineer building agentic AI systems, LLM pipelines, RAG, vector search, and production ML infrastructure. PhD preferred.";
    expect(detectRoleCategory(jd, "Staff AI Engineer")).toBe("technical_ai_product");
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

describe("technical role evidence priority (Phase 9.14)", () => {
  const resume = `
    Signalyz — AI SaaS product with Claude/Anthropic API, Supabase, PostgreSQL, Edge Functions, RAG, embeddings
  `;

  it("detects severe technical gap on Staff AI JD", () => {
    const jd =
      "Staff AI Engineer, production ML, agentic AI, RAG, vector search, computer vision. PhD preferred.";
    expect(detectSevereTechnicalGap(jd, "Staff AI Engineer")).toBe(true);
  });

  it("detects Signalyz and related technical resume markers", () => {
    const markers = detectTechnicalResumeEvidence(resume);
    expect(markers).toContain("Signalyz");
    expect(markers.some((m) => /anthropic|claude|supabase|rag/i.test(m))).toBe(true);
  });

  it("builds a technical evidence priority prompt block", () => {
    const block = buildTechnicalEvidencePriorityBlock(resume);
    expect(block).toMatch(/TECHNICAL EVIDENCE PRIORITY/i);
    expect(block).toMatch(/Signalyz/i);
    expect(block).toMatch(/never as the main centerpiece/i);
  });

  it("builds a severe-gap realism block for Staff AI JDs", () => {
    const block = buildSevereGapRealismBlock(
      "Staff AI Engineer, production ML, agentic AI",
      "Staff AI Engineer",
    );
    expect(block).toMatch(/SEVERE ROLE-GAP REALISM/i);
    expect(block).toMatch(/not the conventional Staff AI profile/i);
  });

  it("flags NJDOL-centered letters when resume has technical evidence", () => {
    const letter = [
      "At the New Jersey Department of Labor, I managed high-volume casework.",
      "That experience shapes how I troubleshoot failures.",
    ].join("\n\n");
    expect(
      letterUnderusesTechnicalEvidence(letter, resume, "technical_ai_product"),
    ).toBe(true);
  });

  it("does not flag letters that lead with Signalyz", () => {
    const letter =
      "Building Signalyz, a production AI SaaS on Supabase and Claude, is my strongest proof for this role.";
    expect(
      letterUnderusesTechnicalEvidence(letter, resume, "technical_ai_product"),
    ).toBe(false);
  });
});
