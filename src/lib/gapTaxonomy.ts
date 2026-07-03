/**
 * 4-way gap taxonomy — a *labeling* layer over the existing evidence classifier.
 *
 * This module NEVER touches scoring. It projects the already-computed evidence
 * signals (present / partial / missing, transferability, defensibility) plus a
 * light JD requirement-tier read into a human-facing gap label, so the Analyze
 * report is honest without being harsh:
 *
 *   1. Direct Gap      — not shown at all, JD appears to require it, not mainly
 *                        domain/tool-specific.
 *   2. Transferable Gap — related evidence exists; reframe in the JD's language.
 *   3. Preferred Gap    — employer prefers it; not core enough to disqualify.
 *   4. Domain Gap       — industry/product/tool-specific; viable if the role trains.
 *
 * Pure and dependency-free so it runs identically in the browser and in tests.
 */

import {
  canTechnicalSignalTransferFromResume,
  hasSupportedTechnicalPresence,
  isTechnicalHardSkillSignal,
} from "@signalyz/hiringReportIntegrity";

export type GapType = "direct" | "transferable" | "preferred" | "domain";

/** Whether the JD treats a signal as core, optional, or unclear. */
export type RequirementTier = "required" | "preferred" | "unknown";

/** 0–100 defensibility specificity below which a MISSING signal reads as domain/tool-specific. */
export const DOMAIN_SPECIFICITY_THRESHOLD = 30;

export const GAP_TYPE_LABEL: Record<GapType, string> = {
  direct: "Direct Gap",
  transferable: "Transferable Gap",
  preferred: "Preferred Gap",
  domain: "Domain Gap",
};

/** Honest-not-harsh guidance copy shown alongside each gap badge. */
export const GAP_TYPE_COPY: Record<GapType, string> = {
  direct:
    "Not shown in your resume. Don't claim this unless you have real experience.",
  transferable:
    "Related experience exists — the resume needs to frame it in this role's language.",
  preferred: "Helpful but not core. Mention only if you can support it.",
  domain:
    "Industry/product-specific gap. Emphasize learning speed and transferable fundamentals without faking expertise.",
};

const PREFERENCE_MARKERS = [
  "preferred",
  "nice to have",
  "nice-to-have",
  "a plus",
  "is a plus",
  "strong plus",
  "bonus",
  "ideally",
  "desired",
  "desirable",
  "advantageous",
  "would be great",
  "not required",
  "optional",
];

const REQUIREMENT_MARKERS = [
  "required",
  "must have",
  "must-have",
  "must possess",
  "minimum",
  "at least",
  "essential",
  "mandatory",
  "requirement",
];

// Tool / platform / industry / product markers. Presence in a signal means the
// gap is domain-or-tool-specific (i.e. trainable), not a generic capability gap.
const DOMAIN_TOOL_MARKERS = [
  // ERP / platforms / tooling
  "erp",
  "sap",
  "eclipse",
  "prophet 21",
  "prophet21",
  "epicor",
  "netsuite",
  "oracle",
  "salesforce",
  "gainsight",
  "servicetitan",
  "zendesk",
  "workday",
  "quickbooks",
  "tableau",
  "power bi",
  "powerbi",
  "looker",
  "ga4",
  "google analytics",
  "turbotax",
  "jira",
  "sql",
  // industries / product domains
  "electrical",
  "plumbing",
  "hvac",
  "mechanical",
  "industrial",
  "manufacturing",
  "distribution",
  "wholesale",
  "warehouse",
  "logistics",
  "supply chain",
  "construction",
  "automotive",
  "aerospace",
  "semiconductor",
  "pharmaceutical",
  "pharma",
  "biotech",
  "medical device",
  "healthcare",
  "clinical",
  "insurance",
  "mortgage",
  "legal",
  "oil",
  "gas",
  "energy",
  "telecom",
  "counter sales",
  "product knowledge",
];

// Sales / retail / outbound signals — generic customer support is NOT honest transfer.
const SALES_RETAIL_SIGNAL_PATTERN =
  /\b(counter sales|retail sales|inbound sales|outbound calls?|product sales|product selection|product recommendation|active selling|pricing|selling\b)/i;

// Order / billing workflows — case and dispute work can reframe honestly.
const ORDER_WORKFLOW_SIGNAL_PATTERN =
  /\b(order entry|order coordination|order maintenance|order and request|request coordination|credit and claims|billing disputes?|claims handling|expediting)\b/i;

// Product / industry knowledge — domain unless directly evidenced (present).
const PRODUCT_DOMAIN_SIGNAL_PATTERN =
  /\b(electrical product|product knowledge|industry knowledge|distribution knowledge|goods and services)\b/i;

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "your", "you", "our", "are",
  "was", "were", "have", "has", "had", "will", "can", "must", "should", "into",
  "through", "across", "over", "under", "about", "within", "between", "using",
  "their", "they", "them", "job", "role", "position", "experience", "ability",
  "skills", "skill", "work", "team", "teams", "strong", "of", "in", "to", "a", "an",
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsMarker(text: string, markers: string[]): boolean {
  const lower = text.toLowerCase();
  return markers.some((marker) => lower.includes(marker));
}

function significantTokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+(?:[+#/&-][a-z0-9]+)*/g) || []).filter(
    (token) => token.length >= 3 && !STOP_WORDS.has(token),
  );
}

/** True when the signal names a specific tool, platform, industry, or product domain. */
export function isDomainOrToolSpecificSignal(signal: string): boolean {
  const lower = signal.toLowerCase();
  if (PRODUCT_DOMAIN_SIGNAL_PATTERN.test(lower)) return true;
  return DOMAIN_TOOL_MARKERS.some((marker) =>
    new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(marker)}(?:[^a-z0-9]|$)`, "i").test(lower),
  );
}

/** Sales/retail/outbound — never transferable from generic customer support alone. */
export function isSalesRetailSignal(signal: string): boolean {
  return SALES_RETAIL_SIGNAL_PATTERN.test(signal.toLowerCase());
}

/** Order/billing/case workflows that can reframe from adjacent resume experience. */
export function isOrderWorkflowSignal(signal: string): boolean {
  return ORDER_WORKFLOW_SIGNAL_PATTERN.test(signal.toLowerCase());
}

/**
 * Read the JD to decide whether a signal is required, preferred, or unclear.
 *
 * We only inspect JD sentences that actually mention the signal (by phrase or by
 * majority token overlap). A preference marker in those sentences wins over a
 * requirement marker; with no markers we conservatively assume "required" so we
 * never soften a genuine miss into "preferred" without textual support. When the
 * JD is absent or the signal is not found at all, we return "unknown".
 */
export function detectRequirementTier(signal: string, jdText?: string | null): RequirementTier {
  if (!jdText || !jdText.trim() || !signal.trim()) return "unknown";

  const signalLower = signal.toLowerCase().trim();
  const tokens = significantTokens(signal);
  const sentences = jdText.split(/(?<=[.!?;:])\s+|\n+/);

  const relevant: string[] = [];
  for (const sentence of sentences) {
    const sentenceLower = sentence.toLowerCase();
    if (sentenceLower.includes(signalLower)) {
      relevant.push(sentence);
      continue;
    }
    if (tokens.length > 0) {
      const hits = tokens.filter((token) => sentenceLower.includes(token)).length;
      if (hits / tokens.length >= 0.5) relevant.push(sentence);
    }
  }

  if (relevant.length === 0) return "unknown";

  for (const sentence of relevant) {
    const hasPreference = containsMarker(sentence, PREFERENCE_MARKERS);
    const hasRequirement = containsMarker(sentence, REQUIREMENT_MARKERS);
    // A preference marker not overridden by a requirement marker in the same
    // sentence means the employer treats this as optional.
    if (hasPreference && !hasRequirement) return "preferred";
  }

  // Signal is discussed in the JD but nothing downgraded it → conservatively core.
  return "required";
}

export interface ClassifyGapTypeInput {
  signal: string;
  classification: "present" | "partial" | "missing";
  /** 0–1 transferability confidence from the evidence classifier (optional). */
  transferabilityConfidence?: number;
  /** 0–100 defensibility tool/domain specificity; LOW for unevidenced specific signals. */
  toolDomainSpecificity?: number;
  requirementTier?: RequirementTier;
  /** Resume corpus — enables technical hard-skill transfer guardrails. */
  resumeText?: string | null;
  jdText?: string | null;
}

export interface GapTypeResult {
  /** null when there is no gap (present/matched signal) — never show a scary label. */
  gap_type: GapType | null;
  gap_type_rationale: string;
}

/**
 * Project the evidence classification + requirement tier into a gap label.
 *
 * Precedence: matched → none; domain/product → domain; sales-retail partial/missing
 * → preferred/direct (never transferable from generic CS); order/billing partial →
 * transferable; other partial → transferable; preferred tier → preferred; else direct.
 */
export function classifyGapType(input: ClassifyGapTypeInput): GapTypeResult {
  if (input.classification === "present") {
    if (
      input.resumeText &&
      isTechnicalHardSkillSignal(input.signal) &&
      !hasSupportedTechnicalPresence(input.signal, input.resumeText)
    ) {
      return { gap_type: "direct", gap_type_rationale: GAP_TYPE_COPY.direct };
    }
    return { gap_type: null, gap_type_rationale: "" };
  }

  const tier = input.requirementTier ?? "unknown";
  const resumeText = input.resumeText ?? "";

  if (isTechnicalHardSkillSignal(input.signal)) {
    if (!canTechnicalSignalTransferFromResume(input.signal, resumeText)) {
      return { gap_type: "direct", gap_type_rationale: GAP_TYPE_COPY.direct };
    }
  }

  // Domain / product / tool knowledge — trainable gap; preferred tier softens the label.
  if (isDomainOrToolSpecificSignal(input.signal)) {
    if (tier === "preferred") {
      return { gap_type: "preferred", gap_type_rationale: GAP_TYPE_COPY.preferred };
    }
    return { gap_type: "domain", gap_type_rationale: GAP_TYPE_COPY.domain };
  }

  if (input.classification === "partial") {
    if (isTechnicalHardSkillSignal(input.signal) && !canTechnicalSignalTransferFromResume(input.signal, resumeText)) {
      return { gap_type: "direct", gap_type_rationale: GAP_TYPE_COPY.direct };
    }
    if (isSalesRetailSignal(input.signal)) {
      if (tier === "preferred") {
        return { gap_type: "preferred", gap_type_rationale: GAP_TYPE_COPY.preferred };
      }
      return { gap_type: "direct", gap_type_rationale: GAP_TYPE_COPY.direct };
    }
    if (isOrderWorkflowSignal(input.signal)) {
      return { gap_type: "transferable", gap_type_rationale: GAP_TYPE_COPY.transferable };
    }
    return { gap_type: "transferable", gap_type_rationale: GAP_TYPE_COPY.transferable };
  }

  // classification === "missing"
  if (tier === "preferred") {
    return { gap_type: "preferred", gap_type_rationale: GAP_TYPE_COPY.preferred };
  }

  const numericIndicatesSpecific =
    typeof input.toolDomainSpecificity === "number" &&
    input.toolDomainSpecificity > 0 &&
    input.toolDomainSpecificity < DOMAIN_SPECIFICITY_THRESHOLD;

  if (numericIndicatesSpecific) {
    return { gap_type: "domain", gap_type_rationale: GAP_TYPE_COPY.domain };
  }

  if (isSalesRetailSignal(input.signal)) {
    return { gap_type: "direct", gap_type_rationale: GAP_TYPE_COPY.direct };
  }

  return { gap_type: "direct", gap_type_rationale: GAP_TYPE_COPY.direct };
}
