import { extractMetrics, extractToolMentions } from "@signalyz/groundedCalibration";
import type { GroundedRecommendationClassification } from "@/lib/groundedRecommendationTypes";
import {
  PARTIAL_OVERLAP_THRESHOLD,
  PRESENT_OVERLAP_THRESHOLD,
  TRANSFERABILITY_CONFIDENCE_THRESHOLD,
} from "@/lib/groundedRecommendationTypes";

export interface DefensibilityFactors {
  evidence_directness: number;
  translation_distance: number;
  tool_domain_specificity: number;
  follow_up_defensibility: number;
}

export type DefensibilityGateId =
  | "strict_tool_missing"
  | "domain_expertise_missing"
  | "tax_filing_present_blocked"
  | "channel_missing"
  | "metrics_missing"
  | "present_blocked_adjacency"
  | "present_blocked_translation";

export interface DefensibilityHardGate {
  id: DefensibilityGateId;
  forced_missing: boolean;
  present_blocked: boolean;
  score_cap: number;
}

export interface DefensibilityClassificationResult {
  classification: GroundedRecommendationClassification;
  raw_score: number;
  final_score: number;
  factors: DefensibilityFactors;
  gates: DefensibilityHardGate[];
  max_tier: "present" | "partial";
}

export interface DefensibilityInput {
  signal: string;
  evidenceCorpus: string;
  primaryEvidenceText: string;
  overlap: number;
  similarity: number;
  transferability: number;
  contactCenterTransfer: number;
  hasRetrievedEvidence: boolean;
}

const FORCED_MISSING_CAP = 49;
const PARTIAL_ADJACENCY_CAP = 75;
const PRESENT_THRESHOLD = 85;
const PARTIAL_THRESHOLD = 50;
const PRESENT_MIN_DIRECTNESS = 80;
const PRESENT_MIN_TRANSLATION = 80;

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "your", "you", "our", "are", "was", "were",
  "have", "has", "had", "will", "can", "must", "should", "into", "through", "across", "over", "under",
  "about", "within", "between", "using", "their", "they", "them", "job", "role", "position", "experience",
  "ability", "skills", "skill", "work", "team", "teams", "customer", "customers", "service", "strong",
  "demonstrate", "demonstrates", "signal", "signals", "management", "level", "operations",
]);

const GENERIC_SIGNAL_TOKENS = new Set([
  "management",
  "support",
  "customer",
  "customers",
  "service",
  "experience",
  "operations",
  "specialist",
  "handling",
  "driven",
]);

const STRICT_TOOL_TOKENS = [
  "ga4",
  "google analytics",
  "servicetitan",
  "service titan",
  "gainsight",
  "churnzero",
  "churn zero",
  "looker",
  "tableau",
  "power bi",
  "powerbi",
  "turbotax",
  "zendesk",
  "erp",
  "warehouse",
  "logistics",
  "distribution",
];

const CHANNEL_SIGNAL_PATTERN =
  /\b(chat support|live chat|messaging support|chat-based|in-app chat|email support channel)\b/i;

const METRICS_SIGNAL_PATTERN =
  /\b(csat|nps|customer satisfaction|satisfaction score|metrics-driven|kpi-driven)\b/i;

const SUPPORT_OPS_SIGNAL_PATTERN =
  /\b(contact center|call center|inbound (call center|inquiry|inquiries|phone)|phone support|high-volume inbound|customer intake|ticket routing|queue management)\b/i;

const CALL_CENTER_SIGNAL_PATTERN =
  /\b(contact center|call center|inbound call center|inbound inquiry|inbound inquiries|phone support|high-volume inbound)\b/i;

const DIRECT_CALL_CENTER_EVIDENCE_PATTERN = /\b(call center|contact center)\b/i;

const CHANNEL_EVIDENCE_MARKERS = [
  "chat",
  "live chat",
  "messaging",
  "email",
  "slack",
  "written",
  "ticket",
  "zendesk",
  "intercom",
  "in-app",
];

const CALL_CENTER_EVIDENCE_MARKERS = [
  "inbound",
  "outbound",
  "call queue",
  "call queues",
  "high-volume",
  "distressed caller",
  "distressed callers",
  "first-call",
  "first contact",
  "intake",
  "escalation",
  "triage",
  "call center",
  "contact center",
];

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+(?:[+#/&-][a-z0-9]+)*/g) || [];
}

function normalizeCompact(text: string): string {
  return text.toLowerCase().replace(/[\s_-]+/g, "");
}

function tokenStemMatch(a: string, b: string): boolean {
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const stemLen = Math.min(5, Math.min(a.length, b.length));
  if (stemLen < 3) return false;
  return a.slice(0, stemLen) === b.slice(0, stemLen);
}

function evidenceContainsToken(evidenceText: string, token: string): boolean {
  const lower = evidenceText.toLowerCase();
  const compact = normalizeCompact(evidenceText);
  const normalizedToken = normalizeCompact(token);
  if (compact.includes(normalizedToken)) return true;
  const evidenceTokens = tokenize(evidenceText);
  return evidenceTokens.some((evidenceToken) => tokenStemMatch(token, evidenceToken));
}

function evidenceContainsPhrase(evidenceText: string, pattern: RegExp): boolean {
  return pattern.test(evidenceText.toLowerCase());
}

function strictToolPhraseMatches(text: string, tool: string): boolean {
  const escaped = tool.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s_-]*");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, "i").test(text);
}

function getStrictToolInSignal(signal: string): string | null {
  const lower = signal.toLowerCase();
  for (const tool of STRICT_TOOL_TOKENS) {
    if (strictToolPhraseMatches(lower, tool)) return tool;
  }
  return null;
}

function isStrictToolSignal(signal: string): boolean {
  return getStrictToolInSignal(signal) !== null;
}

function strictToolEvidentInCorpus(evidenceCorpus: string, tool: string): boolean {
  const normalizedEvidence = normalizeCompact(evidenceCorpus);
  const normalizedTool = normalizeCompact(tool);
  if (!normalizedTool) return false;
  return normalizedEvidence.includes(normalizedTool);
}

function namedToolSignalDirectlyEvident(signal: string, evidenceCorpus: string): boolean {
  const tools = extractToolMentions(signal);
  if (tools.length === 0) return false;
  const signalLower = signal.toLowerCase().trim();
  if (tools.length === 1 && signalLower === tools[0]) {
    return strictToolEvidentInCorpus(evidenceCorpus, tools[0]);
  }
  return tools.every((tool) => strictToolEvidentInCorpus(evidenceCorpus, tool));
}

function strictToolDirectlyEvident(signal: string, evidenceCorpus: string): boolean {
  const tool = getStrictToolInSignal(signal);
  if (tool) return strictToolEvidentInCorpus(evidenceCorpus, tool);
  return namedToolSignalDirectlyEvident(signal, evidenceCorpus);
}

function isSupportFramedSignal(signal: string): boolean {
  const lower = signal.toLowerCase();
  return /customer support|user support|support experience|workflow customer|filing workflow.*support|tax software.*support/i.test(
    lower,
  );
}

/** Tax filing / operations signals — including support-framed variants. */
export function isTaxFilingDomainSignal(signal: string): boolean {
  const lower = signal.toLowerCase();
  return (
    /\btax filing\b/i.test(lower) ||
    /\btax operations\b/i.test(lower) ||
    (/\bfiling\b/i.test(lower) && /\bworkflow\b/i.test(lower) && /\btax\b/i.test(lower))
  );
}

function taxFilingDirectlyEvident(evidenceCorpus: string): boolean {
  return (
    evidenceContainsToken(evidenceCorpus, "tax") && evidenceContainsToken(evidenceCorpus, "filing")
  );
}

function hasTaxFilingSupportAdjacency(signal: string, evidenceCorpus: string): boolean {
  if (!isTaxFilingDomainSignal(signal)) return false;
  const supportFramed = isSupportFramedSignal(signal) || /\bsupport\b/i.test(signal);
  if (!supportFramed && !hasSupportOpsAdjacency(evidenceCorpus)) return false;
  return hasSupportOpsAdjacency(evidenceCorpus) || supportFramed;
}

export function isChatSupportSignal(signal: string): boolean {
  const lower = signal.toLowerCase();
  if (CHANNEL_SIGNAL_PATTERN.test(lower)) return true;
  return /\bchat\b/i.test(lower) && /\b(support|messaging|live)\b/i.test(lower);
}

export function isDomainExpertiseSignal(signal: string): boolean {
  const lower = signal.toLowerCase().trim();
  if (isSupportFramedSignal(lower)) return false;
  if (isTaxFilingDomainSignal(lower)) return false;
  if (/\btax preparation\b/i.test(lower)) return true;
  if (/no demonstrated.*tax software/i.test(lower)) return true;
  if (/tax season\b/i.test(lower) && !/support/i.test(lower)) return true;
  if (
    /\btax software\b/i.test(lower) &&
    !/customer support|user support|support experience|workflow customer/i.test(lower)
  ) {
    return true;
  }
  return false;
}

function domainExpertiseDirectlyEvident(signal: string, evidenceCorpus: string): boolean {
  const lower = signal.toLowerCase();
  if (/\btax preparation\b/i.test(lower)) {
    return evidenceContainsToken(evidenceCorpus, "tax") && /prepar/i.test(evidenceCorpus);
  }
  if (/\btax filing\b/i.test(lower)) {
    return evidenceContainsToken(evidenceCorpus, "tax") && evidenceContainsToken(evidenceCorpus, "filing");
  }
  if (/\btax software\b/i.test(lower)) {
    return evidenceContainsToken(evidenceCorpus, "tax") && evidenceContainsToken(evidenceCorpus, "software");
  }
  if (/tax season\b/i.test(lower)) {
    return evidenceContainsToken(evidenceCorpus, "tax") && evidenceContainsToken(evidenceCorpus, "season");
  }
  if (/no demonstrated.*tax software/i.test(lower)) {
    return (
      evidenceContainsToken(evidenceCorpus, "tax") &&
      (evidenceContainsToken(evidenceCorpus, "software") || evidenceContainsToken(evidenceCorpus, "filing"))
    );
  }
  return false;
}

export function isChannelSignal(signal: string): boolean {
  return isChatSupportSignal(signal);
}

function channelDirectlyEvident(evidenceCorpus: string): boolean {
  const lower = evidenceCorpus.toLowerCase();
  return CHANNEL_EVIDENCE_MARKERS.some((marker) => lower.includes(marker));
}

export function isMetricsSignal(signal: string): boolean {
  return METRICS_SIGNAL_PATTERN.test(signal.toLowerCase());
}

function metricsDirectlyEvident(signal: string, evidenceCorpus: string): boolean {
  const lowerSignal = signal.toLowerCase();
  if (/csat/i.test(lowerSignal) && evidenceContainsToken(evidenceCorpus, "csat")) return true;
  if (/nps/i.test(lowerSignal) && evidenceContainsToken(evidenceCorpus, "nps")) return true;
  if (/satisfaction/i.test(lowerSignal) && /satisf/i.test(evidenceCorpus)) return true;
  const metricsInEvidence = extractMetrics(evidenceCorpus);
  if (metricsInEvidence.length > 0 && /metric|kpi|score/i.test(lowerSignal)) return true;
  return false;
}

export function isSupportOpsSignal(signal: string): boolean {
  if (
    isDomainExpertiseSignal(signal) ||
    isTaxFilingDomainSignal(signal) ||
    isStrictToolSignal(signal) ||
    isChatSupportSignal(signal)
  ) {
    return false;
  }
  return SUPPORT_OPS_SIGNAL_PATTERN.test(signal.toLowerCase());
}

function countPresentTokenMatches(signal: string, evidenceText: string): number {
  const signalTokens = tokenize(signal).filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
  const evidenceTokens = tokenize(evidenceText);
  let matches = 0;
  for (const signalToken of signalTokens) {
    if (evidenceTokens.some((evidenceToken) => tokenStemMatch(signalToken, evidenceToken))) {
      matches++;
    }
  }
  return matches;
}

function hasSupportOpsAdjacency(evidenceCorpus: string): boolean {
  const lower = evidenceCorpus.toLowerCase();
  return CALL_CENTER_EVIDENCE_MARKERS.some((marker) => lower.includes(marker));
}

/** Phase A — hard gates; cannot be overridden by score. */
export function evaluateHardGates(signal: string, evidenceCorpus: string): DefensibilityHardGate[] {
  const gates: DefensibilityHardGate[] = [];

  if (isStrictToolSignal(signal) && !strictToolDirectlyEvident(signal, evidenceCorpus)) {
    gates.push({
      id: "strict_tool_missing",
      forced_missing: true,
      present_blocked: true,
      score_cap: FORCED_MISSING_CAP,
    });
    return gates;
  }

  if (isTaxFilingDomainSignal(signal) && !taxFilingDirectlyEvident(evidenceCorpus)) {
    gates.push({
      id: "tax_filing_present_blocked",
      forced_missing: false,
      present_blocked: true,
      score_cap: PARTIAL_ADJACENCY_CAP,
    });
    if (!hasTaxFilingSupportAdjacency(signal, evidenceCorpus)) {
      gates.push({
        id: "domain_expertise_missing",
        forced_missing: true,
        present_blocked: true,
        score_cap: FORCED_MISSING_CAP,
      });
      return gates;
    }
  }

  if (isDomainExpertiseSignal(signal) && !domainExpertiseDirectlyEvident(signal, evidenceCorpus)) {
    gates.push({
      id: "domain_expertise_missing",
      forced_missing: true,
      present_blocked: true,
      score_cap: FORCED_MISSING_CAP,
    });
    return gates;
  }

  if (isChatSupportSignal(signal) && !channelDirectlyEvident(evidenceCorpus)) {
    gates.push({
      id: "channel_missing",
      forced_missing: true,
      present_blocked: true,
      score_cap: FORCED_MISSING_CAP,
    });
    return gates;
  }

  if (isMetricsSignal(signal) && !metricsDirectlyEvident(signal, evidenceCorpus)) {
    gates.push({
      id: "metrics_missing",
      forced_missing: true,
      present_blocked: true,
      score_cap: FORCED_MISSING_CAP,
    });
    return gates;
  }

  if (CALL_CENTER_SIGNAL_PATTERN.test(signal.toLowerCase())) {
    if (!DIRECT_CALL_CENTER_EVIDENCE_PATTERN.test(evidenceCorpus.toLowerCase())) {
      gates.push({
        id: "present_blocked_adjacency",
        forced_missing: false,
        present_blocked: true,
        score_cap: PARTIAL_ADJACENCY_CAP,
      });
    }
  }

  return gates;
}

function computeTranslationDistance(signal: string, evidenceCorpus: string): number {
  const lowerSignal = signal.toLowerCase();

  if (/first[- ]?contact/i.test(lowerSignal)) {
    if (evidenceContainsPhrase(evidenceCorpus, /\bfirst[- ]contact\b/i)) return 95;
    if (evidenceContainsPhrase(evidenceCorpus, /\bfirst[- ]call\b/i)) return 52;
    return 32;
  }

  if (/first[- ]?call/i.test(lowerSignal)) {
    if (evidenceContainsPhrase(evidenceCorpus, /\bfirst[- ]call\b/i)) return 95;
    if (evidenceContainsPhrase(evidenceCorpus, /\bfirst[- ]contact\b/i)) return 52;
    return 35;
  }

  if (/escalation/i.test(lowerSignal) && /escalation/i.test(evidenceCorpus)) {
    if (/manag/i.test(lowerSignal) && /manag/i.test(evidenceCorpus)) return 92;
    return 88;
  }

  if (namedToolSignalDirectlyEvident(signal, evidenceCorpus)) return 98;

  const strictTool = getStrictToolInSignal(signal);
  if (strictTool && strictToolDirectlyEvident(signal, evidenceCorpus)) return 98;

  const coreTokens = tokenize(signal).filter(
    (token) => token.length >= 3 && !STOP_WORDS.has(token) && !GENERIC_SIGNAL_TOKENS.has(token),
  );
  if (coreTokens.length === 0) {
    if (isSupportOpsSignal(signal) && hasSupportOpsAdjacency(evidenceCorpus)) return 65;
    return 45;
  }

  const matched = coreTokens.filter((token) => evidenceContainsToken(evidenceCorpus, token)).length;
  const ratio = matched / coreTokens.length;
  if (ratio >= 0.8) return 95;
  if (ratio >= 0.5) return 72;
  if (ratio > 0) return 55;
  if (isSupportOpsSignal(signal) && hasSupportOpsAdjacency(evidenceCorpus)) return 65;
  if (isSupportFramedSignal(signal) && hasSupportOpsAdjacency(evidenceCorpus)) return 62;
  return 30;
}

function computeEvidenceDirectness(
  signal: string,
  evidenceCorpus: string,
  primaryEvidenceText: string,
  overlap: number,
  transferability: number,
  contactCenterTransfer: number,
  hasRetrievedEvidence: boolean,
): number {
  if (!hasRetrievedEvidence) return 0;

  const lowerSignal = signal.toLowerCase();

  if (/first[- ]call/i.test(lowerSignal) && /\bfirst[- ]call\b/i.test(evidenceCorpus)) return 95;
  if (/first[- ]contact/i.test(lowerSignal) && /\bfirst[- ]contact\b/i.test(evidenceCorpus)) return 95;

  if (namedToolSignalDirectlyEvident(signal, evidenceCorpus)) return 90;

  const strictTool = getStrictToolInSignal(signal);
  if (strictTool && strictToolDirectlyEvident(signal, evidenceCorpus)) return 88;

  if (/escalation/i.test(lowerSignal) && /escalation/i.test(evidenceCorpus)) {
    const tokenMatches = countPresentTokenMatches(signal, primaryEvidenceText);
    if (tokenMatches >= 1) return 92;
  }

  const tokenMatches = countPresentTokenMatches(signal, primaryEvidenceText);
  if (overlap >= PRESENT_OVERLAP_THRESHOLD && tokenMatches >= 2) return 95;
  if (overlap >= PRESENT_OVERLAP_THRESHOLD && tokenMatches >= 1) return 82;

  const effectiveTransfer = Math.max(transferability, contactCenterTransfer);
  if (effectiveTransfer >= TRANSFERABILITY_CONFIDENCE_THRESHOLD) return 62;
  if (overlap >= PARTIAL_OVERLAP_THRESHOLD) return 58;
  if (hasSupportOpsAdjacency(evidenceCorpus) && isSupportOpsSignal(signal)) return 60;
  if (hasRetrievedEvidence && effectiveTransfer > 0) return 42;
  if (hasRetrievedEvidence) return 35;
  return 0;
}

function computeToolDomainSpecificity(signal: string, evidenceCorpus: string): number {
  if (isStrictToolSignal(signal)) {
    return strictToolDirectlyEvident(signal, evidenceCorpus) ? 100 : 0;
  }
  const tools = extractToolMentions(signal);
  if (tools.length > 0) {
    return namedToolSignalDirectlyEvident(signal, evidenceCorpus) ? 100 : 25;
  }
  if (isDomainExpertiseSignal(signal)) {
    return domainExpertiseDirectlyEvident(signal, evidenceCorpus) ? 100 : 22;
  }
  if (isChannelSignal(signal)) {
    return channelDirectlyEvident(evidenceCorpus) ? 100 : 18;
  }
  if (isMetricsSignal(signal)) {
    return metricsDirectlyEvident(signal, evidenceCorpus) ? 100 : 20;
  }
  if (isSupportOpsSignal(signal)) return 58;
  return 55;
}

export function computeDefensibilityFactors(input: DefensibilityInput): DefensibilityFactors {
  const evidence_directness = computeEvidenceDirectness(
    input.signal,
    input.evidenceCorpus,
    input.primaryEvidenceText,
    input.overlap,
    input.transferability,
    input.contactCenterTransfer,
    input.hasRetrievedEvidence,
  );
  const translation_distance = computeTranslationDistance(input.signal, input.evidenceCorpus);
  const tool_domain_specificity = computeToolDomainSpecificity(input.signal, input.evidenceCorpus);
  const follow_up_defensibility = Math.round(
    evidence_directness * 0.5 + translation_distance * 0.3 + tool_domain_specificity * 0.2,
  );

  return {
    evidence_directness,
    translation_distance,
    tool_domain_specificity,
    follow_up_defensibility,
  };
}

export function computeRawDefensibilityScore(factors: DefensibilityFactors): number {
  return Math.round(
    factors.evidence_directness * 0.35 +
      factors.translation_distance * 0.3 +
      factors.tool_domain_specificity * 0.25 +
      factors.follow_up_defensibility * 0.1,
  );
}

/** Phase B — score within gate-allowed band. Gates from Phase A must be applied first. */
export function classifyFromDefensibility(
  factors: DefensibilityFactors,
  gates: DefensibilityHardGate[],
): Omit<DefensibilityClassificationResult, "factors" | "gates"> {
  const raw_score = computeRawDefensibilityScore(factors);

  const forcedMissing = gates.some((gate) => gate.forced_missing);
  if (forcedMissing) {
    const cap = Math.min(...gates.map((gate) => gate.score_cap), FORCED_MISSING_CAP);
    return {
      classification: "missing",
      raw_score,
      final_score: Math.min(raw_score, cap),
      max_tier: "partial",
    };
  }

  let scoreCap = 100;
  let maxTier: "present" | "partial" = "present";

  for (const gate of gates) {
    if (gate.present_blocked) {
      maxTier = "partial";
      scoreCap = Math.min(scoreCap, gate.score_cap);
    }
  }

  if (factors.translation_distance < PRESENT_MIN_TRANSLATION) {
    maxTier = "partial";
    scoreCap = Math.min(scoreCap, PARTIAL_ADJACENCY_CAP);
  }

  const final_score = Math.min(raw_score, scoreCap);

  const directMatchPresent =
    factors.evidence_directness >= 88 && factors.translation_distance >= 88;

  let classification: GroundedRecommendationClassification = "missing";
  if (
    maxTier === "present" &&
    factors.evidence_directness >= PRESENT_MIN_DIRECTNESS &&
    factors.translation_distance >= PRESENT_MIN_TRANSLATION &&
    (final_score >= PRESENT_THRESHOLD || directMatchPresent)
  ) {
    classification = "present";
  } else if (final_score >= PARTIAL_THRESHOLD && factors.translation_distance >= 55) {
    classification = "partial";
  }

  return {
    classification,
    raw_score,
    final_score,
    max_tier: maxTier,
  };
}

export function classifyWithDefensibility(input: DefensibilityInput): DefensibilityClassificationResult {
  const gates = evaluateHardGates(input.signal, input.evidenceCorpus);
  const factors = computeDefensibilityFactors(input);
  const tier = classifyFromDefensibility(factors, gates);

  return {
    ...tier,
    factors,
    gates,
  };
}
