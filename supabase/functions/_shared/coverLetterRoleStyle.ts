/**
 * coverLetterRoleStyle — role-aware cover-letter guidance.
 *
 * Pure: (jd, roleTitle) → a role category, and category → a guidance block that
 * tells the model which resume-supported strengths to emphasize and which
 * domain claims to avoid. No Deno/Node APIs, so it is importable from both the
 * edge function and vitest. This generalizes the CarMax-specific behavior into a
 * reusable, role-aware standard without hard-coding any single company/letter.
 */

export type RoleCategory =
  | "customer_service_retail_ops"
  | "customer_success_saas"
  | "technical_ai_product"
  | "admin_claims_compliance_ops"
  | "general";

const TECHNICAL_AI_PRODUCT =
  /\b(software engineer|developer|full[-\s]?stack|back[-\s]?end|front[-\s]?end|web developer|api|sdk|machine learning|ml engineer|data engineer|devops|site reliability|product manager|ai engineer|programming|codebase|deployment|system architecture|microservices)\b/i;

const CUSTOMER_SUCCESS_SAAS =
  /\b(customer success|csm|client success|onboarding specialist|renewals?|churn|book of business|saas|account manager|quarterly business review|qbr|net revenue retention|retention|upsell|expansion|gainsight)\b/i;

const ADMIN_CLAIMS_COMPLIANCE =
  /\b(claims?|adjudicat\w*|compliance|regulatory|underwrit\w*|case management|benefits administration|policy administration|audit\w*|dispute resolution|fraud review|eligibility determination)\b/i;

const CUSTOMER_SERVICE_RETAIL_OPS =
  /\b(customer service|customer support|customer specialist|customer-first|client support|call center|contact center|help ?desk|retail|retailer|store associate|sales associate|cashier|front desk|dispatch|operations coordinator|operations specialist|used cars?|dealership)\b/i;

/**
 * Classify a job into one of the role categories from JD text (and optional role
 * title). More distinctive categories are checked first so a specialized role
 * is not swallowed by the broad customer-service bucket.
 */
export function detectRoleCategory(jd: string, roleTitle = ""): RoleCategory {
  const text = `${roleTitle}\n${jd}`;
  if (typeof text !== "string" || !text.trim()) return "general";

  if (TECHNICAL_AI_PRODUCT.test(text)) return "technical_ai_product";
  if (CUSTOMER_SUCCESS_SAAS.test(text)) return "customer_success_saas";
  if (ADMIN_CLAIMS_COMPLIANCE.test(text)) return "admin_claims_compliance_ops";
  if (CUSTOMER_SERVICE_RETAIL_OPS.test(text)) return "customer_service_retail_ops";
  return "general";
}

/** The emphasize/avoid guidance block for a role category. */
export function roleStyleGuidance(category: RoleCategory): string {
  switch (category) {
    case "customer_service_retail_ops":
      return `ROLE TYPE — customer service / retail / operations. EMPHASIZE (only what the resume supports): customer guidance, workflow ownership, documentation accuracy, follow-through, multitasking under volume, and process discipline. DO NOT claim direct product, sales, inventory, appraisal, repair, or retail-operations experience unless the resume explicitly supports it.`;
    case "customer_success_saas":
      return `ROLE TYPE — customer success / SaaS. EMPHASIZE (only what the resume supports): onboarding, stakeholder support, product guidance, retention-adjacent support, issue resolution, and CRM/workflow tools. DO NOT claim quota ownership, book-of-business ownership, renewals, or expansion targets unless the resume explicitly supports it.`;
    case "technical_ai_product":
      return `ROLE TYPE — technical / AI / product. EMPHASIZE (only what the resume supports): shipped product work, debugging, API integration, system architecture, production ownership, AI-assisted development, and reliability. DO NOT claim formal ML research, senior engineering leadership, enterprise scale, or people management unless the resume explicitly supports it.`;
    case "admin_claims_compliance_ops":
      return `ROLE TYPE — claims / admin / compliance / operations. EMPHASIZE (only what the resume supports): regulated workflows, case volume, documentation accuracy, SLA handling, escalation routing, and compliance judgment. DO NOT overstate leadership, legal authority, or adjudication scope beyond the resume evidence.`;
    default:
      return `ROLE TYPE — general. EMPHASIZE the candidate's strongest, most role-relevant, resume-supported strengths. DO NOT claim any domain-specific experience the resume does not explicitly support.`;
  }
}

/** Convenience: detect the category and return its guidance block in one call. */
export function buildRoleStyleBlock(jd: string, roleTitle = ""): string {
  return roleStyleGuidance(detectRoleCategory(jd, roleTitle));
}
