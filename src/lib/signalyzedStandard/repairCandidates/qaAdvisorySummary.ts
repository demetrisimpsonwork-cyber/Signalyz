import type { QaShadowSummary } from "../types.ts";

export const REPAIR_QA_ADVISORY_VERSION = "1.0";

/** Taxonomy-safe keyword classes — no user-specific terms. */
export type TaxonomyKeywordClass =
  | "technical_tool"
  | "methodology"
  | "platform"
  | "role_keyword"
  | "business_process";

export const ADVISORY_UNSUPPORTED_CLAIM_SUBTYPES = new Set([
  "generic_business_phrase",
  "role_language_rewrite",
  "transferable_rewrite",
  "synonym_gap",
  "parser_artifact",
  "protected_claim_regression",
  "unclear_needs_human_review",
]);

export interface QaAdvisorySummary {
  keyword_loss_count: number;
  lost_keyword_types: TaxonomyKeywordClass[];
  unsupported_claim_count: number;
  unsupported_claim_subtypes: string[];
  advisory_warning_count: number;
  bullet_regression_count: number;
  identity_drift_subtypes: string[];
}

function ruleIdToKeywordType(ruleId: string): TaxonomyKeywordClass {
  if (ruleId.includes("methodology")) return "methodology";
  if (ruleId.includes("platform")) return "platform";
  if (ruleId.includes("role") || ruleId.includes("jd_keyword")) return "role_keyword";
  if (ruleId.includes("business") || ruleId.includes("process")) return "business_process";
  if (ruleId.startsWith("keyword_preservation.")) return "technical_tool";
  return "technical_tool";
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/** Build sanitized QA advisory metadata — no raw keywords or resume text. */
export function buildQaAdvisorySummary(qa?: QaShadowSummary | null): QaAdvisorySummary | null {
  if (!qa) return null;

  const issueLogs = qa.issue_logs ?? [];
  const keywordLossIssues = issueLogs.filter((i) => i.code === "keyword_loss");
  const keyword_loss_count =
    qa.issue_categories?.keyword_loss ??
    keywordLossIssues.length;

  const lost_keyword_types = unique(
    keywordLossIssues.map((i) => ruleIdToKeywordType(i.rule_id)),
  );

  const unsupportedIssues = issueLogs.filter((i) => i.code === "unsupported_claim");
  const unsupported_claim_count =
    qa.issue_categories?.unsupported_claim ?? unsupportedIssues.length;

  const unsupported_claim_subtypes = unique(
    unsupportedIssues
      .map((i) => i.unsupported_claim_subtype)
      .filter((s): s is string => typeof s === "string" && s.length > 0),
  );

  const bullet_regression_count =
    qa.issue_categories?.bullet_regression ??
    issueLogs.filter((i) => i.code === "bullet_regression").length;

  const identity_drift_subtypes = unique(
    issueLogs
      .filter((i) => i.code.startsWith("identity_drift"))
      .map((i) => i.identity_drift_subtype)
      .filter((s): s is string => typeof s === "string" && s.length > 0),
  );

  const advisory_warning_count =
    (qa.warning_count ?? 0) +
    issueLogs.filter(
      (i) =>
        i.severity === "low" ||
        i.severity === "medium" ||
        i.code === "keyword_loss" ||
        i.code === "formatting_duplicate_bullets",
    ).length;

  return {
    keyword_loss_count,
    lost_keyword_types,
    unsupported_claim_count,
    unsupported_claim_subtypes,
    advisory_warning_count,
    bullet_regression_count,
    identity_drift_subtypes,
  };
}

export function hasKeywordLossSignals(advisory?: QaAdvisorySummary | null): boolean {
  if (!advisory) return false;
  return advisory.keyword_loss_count > 0 || advisory.lost_keyword_types.length > 0;
}

export function hasTrueUnsupportedClaimSubtype(advisory?: QaAdvisorySummary | null): boolean {
  if (!advisory?.unsupported_claim_subtypes.length) return false;
  return advisory.unsupported_claim_subtypes.some(
    (s) => !ADVISORY_UNSUPPORTED_CLAIM_SUBTYPES.has(s),
  );
}
