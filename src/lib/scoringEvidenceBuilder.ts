import { parseScoreRationale, SCORE_BREAKDOWN_DIMENSIONS, type ScoringBreakdown } from "@/lib/scoreEvidence";
import {
  collectAllowedScoringEvidence,
  finalizeScoringEvidenceLink,
  toScoringEvidenceRef,
  type EvidenceConfidence,
  type PillarEvidenceEntry,
  type ScoringEvidence,
  type ScoringEvidenceRef,
} from "@/lib/scoringEvidenceTypes";
import type { CalibratedBulletRecord, EvidencePackageItem } from "@signalyz/groundedCalibration";

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "your", "you", "our", "are", "was", "were",
  "have", "has", "had", "will", "can", "must", "should", "into", "onto", "through", "across", "over",
  "under", "about", "within", "between", "using", "use", "used", "their", "they", "them", "job", "role",
  "position", "experience", "ability", "skills", "skill", "work", "working", "team", "teams", "customer",
  "customers", "service", "services", "business", "missing", "signal", "under", "signaled", "priority",
]);

const PILLAR_LEXICONS: Record<keyof ScoringBreakdown, string[]> = {
  role_outcomes_alignment: [
    "led", "drove", "owned", "delivered", "achieved", "implemented", "executed", "outcome", "results",
    "accountability", "resolved", "improved", "reduced", "increased", "governed", "managed", "directed",
  ],
  tools_and_workflow_alignment: [
    "salesforce", "sap", "hubspot", "zendesk", "servicenow", "jira", "tableau", "excel", "workday",
    "oracle", "sql", "python", "workflow", "crm", "erp", "system", "platform", "software", "tool",
  ],
  domain_and_context_alignment: [
    "compliance", "regulatory", "public", "sector", "government", "agency", "benefits", "claims",
    "unemployment", "eligibility", "operational", "operations", "industry", "domain", "program",
  ],
  context_and_scale_alignment: [
    "team", "teams", "volume", "high-volume", "regional", "enterprise", "global", "portfolio", "program",
    "budget", "revenue", "stakeholders", "cross-functional", "multi-site", "locations", "departments",
    "percent", "sla", "cases", "accounts",
  ],
  communication_and_leadership_alignment: [
    "stakeholder", "stakeholders", "trained", "mentored", "supervised", "coordinated", "facilitated",
    "presented", "communicated", "leadership", "executive", "cross-agency", "partner", "de-escalation",
    "escalation", "supervisors", "legal",
  ],
};

const PILLAR_LABELS: Record<keyof ScoringBreakdown, string> = {
  role_outcomes_alignment: "role outcomes",
  tools_and_workflow_alignment: "tools and workflow",
  domain_and_context_alignment: "domain and context",
  context_and_scale_alignment: "context and scale",
  communication_and_leadership_alignment: "communication and leadership",
};

export interface BuildScoringEvidenceInput {
  evidencePackage?: EvidencePackageItem[] | null;
  calibrated_bullets?: Array<Pick<CalibratedBulletRecord, "used_evidence">> | null;
  scoring_breakdown: ScoringBreakdown;
  top_matched_signal?: string | null;
  top_missing_signal?: string | null;
  score_rationale?: string[] | null;
  missing_keywords?: string[] | null;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+(?:[+#/&-][a-z0-9]+)*/g) || [];
}

function significantTokens(text: string): string[] {
  return tokenize(text).filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function overlapRatio(signalTokens: string[], content: string): number {
  if (signalTokens.length === 0) return 0;
  const contentTokens = new Set(significantTokens(content));
  const hits = signalTokens.filter((token) => contentTokens.has(token)).length;
  return hits / signalTokens.length;
}

function lexiconHitScore(content: string, lexicon: string[]): number {
  const lower = content.toLowerCase();
  let hits = 0;
  for (const term of lexicon) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    const rx = new RegExp(`\\b${escaped}\\b`, "i");
    if (rx.test(lower)) hits += 1;
  }
  return hits;
}

function rankEvidenceForSignal(
  signal: string,
  allowed: EvidencePackageItem[],
  maxItems = 3,
  minOverlap = 0.2,
): ScoringEvidenceRef[] {
  const signalTokens = significantTokens(signal);
  if (signalTokens.length === 0 || allowed.length === 0) return [];

  return allowed
    .map((item) => ({
      item,
      overlap: overlapRatio(signalTokens, item.content),
    }))
    .filter((entry) => entry.overlap >= minOverlap)
    .sort((a, b) => b.overlap - a.overlap || b.item.similarity - a.item.similarity)
    .slice(0, maxItems)
    .map((entry) =>
      toScoringEvidenceRef(
        entry.item,
        `Token overlap (${Math.round(entry.overlap * 100)}%) with signal`,
      ),
    );
}

function rankEvidenceForPillar(
  pillar: keyof ScoringBreakdown,
  allowed: EvidencePackageItem[],
  maxItems = 3,
): ScoringEvidenceRef[] {
  const lexicon = PILLAR_LEXICONS[pillar];
  if (allowed.length === 0) return [];

  return allowed
    .map((item) => ({
      item,
      hits: lexiconHitScore(item.content, lexicon),
    }))
    .filter((entry) => entry.hits > 0)
    .sort((a, b) => b.hits - a.hits || b.item.similarity - a.item.similarity)
    .slice(0, maxItems)
    .map((entry) =>
      toScoringEvidenceRef(
        entry.item,
        `${entry.hits} ${PILLAR_LABELS[pillar]} lexicon hit(s)`,
      ),
    );
}

function buildPillarHint(pillar: keyof ScoringBreakdown, refs: ScoringEvidenceRef[]): string {
  if (refs.length === 0) {
    return `No retrieved resume evidence maps to ${PILLAR_LABELS[pillar]}.`;
  }
  return `${refs.length} retrieved resume chunk(s) contain ${PILLAR_LABELS[pillar]} signals.`;
}

function computeEvidenceConfidence(allowed: EvidencePackageItem[]): EvidenceConfidence {
  if (allowed.length === 0) return "low";

  const maxSimilarity = Math.max(...allowed.map((item) => item.similarity));
  const averageSimilarity =
    allowed.reduce((sum, item) => sum + item.similarity, 0) / allowed.length;

  if (allowed.length >= 3 && maxSimilarity >= 0.65) return "high";
  if (allowed.length <= 2 || (averageSimilarity >= 0.45 && averageSimilarity <= 0.64)) {
    return "medium";
  }
  return "low";
}

function buildPillarEvidence(
  breakdown: ScoringBreakdown,
  allowed: EvidencePackageItem[],
): Partial<Record<keyof ScoringBreakdown, PillarEvidenceEntry>> {
  const pillarEvidence: Partial<Record<keyof ScoringBreakdown, PillarEvidenceEntry>> = {};

  for (const dimension of SCORE_BREAKDOWN_DIMENSIONS) {
    const pillar = dimension.key;
    const supportingEvidence = rankEvidenceForPillar(pillar, allowed);
    pillarEvidence[pillar] = {
      score: breakdown[pillar],
      supporting_evidence: supportingEvidence,
      explanation_hint: buildPillarHint(pillar, supportingEvidence),
    };
  }

  return pillarEvidence;
}

/** Builds metadata-only scoring_evidence from allowed retrieval/grounding sources. */
export function buildScoringEvidence(input: BuildScoringEvidenceInput): ScoringEvidence {
  const allowed = collectAllowedScoringEvidence({
    evidencePackage: input.evidencePackage,
    calibratedBullets: input.calibrated_bullets,
  });

  const matchedSignals = dedupeStrings([input.top_matched_signal]);
  const { gaps } = parseScoreRationale(input.score_rationale ?? undefined);
  const missingSignals = dedupeStrings([
    input.top_missing_signal,
    ...(input.missing_keywords ?? []),
    ...gaps,
  ]);

  const matched_evidence = matchedSignals.map((signal) =>
    finalizeScoringEvidenceLink(signal, rankEvidenceForSignal(signal, allowed)),
  );

  const missing_evidence = missingSignals.map((signal) =>
    finalizeScoringEvidenceLink(signal, rankEvidenceForSignal(signal, allowed)),
  );

  return {
    matched_evidence,
    missing_evidence,
    pillar_evidence: buildPillarEvidence(input.scoring_breakdown, allowed),
    evidence_confidence: computeEvidenceConfidence(allowed),
  };
}

/** Returns every evidence_id referenced in scoring_evidence output. */
export function collectScoringEvidenceIds(scoringEvidence: ScoringEvidence): string[] {
  const ids = new Set<string>();

  const appendRefs = (refs: ScoringEvidenceRef[]) => {
    for (const ref of refs) ids.add(ref.evidence_id);
  };

  for (const link of [...scoringEvidence.matched_evidence, ...scoringEvidence.missing_evidence]) {
    appendRefs(link.evidence);
  }

  for (const entry of Object.values(scoringEvidence.pillar_evidence)) {
    if (entry) appendRefs(entry.supporting_evidence);
  }

  return [...ids];
}
