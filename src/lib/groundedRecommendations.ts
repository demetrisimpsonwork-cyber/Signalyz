import type { DirectorCalibrationResult } from "@/components/DirectorCalibrationBlock";
import {
  findUnsupportedMetrics,
  findUnsupportedTools,
  extractToolMentions,
} from "@signalyz/groundedCalibration";
import { parseScoreRationale } from "@/lib/scoreEvidence";
import type { RetrievedEvidence } from "@/lib/evidenceRetrieval";
import {
  scoreEvidenceForSignal,
  formatRetrievedEvidenceClause,
} from "@/lib/evidenceRetrieval";
import {
  type AlignmentGapsInput,
  type GroundedRecommendation,
  PARTIAL_OVERLAP_THRESHOLD,
  PARTIAL_SIMILARITY_THRESHOLD,
  PRESENT_OVERLAP_THRESHOLD,
  PRESENT_SIMILARITY_THRESHOLD,
  ROUTING_INTAKE_TRANSFERABILITY_THRESHOLD,
  TRANSFERABILITY_CONFIDENCE_THRESHOLD,
} from "@/lib/groundedRecommendationTypes";

const MAX_RECOMMENDATIONS = 10;
const MIN_KEYWORD_CHARS = 2;
const MIN_PRESENT_LITERAL_TOKEN_MATCHES = 2;

const GAP_LABEL_PHRASES: Record<string, string> = {
  no_commercial_attribution: "commercial impact attribution",
  limited_ownership_scope: "ownership scope",
  weak_decision_authority: "decision authority",
  missing_cross_functional_leadership: "cross-functional leadership",
  incomplete_lifecycle_governance: "lifecycle governance",
  absent_risk_framing: "risk framing",
  fragmented_narrative: "career narrative continuity",
};

const CLASSIFICATION_REASON = {
  noEvidence: "No supporting evidence was found.",
  weakAdjacency:
    "Related evidence exists but transferability confidence was below threshold.",
  weakDomainMatch:
    "Related evidence exists but the required domain, tool, or direct experience was not evidenced.",
  toolMismatch: "Related evidence exists but required tool evidence was not found.",
  present: "Direct evidence found in retrieved resume content.",
  partial: "Related experience was found but does not fully satisfy the requested signal.",
  unverified: "Indexed resume evidence could not be verified for this session.",
} as const;

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "your", "you", "our", "are", "was", "were",
  "have", "has", "had", "will", "can", "must", "should", "into", "through", "across", "over", "under",
  "about", "within", "between", "using", "their", "they", "them", "job", "role", "position", "experience",
  "ability", "skills", "skill", "work", "team", "teams", "customer", "customers", "service", "strong",
  "demonstrate", "demonstrates", "signal", "signals", "management", "level",
]);

interface TransferabilityGroup {
  terms: string[];
  partialTransferThreshold?: number;
}

/** Adjacent capability groups — conservative transferability only within shared groups. */
const TRANSFERABILITY_GROUPS: TransferabilityGroup[] = [
  { terms: ["portfolio", "caseload", "cases", "accounts", "customers", "client"] },
  {
    terms: [
      "dispatch",
      "routing",
      "route",
      "routed",
      "schedule",
      "scheduling",
      "intake",
      "queue",
      "ticket",
      "triage",
      "handoff",
    ],
    partialTransferThreshold: ROUTING_INTAKE_TRANSFERABILITY_THRESHOLD,
  },
  { terms: ["escalation", "dispute", "complaint", "de-escalation", "resolution"] },
  {
    terms: ["stakeholder", "coordination", "cross-agency", "cross-functional", "partner", "agency"],
  },
  { terms: ["lifecycle", "onboarding", "renewal", "retention", "governance"] },
  { terms: ["commercial", "revenue", "budget", "roi", "impact", "outcome"] },
  { terms: ["analytics", "reporting", "metrics", "dashboard", "kpi"] },
  { terms: ["enterprise", "regional", "high-volume", "volume", "scale"] },
  { terms: ["ownership", "owned", "accountable", "end-to-end", "led", "managed"] },
  {
    terms: ["contact", "center", "call", "phone", "inbound", "outbound"],
    partialTransferThreshold: ROUTING_INTAKE_TRANSFERABILITY_THRESHOLD,
  },
  {
    terms: ["support", "troubleshoot", "troubleshooting", "login", "documentation"],
    partialTransferThreshold: TRANSFERABILITY_CONFIDENCE_THRESHOLD,
  },
];

/** Evidence markers that support call-center / contact-center adjacency reframes. */
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

const CALL_CENTER_SIGNAL_PATTERN =
  /\b(contact center|call center|inbound call center|inbound inquiry|inbound inquiries|phone support|high-volume inbound)\b/i;

const DIRECT_CALL_CENTER_EVIDENCE_PATTERN = /\b(call center|contact center)\b/i;

const SUPPORT_ADJACENT_SIGNAL_PATTERNS = [
  /customer support/,
  /case resolution/,
  /regulated/,
  /contact center/,
  /call center/,
  /inbound (call|inquiry|inquiries|phone)/,
  /phone support/,
  /high-volume inbound/,
  /login support/,
  /software troubleshooting/,
  /account issue/,
  /documentation.*support/,
  /filing workflow.*support/,
  /tax software.*support/,
  /support experience/,
  /workflow customer support/,
  /escalation/,
  /intake/,
  /troubleshoot/,
];

const ANALYTICS_SIGNAL_TOKENS = new Set([
  "analytics",
  "ga4",
  "google",
  "tableau",
  "looker",
  "powerbi",
  "reporting",
  "dashboard",
  "metrics",
]);

/** Tool tokens that must appear in evidence when referenced by the signal. */
const STRICT_TOOL_SIGNAL_TOKENS = [
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
  "erp",
  "warehouse",
  "logistics",
  "distribution",
  "turbotax",
  "zendesk",
];

function humanizeGapLabel(raw: string): string {
  const key = raw.trim().toLowerCase();
  if (GAP_LABEL_PHRASES[key]) return GAP_LABEL_PHRASES[key];
  if (/[_-]/.test(raw)) {
    return raw.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return raw.trim();
}

function dedupeSignals(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed.length < MIN_KEYWORD_CHARS) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

export function buildGapRegistry(
  director: DirectorCalibrationResult,
  alignment?: AlignmentGapsInput | null,
): string[] {
  const signals: string[] = [];

  if (alignment?.top_missing_signal?.trim()) {
    signals.push(alignment.top_missing_signal.trim());
  }

  if (alignment?.missing_keywords) {
    for (const keyword of alignment.missing_keywords) {
      const trimmed = keyword?.trim();
      if (trimmed && trimmed.length >= MIN_KEYWORD_CHARS) signals.push(trimmed);
    }
  }

  if (alignment?.score_rationale) {
    const parsed = parseScoreRationale(alignment.score_rationale);
    signals.push(...parsed.gaps);
  }

  if (director.signal_classifier?.top_3_gaps) {
    for (const gap of director.signal_classifier.top_3_gaps) {
      signals.push(humanizeGapLabel(gap));
    }
  }

  if (director.signal_classifier) {
    for (const dim of Object.values(director.signal_classifier.dimension_scores)) {
      for (const missing of dim.missing ?? []) {
        if (missing.trim()) signals.push(missing.trim());
      }
    }
  }

  if (alignment?.primary_blocker?.trim()) {
    signals.push(alignment.primary_blocker.trim());
  }

  return dedupeSignals(signals).slice(0, MAX_RECOMMENDATIONS);
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+(?:[+#/&-][a-z0-9]+)*/g) || [];
}

function tokenStemMatch(a: string, b: string): boolean {
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const stemLen = Math.min(5, Math.min(a.length, b.length));
  if (stemLen < 3) return false;
  return a.slice(0, stemLen) === b.slice(0, stemLen);
}

function countPresentTokenMatches(signal: string, evidenceText: string): number {
  const signalTokens = tokenize(signal).filter((token) => token.length >= 3 && token !== "customer");
  const evidenceTokens = tokenize(evidenceText);
  let matches = 0;
  for (const signalToken of signalTokens) {
    if (STOP_WORDS.has(signalToken)) continue;
    if (evidenceTokens.some((evidenceToken) => tokenStemMatch(signalToken, evidenceToken))) {
      matches++;
    }
  }
  return matches;
}

function countGroupTermHits(terms: string[], text: string): number {
  const lower = text.toLowerCase();
  const tokens = tokenize(text);
  return terms.filter(
    (term) =>
      lower.includes(term) || tokens.some((token) => tokenStemMatch(term, token)),
  ).length;
}

interface TransferabilityResult {
  score: number;
  threshold: number;
}

function computeTransferabilityConfidence(signal: string, evidenceText: string): TransferabilityResult {
  const signalTokens = tokenize(signal);
  if (signalTokens.length === 0) {
    return { score: 0, threshold: TRANSFERABILITY_CONFIDENCE_THRESHOLD };
  }

  let bestGroupScore = 0;
  let thresholdForBest = TRANSFERABILITY_CONFIDENCE_THRESHOLD;

  for (const group of TRANSFERABILITY_GROUPS) {
    const signalTermsInGroup = group.terms.filter((term) =>
      signalTokens.some((token) => tokenStemMatch(token, term)),
    ).length;
    if (signalTermsInGroup === 0) continue;
    const sharedHits = group.terms.filter(
      (term) =>
        signalTokens.some((token) => tokenStemMatch(token, term)) &&
        countGroupTermHits([term], evidenceText) > 0,
    ).length;
    if (sharedHits === 0) continue;
    const score = sharedHits / signalTermsInGroup;
    if (score > bestGroupScore) {
      bestGroupScore = score;
      thresholdForBest =
        group.partialTransferThreshold ?? TRANSFERABILITY_CONFIDENCE_THRESHOLD;
    }
  }

  return {
    score: Math.min(0.85, bestGroupScore),
    threshold: thresholdForBest,
  };
}

function signalRequiresAnalyticsTool(signal: string): boolean {
  const lower = signal.toLowerCase();
  return [...ANALYTICS_SIGNAL_TOKENS].some((term) => lower.includes(term));
}

function evidenceSupportsAnalyticsTool(evidenceText: string): boolean {
  const tools = extractToolMentions(evidenceText);
  const analyticsTools = ["tableau", "power bi", "sql", "excel"];
  return tools.some((tool) => analyticsTools.includes(tool) || tool.includes("analytics"));
}

function evidenceContainsToolToken(evidenceText: string, toolToken: string): boolean {
  const normalizedEvidence = evidenceText.toLowerCase().replace(/[\s_-]+/g, "");
  const normalizedTool = toolToken.toLowerCase().replace(/[\s_-]+/g, "");
  return normalizedEvidence.includes(normalizedTool);
}

function getRequiredToolFromSignal(signal: string): string | null {
  const lower = signal.toLowerCase();
  for (const tool of STRICT_TOOL_SIGNAL_TOKENS) {
    if (lower.includes(tool)) return tool;
  }
  const commonTools = extractToolMentions(signal);
  if (commonTools.length > 0) return commonTools[0];
  return null;
}

function hasToolMismatch(signal: string, evidenceText: string): boolean {
  if (signalRequiresAnalyticsTool(signal) && !evidenceSupportsAnalyticsTool(evidenceText)) {
    return true;
  }
  const requiredTool = getRequiredToolFromSignal(signal);
  if (!requiredTool) return false;
  return !evidenceContainsToolToken(evidenceText, requiredTool);
}

function isCallCenterRelatedSignal(signal: string): boolean {
  return CALL_CENTER_SIGNAL_PATTERN.test(signal.toLowerCase());
}

function evidenceHasDirectCallCenterWording(evidenceText: string): boolean {
  return DIRECT_CALL_CENTER_EVIDENCE_PATTERN.test(evidenceText.toLowerCase());
}

function isStrictToolRequirement(signal: string): boolean {
  const lower = signal.toLowerCase();
  for (const tool of STRICT_TOOL_SIGNAL_TOKENS) {
    if (lower.includes(tool)) return true;
  }
  return false;
}

/** Domain expertise gaps — not defensible as customer-support reframes. */
function isDomainExpertiseOnly(signal: string): boolean {
  const lower = signal.toLowerCase().trim();
  if (/\bturbotax\b/i.test(lower)) return true;
  if (/\btax preparation\b/i.test(lower)) return true;
  if (/no demonstrated.*tax software/i.test(lower)) return true;
  if (
    /\btax filing\b/i.test(lower) &&
    !/support|customer|workflow|guidance|assistance|user/i.test(lower)
  ) {
    return true;
  }
  if (/tax season\b/i.test(lower) && !/support/i.test(lower)) return true;
  if (
    /\btax software\b/i.test(lower) &&
    !/customer support|user support|support experience|workflow customer/i.test(lower)
  ) {
    return true;
  }
  return false;
}

function isSupportAdjacentSignal(signal: string): boolean {
  if (isDomainExpertiseOnly(signal)) return false;
  const lower = signal.toLowerCase();
  return SUPPORT_ADJACENT_SIGNAL_PATTERNS.some((pattern) => pattern.test(lower));
}

function computeContactCenterTransferability(signal: string, evidenceCorpus: string): number {
  if (!isCallCenterRelatedSignal(signal)) return 0;
  const lowerEvidence = evidenceCorpus.toLowerCase();
  const hits = CALL_CENTER_EVIDENCE_MARKERS.filter((marker) => lowerEvidence.includes(marker)).length;
  if (hits === 0) return 0;
  return Math.min(0.85, 0.4 + hits * 0.08);
}

function qualifiesForDomainAdjacentPartial(params: {
  signal: string;
  transferability: TransferabilityResult;
  contactCenterTransfer: number;
  toolMismatch: boolean;
}): boolean {
  const { signal, transferability, contactCenterTransfer, toolMismatch } = params;
  if (toolMismatch || isStrictToolRequirement(signal)) return false;
  if (!isSupportAdjacentSignal(signal)) return false;
  const effectiveTransfer = Math.max(transferability.score, contactCenterTransfer);
  return effectiveTransfer >= TRANSFERABILITY_CONFIDENCE_THRESHOLD;
}

function hasPresentLiteralMatch(signal: string, evidenceText: string): boolean {
  const scored = scoreEvidenceForSignal(signal, [
    {
      evidence_id: "probe",
      content: evidenceText,
      section: "experience",
      company: "",
      role_title: "",
      similarity: 1,
    },
  ]);
  const tokenMatches = countPresentTokenMatches(signal, evidenceText);
  return (
    scored.overlap >= PRESENT_OVERLAP_THRESHOLD &&
    tokenMatches >= MIN_PRESENT_LITERAL_TOKEN_MATCHES
  );
}

function resolveMissingReason(params: {
  toolMismatch: boolean;
  hasRetrievedEvidence: boolean;
  overlap: number;
  similarity: number;
  transferability: TransferabilityResult;
}): string {
  const { toolMismatch, hasRetrievedEvidence, overlap, similarity, transferability } = params;
  if (toolMismatch) {
    return CLASSIFICATION_REASON.toolMismatch;
  }
  if (!hasRetrievedEvidence) {
    return CLASSIFICATION_REASON.noEvidence;
  }
  const meetsPartialOverlap = overlap >= PARTIAL_OVERLAP_THRESHOLD;
  const meetsPartialSim = similarity >= PARTIAL_SIMILARITY_THRESHOLD;
  if (
    meetsPartialOverlap &&
    meetsPartialSim &&
    transferability.score < transferability.threshold
  ) {
    return CLASSIFICATION_REASON.weakAdjacency;
  }
  return CLASSIFICATION_REASON.weakDomainMatch;
}

export interface SignalClassificationResult {
  classification: GroundedRecommendation["classification"];
  classification_reason: string;
  evidence_confidence: number;
  transferability_confidence: number;
  primaryEvidence: RetrievedEvidence | null;
  evidence_used: string[];
}

export function classifySignalEvidence(
  signal: string,
  evidence: RetrievedEvidence[],
  retrievalVerified: boolean,
): SignalClassificationResult {
  if (!retrievalVerified) {
    return {
      classification: "missing",
      classification_reason: CLASSIFICATION_REASON.unverified,
      evidence_confidence: 0,
      transferability_confidence: 0,
      primaryEvidence: null,
      evidence_used: [],
    };
  }

  if (!evidence.length) {
    return {
      classification: "missing",
      classification_reason: CLASSIFICATION_REASON.noEvidence,
      evidence_confidence: 0,
      transferability_confidence: 0,
      primaryEvidence: null,
      evidence_used: [],
    };
  }

  const scored = scoreEvidenceForSignal(signal, evidence);
  const primary = scored.ranked[0];
  const overlap = scored.overlap;
  const similarity = primary.similarity;
  const evidenceCorpus = scored.ranked.map((item) => item.content).join("\n");
  const transferability = computeTransferabilityConfidence(signal, evidenceCorpus);
  const evidenceConfidence = Math.min(
    1,
    Math.max(0, similarity * 0.6 + overlap * 0.4),
  );
  const presentLiteralMatch = hasPresentLiteralMatch(
    signal,
    `${primary.content} ${primary.company}`,
  );
  const toolMismatch = hasToolMismatch(signal, evidenceCorpus);
  const contactCenterTransfer = computeContactCenterTransferability(signal, evidenceCorpus);
  const effectiveTransferability = Math.max(transferability.score, contactCenterTransfer);
  const primaryEvidenceText = `${primary.content} ${primary.company} ${primary.role_title}`;
  const callCenterPresentAllowed =
    !isCallCenterRelatedSignal(signal) || evidenceHasDirectCallCenterWording(primaryEvidenceText);

  if (
    similarity >= PRESENT_SIMILARITY_THRESHOLD &&
    presentLiteralMatch &&
    !toolMismatch &&
    callCenterPresentAllowed
  ) {
    return {
      classification: "present",
      classification_reason: CLASSIFICATION_REASON.present,
      evidence_confidence: evidenceConfidence,
      transferability_confidence: effectiveTransferability,
      primaryEvidence: primary,
      evidence_used: [primary.content],
    };
  }

  const meetsPartialOverlap = overlap >= PARTIAL_OVERLAP_THRESHOLD;
  const meetsPartialSim = similarity >= PARTIAL_SIMILARITY_THRESHOLD;
  const defensibleTransferableAdjacency =
    meetsPartialOverlap && meetsPartialSim && !toolMismatch && transferability.score > 0;
  const domainAdjacentPartial = qualifiesForDomainAdjacentPartial({
    signal,
    transferability,
    contactCenterTransfer,
    toolMismatch,
  });

  if (defensibleTransferableAdjacency || domainAdjacentPartial) {
    return {
      classification: "partial",
      classification_reason: CLASSIFICATION_REASON.partial,
      evidence_confidence: evidenceConfidence,
      transferability_confidence: effectiveTransferability,
      primaryEvidence: primary,
      evidence_used: [primary.content],
    };
  }

  return {
    classification: "missing",
    classification_reason: resolveMissingReason({
      toolMismatch,
      hasRetrievedEvidence: Boolean(primary.content),
      overlap,
      similarity,
      transferability,
    }),
    evidence_confidence: evidenceConfidence,
    transferability_confidence: effectiveTransferability,
    primaryEvidence: primary,
    evidence_used: primary.content ? [primary.content] : [],
  };
}

/** Prefix used only for PARTIAL transferable-reframe recommendations. */
export const PARTIAL_REFRAME_PREFIX = "Your resume shows related experience:";

export function isTransferableReframeRecommendation(recommendation: string): boolean {
  return recommendation.includes(PARTIAL_REFRAME_PREFIX);
}

export function isClassificationConsistentWithRecommendation(
  recommendation: GroundedRecommendation,
): boolean {
  if (isTransferableReframeRecommendation(recommendation.recommendation)) {
    return recommendation.classification === "partial";
  }
  if (recommendation.classification === "missing" && recommendation.grounded) {
    return !isTransferableReframeRecommendation(recommendation.recommendation);
  }
  return true;
}

function validateRecommendationText(text: string, allowedCorpus: string): boolean {
  const unsupportedMetrics = findUnsupportedMetrics(text, allowedCorpus);
  const unsupportedTools = findUnsupportedTools(text, allowedCorpus);
  return unsupportedMetrics.length === 0 && unsupportedTools.length === 0;
}

export function buildGroundedRecommendationText(
  signal: string,
  classification: SignalClassificationResult,
): { recommendation: string; grounded: boolean } {
  if (!classification.primaryEvidence && classification.classification === "missing") {
    if (classification.classification_reason === CLASSIFICATION_REASON.unverified) {
      return {
        recommendation:
          "We could not verify evidence supporting this recommendation from indexed resume content.",
        grounded: false,
      };
    }
    return {
      recommendation: `No defensible evidence for "${signal}" was found in indexed resume content. Do not imply this signal on your resume or in interviews without additional experience.`,
      grounded: true,
    };
  }

  const clause = classification.primaryEvidence
    ? formatRetrievedEvidenceClause(classification.primaryEvidence)
    : "";
  const allowedCorpus = [clause, ...classification.evidence_used].join("\n");
  const section = classification.primaryEvidence?.section ?? "experience";

  let recommendation = "";
  if (classification.classification === "present") {
    recommendation = `Your resume already documents this: ${clause} Next step: surface this in your ${section} section and lead bullets — use only these facts; do not add new tools, metrics, or scope.`;
  } else if (classification.classification === "partial") {
    recommendation = `${PARTIAL_REFRAME_PREFIX} ${clause} Next step: reframe using this exact experience only; do not claim full "${signal}" unless you can defend it in an interview.`;
  } else {
    recommendation = `No defensible evidence for "${signal}" was found in indexed resume content. Do not imply this signal on your resume or in interviews without additional experience.`;
  }

  if (!validateRecommendationText(recommendation, allowedCorpus)) {
    return {
      recommendation:
        "We could not verify evidence supporting this recommendation from indexed resume content.",
      grounded: false,
    };
  }

  return { recommendation, grounded: true };
}

export async function buildGroundedRecommendations(params: {
  director: DirectorCalibrationResult;
  alignmentGaps?: AlignmentGapsInput | null;
  retrievalVerified: boolean;
  retrieveForSignal: (signal: string) => Promise<RetrievedEvidence[]>;
}): Promise<GroundedRecommendation[]> {
  const signals = buildGapRegistry(params.director, params.alignmentGaps);
  const recommendations: GroundedRecommendation[] = [];

  for (let rank = 0; rank < signals.length; rank++) {
    const signal = signals[rank];
    const evidence = await params.retrieveForSignal(signal);
    const classification = classifySignalEvidence(signal, evidence, params.retrievalVerified);
    const { recommendation, grounded } = buildGroundedRecommendationText(signal, classification);

    recommendations.push({
      classification: classification.classification,
      classification_reason: classification.classification_reason,
      signal_name: signal,
      recommendation,
      evidence_used: classification.evidence_used,
      evidence_confidence: classification.evidence_confidence,
      transferability_confidence: classification.transferability_confidence,
      grounded,
      jd_importance_rank: rank,
    });
  }

  return recommendations;
}
