/**
 * Phase 3E / 3G.2 — unsupported claim precision taxonomy.
 *
 * Only true_unsupported_claim with high/very_high confidence should drive unsafe / do_not_repair.
 */
import { phraseMatchesCorpus, isTransferableRewrite, normalizePhrase } from "./synonymGraph.ts";

export type UnsupportedClaimSubtype =
  | "true_unsupported_claim"
  | "synonym_gap"
  | "transferable_rewrite"
  | "role_language_rewrite"
  | "generic_business_phrase"
  | "parser_artifact"
  | "protected_claim_regression"
  | "unclear_needs_human_review";

const GENERIC_BUSINESS_TERMS = new Set([
  "primary",
  "ownership",
  "maintaining",
  "portfolio",
  "stakeholder",
  "stakeholders",
  "collaboration",
  "collaborative",
  "onboarding",
  "communication",
  "relationship",
  "relationships",
  "cross",
  "functional",
  "coordination",
  "documentation",
  "workflow",
  "workflows",
  "deliverables",
  "initiatives",
  "engagement",
  "engagements",
  "retention",
  "accounts",
  "clients",
  "customer",
  "customers",
  "success",
  "support",
  "service",
  "services",
  "operations",
  "process",
  "processes",
  "improved",
  "managed",
  "leading",
  "driving",
  "facilitation",
  "facilitated",
  "accuracy",
  "precision",
  "reliability",
  "quality",
  "caseload",
  "volume",
  "high-volume",
  "high volume",
  "throughput",
  "period",
]);

const METHODOLOGY_QUALITY_TERMS = new Set([
  "accuracy",
  "precision",
  "reliability",
  "quality",
  "caseload",
  "volume",
  "high-volume",
  "high volume",
  "throughput",
  "latency",
  "uptime",
  "monitoring",
  "scalability",
]);

const TRUE_UNSUPPORTED_SIGNALS =
  /revenue\s+forecast|enterprise\s+renewal|quota\s+attainment|forecasting|pipeline\s+generation|account\s+ownership|renewal\s+ownership|owned\s+revenue/i;

const LEADERSHIP_CLAIM_SIGNALS =
  /\b(led|managed|supervised|oversaw|directed)\s+(\d+\+?\s+)?(person\s+)?(team|engineers|people|staff|direct reports|technicians)\b/i;

const UNSUPPORTED_AI_ML_SIGNALS =
  /\b(llm|large language model|machine learning model|ml model|neural network|deep learning|rag pipeline|vector embedding|fine-tuned model|transformer model)\b/i;

const UNSUPPORTED_PLATFORM_SIGNALS =
  /\b(kubernetes|terraform|snowflake|databricks|servicenow|salesforce admin)\b/i;

const ROLE_LANGUAGE_SIGNALS =
  /customer|onboarding|retention|qbr|success|support|stakeholder|account|portfolio|ownership/i;

const HARD_BLOCKER_SUBTYPES = new Set<UnsupportedClaimSubtype>(["true_unsupported_claim"]);

const ADVISORY_SUBTYPES = new Set<UnsupportedClaimSubtype>([
  "generic_business_phrase",
  "role_language_rewrite",
  "transferable_rewrite",
  "synonym_gap",
  "parser_artifact",
  "unclear_needs_human_review",
]);

export type UnsupportedClaimRepairAction =
  | "do_not_repair"
  | "monitor_only"
  | "needs_human_review"
  | "safe_future_repair";

export function isGenericBusinessTerm(term: string): boolean {
  const norm = normalizePhrase(term).replace(/\.$/, "");
  if (GENERIC_BUSINESS_TERMS.has(norm)) return true;
  const first = norm.split(" ")[0] ?? norm;
  return norm.length <= 14 && GENERIC_BUSINESS_TERMS.has(first);
}

export function isEngineeringRole(targetRoleLabel?: string): boolean {
  const role = normalizePhrase(targetRoleLabel ?? "");
  return /engineer|developer|software|full stack|fullstack|ai|ml|technical|architect|platform/.test(role);
}

export function isNonTechnicalRole(targetRoleLabel?: string): boolean {
  const role = normalizePhrase(targetRoleLabel ?? "");
  return /dol|labor|customer service|account manager|care|healthcare|support representative|non-technical|administrative/.test(
    role,
  );
}

function majorityGeneric(terms: string[]): boolean {
  if (terms.length === 0) return false;
  const genericCount = terms.filter((t) => isGenericBusinessTerm(t)).length;
  return genericCount / terms.length >= 0.75;
}

function methodologyOrOpsTerms(terms: string[]): boolean {
  return terms.every(
    (t) =>
      METHODOLOGY_QUALITY_TERMS.has(normalizePhrase(t).replace(/\.$/, "")) ||
      isGenericBusinessTerm(t) ||
      isTransferableRewrite(t),
  );
}

function leadershipClaimWithoutSource(evidence: string, sourceCorpus: string): boolean {
  if (!LEADERSHIP_CLAIM_SIGNALS.test(evidence)) return false;
  const leadershipInSource =
    /\b(led|managed|supervised|oversaw|directed)\s+(\d+\+?\s+)?(team|engineers|people|staff)\b/i.test(
      sourceCorpus,
    );
  return !leadershipInSource;
}

function unsupportedAiClaimForRole(evidence: string, terms: string[], targetRoleLabel?: string): boolean {
  if (!isNonTechnicalRole(targetRoleLabel)) return false;
  return (
    UNSUPPORTED_AI_ML_SIGNALS.test(evidence) ||
    terms.some((t) => UNSUPPORTED_AI_ML_SIGNALS.test(normalizePhrase(t)))
  );
}

function unsupportedPlatformClaim(evidence: string, referenceCorpus: string, sourceCorpus: string): boolean {
  if (!UNSUPPORTED_PLATFORM_SIGNALS.test(evidence)) return false;
  const platformTerm = evidence.match(UNSUPPORTED_PLATFORM_SIGNALS)?.[0] ?? "";
  if (!platformTerm) return false;
  return (
    !phraseMatchesCorpus(platformTerm, referenceCorpus) && !phraseMatchesCorpus(platformTerm, sourceCorpus)
  );
}

export function classifyUnsupportedClaim(input: {
  ruleId: string;
  matchedTerms: string[];
  targetRoleLabel?: string;
  referenceCorpus: string;
  sourceCorpus: string;
  evidence?: string;
}): UnsupportedClaimSubtype {
  const terms = input.matchedTerms.map((t) => normalizePhrase(t).replace(/\.$/, ""));
  const evidence = normalizePhrase(input.evidence ?? "");
  const roleLabel = normalizePhrase(input.targetRoleLabel ?? "");

  if (input.ruleId === "hallucination.unsupported_metric") {
    const metric = terms[0] ?? "";
    if (input.sourceCorpus.includes(metric.replace(/[^\d]/g, ""))) return "synonym_gap";
    return "true_unsupported_claim";
  }

  if (TRUE_UNSUPPORTED_SIGNALS.test(evidence) || terms.some((t) => TRUE_UNSUPPORTED_SIGNALS.test(t))) {
    return "true_unsupported_claim";
  }

  if (leadershipClaimWithoutSource(evidence, input.sourceCorpus)) {
    return "true_unsupported_claim";
  }

  if (unsupportedAiClaimForRole(evidence, terms, input.targetRoleLabel)) {
    return "true_unsupported_claim";
  }

  if (unsupportedPlatformClaim(evidence, input.referenceCorpus, input.sourceCorpus)) {
    return "true_unsupported_claim";
  }

  if (terms.length > 0 && terms.every((t) => phraseMatchesCorpus(t, input.sourceCorpus))) {
    return "protected_claim_regression";
  }

  if (
    (roleLabel.includes("customer success") || roleLabel.includes("account manager")) &&
    (terms.some((t) => ROLE_LANGUAGE_SIGNALS.test(t)) || ROLE_LANGUAGE_SIGNALS.test(evidence))
  ) {
    return "role_language_rewrite";
  }

  if (majorityGeneric(terms)) {
    return "generic_business_phrase";
  }

  if (isEngineeringRole(input.targetRoleLabel) && methodologyOrOpsTerms(terms)) {
    return "transferable_rewrite";
  }

  if (terms.every((t) => isTransferableRewrite(t) || phraseMatchesCorpus(t, input.referenceCorpus))) {
    return "transferable_rewrite";
  }

  if (terms.some((t) => phraseMatchesCorpus(t, input.sourceCorpus))) {
    return "synonym_gap";
  }

  if (terms.some((t) => isGenericBusinessTerm(t))) {
    return "generic_business_phrase";
  }

  return "unclear_needs_human_review";
}

export function isHardBlockerUnsupportedClaimSubtype(
  subtype: UnsupportedClaimSubtype | string | undefined,
): boolean {
  return subtype != null && HARD_BLOCKER_SUBTYPES.has(subtype as UnsupportedClaimSubtype);
}

export function isAdvisoryUnsupportedClaimSubtype(subtype: UnsupportedClaimSubtype | string): boolean {
  return ADVISORY_SUBTYPES.has(subtype as UnsupportedClaimSubtype);
}

export function isUnsupportedClaimHardBlocker(input: {
  subtype?: string | null;
  confidence?: string | null;
  ruleId?: string | null;
}): boolean {
  const confidence = (input.confidence ?? "").toLowerCase();
  if (!["high", "very_high"].includes(confidence)) return false;

  const subtype = input.subtype as UnsupportedClaimSubtype | undefined;
  if (subtype && isAdvisoryUnsupportedClaimSubtype(subtype)) return false;
  if (isHardBlockerUnsupportedClaimSubtype(subtype)) return true;

  if (input.ruleId === "hallucination.unsupported_metric" && subtype !== "synonym_gap") {
    return true;
  }

  return false;
}

export function resolveUnsupportedClaimRepairAction(input: {
  subtype?: string | null;
  confidence?: string | null;
  bulletGuardVerified?: boolean;
}): UnsupportedClaimRepairAction {
  const subtype = (input.subtype ?? "") as UnsupportedClaimSubtype;

  if (isHardBlockerUnsupportedClaimSubtype(subtype)) {
    return "do_not_repair";
  }

  if (subtype === "protected_claim_regression" && input.bulletGuardVerified) {
    return "safe_future_repair";
  }

  if (
    subtype === "role_language_rewrite" ||
    subtype === "generic_business_phrase" ||
    subtype === "transferable_rewrite" ||
    subtype === "parser_artifact"
  ) {
    return "monitor_only";
  }

  if (subtype === "synonym_gap") {
    const conf = (input.confidence ?? "").toLowerCase();
    return conf === "high" || conf === "very_high" ? "needs_human_review" : "monitor_only";
  }

  if (subtype === "unclear_needs_human_review") {
    return "needs_human_review";
  }

  if (subtype === "protected_claim_regression") {
    return "needs_human_review";
  }

  return "monitor_only";
}
