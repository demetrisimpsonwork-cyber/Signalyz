/**
 * coverLetterRoleStyle — role-aware cover-letter guidance.
 *
 * Pure: (jd, roleTitle) → a role category, and category → a guidance block that
 * tells the model which resume-supported strengths to emphasize and which
 * domain claims to avoid. No Deno/Node APIs, so it is importable from both the
 * edge function and vitest.
 */

export type RoleCategory =
  | "customer_service_retail_ops"
  | "customer_success_saas"
  | "technical_ai_product"
  | "admin_claims_compliance_ops"
  | "general";

const TECHNICAL_AI_PRODUCT =
  /\b(?:staff|senior|principal|lead)\s+(?:ai|ml|machine learning|software|platform|data)\s+(?:engineer|architect|scientist)|software engineer|developer|full[-\s]?stack|back[-\s]?end|front[-\s]?end|web developer|ai engineer|ml engineer|data engineer|devops|site reliability|product manager|agentic|llm|rag|retrieval|vector search|embeddings?|computer vision|production ml|machine learning infrastructure|api integration|programming|codebase|deployment|system architecture|microservices\b/i;

const CUSTOMER_SUCCESS_SAAS =
  /\b(customer success|csm|client success|onboarding specialist|renewals?|churn|book of business|saas|account manager|quarterly business review|qbr|net revenue retention|retention|upsell|expansion|gainsight)\b/i;

const ADMIN_CLAIMS_COMPLIANCE =
  /\b(claims?|adjudicat\w*|compliance|regulatory|underwrit\w*|case management|benefits administration|policy administration|audit\w*|dispute resolution|fraud review|eligibility determination)\b/i;

const CUSTOMER_SERVICE_RETAIL_OPS =
  /\b(customer service|customer support|customer specialist|customer-first|client support|call center|contact center|help ?desk|retail|retailer|store associate|sales associate|cashier|front desk|dispatch|operations coordinator|operations specialist|used cars?|dealership)\b/i;

const SEVERE_TECHNICAL_GAP =
  /\b(staff|senior|principal)\s+(?:ai|ml|machine learning|software|platform|data)\s+(?:engineer|architect|scientist)|production ml|production machine learning|agentic ai|llm pipelines?|vector search|computer vision|ph\.?d\.?|m\.?s\.?\s+(?:in|degree|preferred)|technical leadership|managing engineers|people management|aerial imagery|geospatial|computer-vision systems?\b/i;

/** Resume markers for shipped technical / AI product evidence. */
const TECHNICAL_RESUME_MARKERS: { label: string; rx: RegExp }[] = [
  { label: "Signalyz", rx: /\bsignalyz\b/i },
  { label: "AI SaaS", rx: /\bai[-\s]?(?:powered|saas|platform)\b/i },
  { label: "Anthropic/Claude", rx: /\b(?:anthropic|claude)\b/i },
  { label: "Supabase", rx: /\bsupabase\b/i },
  { label: "PostgreSQL", rx: /\bpostgres(?:ql)?\b/i },
  { label: "Edge Functions", rx: /\bedge functions?\b/i },
  { label: "RAG", rx: /\brag\b|\bretrieval[-\s]augmented\b/i },
  { label: "embeddings", rx: /\bembeddings?\b/i },
  { label: "vector search", rx: /\bvector search\b/i },
  { label: "production debugging", rx: /\bproduction debug|debugging production\b/i },
  { label: "API integration", rx: /\bapi integration\b/i },
];

const TECHNICAL_LETTER_MARKERS =
  /\b(signalyz|ai saas|ai-powered|anthropic|claude|supabase|postgres|edge functions?|rag|embeddings?|vector search|api integration|production debug|independent project)\b/i;

const NJDOL_CENTERPIECE =
  /\b(new jersey department of labor|njdol|department of labor)\b/i;

/**
 * Classify a job into one of the role categories from JD text (and optional role
 * title). More distinctive categories are checked first.
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

/** True when the JD asks for senior/staff ML/AI credentials the resume may not support. */
export function detectSevereTechnicalGap(jd: string, roleTitle = ""): boolean {
  const text = `${roleTitle}\n${jd}`;
  return typeof text === "string" && SEVERE_TECHNICAL_GAP.test(text);
}

/** Which technical resume evidence markers appear in the resume text. */
export function detectTechnicalResumeEvidence(resumeText: string): string[] {
  if (typeof resumeText !== "string" || !resumeText.trim()) return [];
  return TECHNICAL_RESUME_MARKERS
    .filter(({ rx }) => rx.test(resumeText))
    .map(({ label }) => label);
}

/** True when a technical-role letter centers NJDOL but ignores resume technical evidence. */
export function letterUnderusesTechnicalEvidence(
  letterText: string,
  resumeText: string,
  roleCategory: RoleCategory,
): boolean {
  if (roleCategory !== "technical_ai_product") return false;
  const resumeMarkers = detectTechnicalResumeEvidence(resumeText);
  if (resumeMarkers.length === 0) return false;
  if (TECHNICAL_LETTER_MARKERS.test(letterText)) return false;

  const firstBlock = letterText.split(/\n{2,}/).slice(0, 2).join("\n");
  return NJDOL_CENTERPIECE.test(firstBlock);
}

/** Prompt block listing resume-supported technical evidence to prioritize. */
export function buildTechnicalEvidencePriorityBlock(resumeText: string): string {
  const markers = detectTechnicalResumeEvidence(resumeText);
  if (!markers.length) return "";
  return `TECHNICAL EVIDENCE PRIORITY — the resume contains project/technical evidence (${markers.join(", ")}). For this technical/AI role, lead with that shipped product or project work in P1 and P2. Use casework or operations roles (e.g. NJDOL) only as supporting proof for reliability, troubleshooting, or regulated workflows — never as the main centerpiece when technical project evidence exists.`;
}

/** Prompt block for Staff/senior ML/AI roles where the resume does not fully match. */
export function buildSevereGapRealismBlock(jd: string, roleTitle = ""): string {
  if (!detectSevereTechnicalGap(jd, roleTitle)) return "";
  return `SEVERE ROLE-GAP REALISM — this JD asks for Staff/senior production ML, agentic AI, RAG, vector search, computer vision, PhD/MS, or technical leadership. If the resume does NOT directly support those, do NOT imply a conventional fit. Use ONE plain severe-gap sentence such as "I am not the conventional Staff AI profile" or "I have not shipped production ML infrastructure or computer-vision systems" or "I have not built agentic AI frameworks or LLM pipelines." Then bridge with adjacent, resume-supported strengths only ("What I can credibly bring is...", "My strongest relevant work is...", "If the team is open to an implementation-focused builder with adjacent AI product experience..."). Do not over-apologize, repeat the gap, or write a rejection letter.`;
}

/** The emphasize/avoid guidance block for a role category. */
export function roleStyleGuidance(category: RoleCategory): string {
  switch (category) {
    case "customer_service_retail_ops":
      return `ROLE TYPE — customer service / retail / operations. EMPHASIZE (only what the resume supports): customer guidance, workflow ownership, documentation accuracy, follow-through, multitasking under volume, and process discipline. DO NOT claim direct product, sales, inventory, appraisal, repair, or retail-operations experience unless the resume explicitly supports it.`;
    case "customer_success_saas":
      return `ROLE TYPE — customer success / SaaS. EMPHASIZE (only what the resume supports): onboarding, stakeholder support, product guidance, retention-adjacent support, issue resolution, and CRM/workflow tools. DO NOT claim quota ownership, book-of-business ownership, renewals, or expansion targets unless the resume explicitly supports it.`;
    case "technical_ai_product":
      return `ROLE TYPE — technical / AI / product. EMPHASIZE (only what the resume supports): shipped AI/product work, production debugging, API integration (e.g. Claude/Anthropic), Supabase/PostgreSQL/Edge Functions, reliability/output quality, evaluation, exports, auth/Stripe if resume-supported, RAG/embeddings/vector search ONLY if resume-supported. DO NOT claim production ML infrastructure, computer vision, PhD/MS, formal ML research, senior engineering leadership, managing engineers, enterprise-scale ownership, shipped agentic frameworks, shipped LLM pipelines, geospatial/aerial imagery, or repair-order/inventory experience unless the resume explicitly supports it. Write like a builder with real AI product evidence — not a claims specialist trying to sound technical.`;
    case "admin_claims_compliance_ops":
      return `ROLE TYPE — claims / admin / compliance / operations. EMPHASIZE (only what the resume supports): regulated workflows, case volume, documentation accuracy, SLA handling, escalation routing, and compliance judgment. Do NOT overstate leadership, legal authority, or adjudication scope beyond the resume evidence.`;
    default:
      return `ROLE TYPE — general. EMPHASIZE the candidate's strongest, most role-relevant, resume-supported strengths. DO NOT claim any domain-specific experience the resume does not explicitly support.`;
  }
}

/** Technical-role letter structure (4 paragraphs, evidence-first). */
export function technicalRoleStructureBlock(): string {
  return `STRUCTURE — technical/AI role, exactly 4 concise paragraphs:
P1 — PLAIN OPENING: Tie to the technical role using the strongest resume-supported technical/project evidence (not casework alone).
P2 — ONE TECHNICAL STORY: One concrete project or shipped product example — what you built, debugged, integrated, or kept reliable.
P3 — SEVERE GAP + BRIDGE (if needed): One honest severe-gap sentence if the JD outranks the resume, then bridge to adjacent supported strengths.
P4 — COMPANY CLOSE: Company-specific motivation and a plain professional next step.`;
}

/** Convenience: detect the category and return its guidance block in one call. */
export function buildRoleStyleBlock(jd: string, roleTitle = ""): string {
  return roleStyleGuidance(detectRoleCategory(jd, roleTitle));
}
