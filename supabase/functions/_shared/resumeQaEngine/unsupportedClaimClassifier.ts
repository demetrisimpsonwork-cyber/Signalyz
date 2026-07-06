/**
 * Phase 3E — unsupported claim precision taxonomy.
 *
 * Production CS false positive: hallucination.untracked_terms fires on generic rewrite
 * vocabulary ("primary", "ownership", "maintaining", "portfolio") — role-language, not
 * unsupported claims.
 */
import { phraseMatchesCorpus, isTransferableRewrite, normalizePhrase } from "./synonymGraph.ts";

export type UnsupportedClaimSubtype =
  | "true_unsupported_claim"
  | "synonym_gap"
  | "transferable_rewrite"
  | "role_language_rewrite"
  | "generic_business_phrase"
  | "parser_artifact";

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
]);

const TRUE_UNSUPPORTED_SIGNALS =
  /revenue\s+forecast|enterprise\s+renewal|quota\s+attainment|forecasting|pipeline\s+generation/i;

const ROLE_LANGUAGE_SIGNALS =
  /customer|onboarding|retention|qbr|success|support|stakeholder|account|portfolio|ownership/i;

export function isGenericBusinessTerm(term: string): boolean {
  const norm = normalizePhrase(term).replace(/\.$/, "");
  if (GENERIC_BUSINESS_TERMS.has(norm)) return true;
  return norm.length <= 12 && GENERIC_BUSINESS_TERMS.has(norm.split(" ")[0] ?? norm);
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

  if (input.ruleId === "hallucination.unsupported_metric") {
    const metric = terms[0] ?? "";
    if (input.sourceCorpus.includes(metric.replace(/[^\d]/g, ""))) return "synonym_gap";
    return "true_unsupported_claim";
  }

  const evidence = normalizePhrase(input.evidence ?? "");
  if (TRUE_UNSUPPORTED_SIGNALS.test(evidence) || terms.some((t) => TRUE_UNSUPPORTED_SIGNALS.test(t))) {
    return "true_unsupported_claim";
  }

  if (terms.length > 0 && terms.every((t) => isGenericBusinessTerm(t))) {
    return "generic_business_phrase";
  }

  const roleLabel = normalizePhrase(input.targetRoleLabel ?? "");
  if (
    (roleLabel.includes("customer success") || roleLabel.includes("account manager")) &&
    (terms.some((t) => ROLE_LANGUAGE_SIGNALS.test(t)) || ROLE_LANGUAGE_SIGNALS.test(evidence))
  ) {
    return "role_language_rewrite";
  }

  if (terms.every((t) => isTransferableRewrite(t) || phraseMatchesCorpus(t, input.referenceCorpus))) {
    return "transferable_rewrite";
  }

  if (terms.some((t) => phraseMatchesCorpus(t, input.sourceCorpus))) {
    return "synonym_gap";
  }

  return "true_unsupported_claim";
}

export function isAdvisoryUnsupportedClaimSubtype(subtype: UnsupportedClaimSubtype): boolean {
  return (
    subtype === "generic_business_phrase" ||
    subtype === "role_language_rewrite" ||
    subtype === "transferable_rewrite" ||
    subtype === "synonym_gap" ||
    subtype === "parser_artifact"
  );
}
