import {
  normalizeEvidencePackage,
  type EvidencePackageItem,
} from "@signalyz/groundedCalibration";
import { retrieveResumeEvidence } from "@/services/rag/resumeIngestion";
import { getResumeSessionId } from "@/services/rag/groundedCalibrationClient";
import type { DirectorCalibrationResult } from "@/components/DirectorCalibrationBlock";

/** Retrieved resume evidence chunk with stable display fields. */
export interface RetrievedEvidence {
  evidence_id: string;
  content: string;
  section: string;
  company: string;
  role_title: string;
  similarity: number;
}

export interface EvidenceRetrievalContext {
  calibratedBullets?: Array<{ used_evidence?: EvidencePackageItem[] | null }> | null;
  sessionId?: string;
  /** When false, chunk retrieval is skipped (guest / anonymous). */
  isAuthenticated?: boolean;
}

export interface GroundedNarrativeResult {
  narrative: string;
  evidence_ids: string[];
  grounded: boolean;
  confidence: "high" | "low" | "none";
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "your", "you", "our", "are", "was", "were",
  "have", "has", "had", "will", "can", "must", "should", "into", "through", "across", "over", "under",
  "about", "within", "between", "using", "their", "they", "them", "job", "role", "position", "experience",
  "ability", "skills", "skill", "work", "team", "teams", "customer", "customers", "service", "strong",
  "demonstrate", "demonstrates", "signal", "signals", "management", "level",
]);

const LOW_CONFIDENCE_THRESHOLD = 0.55;
const MIN_NARRATIVE_OVERLAP = 0.15;
const MIN_QUERY_CHARS = 4;
const DEFAULT_TOP_K = 5;

function toRetrievedEvidence(item: EvidencePackageItem): RetrievedEvidence {
  return {
    evidence_id: item.evidence_id,
    content: item.content,
    section: item.section,
    company: item.company,
    role_title: item.role_title,
    similarity: item.similarity,
  };
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+(?:[+#/&-][a-z0-9]+)*/g) || [];
}

function significantTokens(text: string): string[] {
  return tokenize(text).filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function overlapRatio(signalTokens: string[], content: string): number {
  if (signalTokens.length === 0) return 0;
  const contentTokens = new Set(significantTokens(content));
  const hits = signalTokens.filter((token) => contentTokens.has(token)).length;
  return hits / signalTokens.length;
}

function collectCalibratedEvidence(context: EvidenceRetrievalContext): RetrievedEvidence[] {
  const items = context.calibratedBullets?.flatMap((bullet) => bullet.used_evidence ?? []) ?? [];
  return normalizeEvidencePackage(items).map(toRetrievedEvidence);
}

function rankEvidenceForQuery(query: string, pool: RetrievedEvidence[]): RetrievedEvidence[] {
  const queryTokens = significantTokens(query);
  if (pool.length === 0) return [];

  return [...pool]
    .map((item) => ({
      item,
      overlap: overlapRatio(queryTokens, item.content),
      overlapWithQuery: overlapRatio(queryTokens, `${item.content} ${item.company} ${item.role_title}`),
    }))
    .sort(
      (a, b) =>
        b.overlapWithQuery - a.overlapWithQuery ||
        b.overlap - a.overlap ||
        b.item.similarity - a.item.similarity,
    )
    .map((entry) => entry.item);
}

async function retrieveFromDocumentChunks(
  query: string,
  context: EvidenceRetrievalContext,
  sectionFilter?: string,
): Promise<RetrievedEvidence[]> {
  if (!context.isAuthenticated) {
    return [];
  }

  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_CHARS) {
    return [];
  }

  try {
    const sessionId = context.sessionId ?? getResumeSessionId();
    const matches = await retrieveResumeEvidence(trimmed, {
      topK: DEFAULT_TOP_K * 2,
      sessionId,
      matchThreshold: 0.45,
    });

    const filtered = matches.filter((match) => {
      if (!sectionFilter) return true;
      const section = String(match.metadata?.section ?? "unknown").toLowerCase();
      return section === sectionFilter.toLowerCase();
    });

    return normalizeEvidencePackage(
      filtered.map((match) => ({
        evidence_id: match.id,
        content: match.content,
        section: String(match.metadata?.section ?? "unknown"),
        company: String(match.metadata?.company ?? ""),
        role_title: String(match.metadata?.role_title ?? ""),
        similarity: match.similarity,
      })),
    ).map(toRetrievedEvidence);
  } catch {
    return [];
  }
}

async function retrieveWithHierarchy(
  query: string,
  context: EvidenceRetrievalContext,
  sectionFilter?: string,
): Promise<RetrievedEvidence[]> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_CHARS) {
    return [];
  }

  const calibratedPool = collectCalibratedEvidence(context);
  const sectionPool = sectionFilter
    ? calibratedPool.filter((item) => item.section.toLowerCase() === sectionFilter.toLowerCase())
    : calibratedPool;

  const rankedCalibrated = rankEvidenceForQuery(trimmed, sectionPool);
  if (rankedCalibrated.length > 0 && rankedCalibrated[0].similarity >= 0.45) {
    return rankedCalibrated.slice(0, DEFAULT_TOP_K);
  }

  const fromChunks = await retrieveFromDocumentChunks(trimmed, context, sectionFilter);
  const merged = normalizeEvidencePackage(
    [...rankedCalibrated, ...fromChunks].map((item) => ({
      evidence_id: item.evidence_id,
      content: item.content,
      section: item.section,
      company: item.company,
      role_title: item.role_title,
      similarity: item.similarity,
    })),
  ).map(toRetrievedEvidence);

  return rankEvidenceForQuery(trimmed, merged).slice(0, DEFAULT_TOP_K);
}

/**
 * Retrieve evidence for a positioning theme (dimension name, friction stage, pattern label).
 */
export async function retrieveEvidenceForTheme(
  theme: string,
  context: EvidenceRetrievalContext = {},
): Promise<RetrievedEvidence[]> {
  return retrieveWithHierarchy(theme, context);
}

/**
 * Retrieve evidence for an alignment signal or gap label.
 */
export async function retrieveEvidenceForSignal(
  signal: string,
  context: EvidenceRetrievalContext = {},
): Promise<RetrievedEvidence[]> {
  return retrieveWithHierarchy(signal, context);
}

/**
 * Retrieve evidence scoped to a resume section (experience, skills, summary, etc.).
 */
export async function retrieveEvidenceForSection(
  section: string,
  context: EvidenceRetrievalContext = {},
): Promise<RetrievedEvidence[]> {
  const sectionKey = section.trim();
  if (!sectionKey) return [];

  const calibrated = rankEvidenceForQuery(
    sectionKey,
    collectCalibratedEvidence(context).filter(
      (item) => item.section.toLowerCase() === sectionKey.toLowerCase(),
    ),
  );

  if (calibrated.length > 0) {
    return calibrated.slice(0, DEFAULT_TOP_K);
  }

  return retrieveFromDocumentChunks(sectionKey, context, sectionKey);
}

function cleanEvidenceSentence(content: string): string {
  const line = content
    .split("\n")
    .map((part) => part.trim())
    .find((part) => part.length > 0) ?? content.trim();

  return line.replace(/^[-•*]\s*/, "").replace(/\s+/g, " ").trim();
}

function formatEvidenceClause(item: RetrievedEvidence): string {
  const sentence = cleanEvidenceSentence(item.content);
  if (!sentence) return "";

  const company = item.company.trim();
  if (company) {
    const lowerSentence = sentence.toLowerCase();
    const lowerCompany = company.toLowerCase();
    if (lowerSentence.includes(lowerCompany)) {
      return sentence.endsWith(".") ? sentence : `${sentence}.`;
    }
    return `At ${company}, ${sentence.endsWith(".") ? sentence : `${sentence}.`}`;
  }

  return sentence.endsWith(".") ? sentence : `${sentence}.`;
}

/**
 * Build a human-readable narrative grounded only in retrieved evidence.
 * Never invents facts beyond what appears in evidence chunks.
 */
export function buildGroundedNarrative(
  signal: string,
  evidence: RetrievedEvidence[],
): GroundedNarrativeResult {
  const trimmedSignal = signal.trim();

  if (!evidence.length) {
    return {
      narrative: trimmedSignal
        ? `We could not verify "${trimmedSignal}" against indexed resume evidence. Treat this as uncertain until supporting resume text is available.`
        : "No indexed resume evidence was available for this insight.",
      evidence_ids: [],
      grounded: false,
      confidence: "none",
    };
  }

  const ranked = rankEvidenceForQuery(trimmedSignal || evidence[0].content, evidence);
  const primary = ranked[0];
  const signalTokens = significantTokens(trimmedSignal);
  const relevanceOverlap =
    signalTokens.length > 0
      ? overlapRatio(signalTokens, `${primary.content} ${primary.company} ${primary.role_title}`)
      : 1;

  if (trimmedSignal && relevanceOverlap < MIN_NARRATIVE_OVERLAP) {
    return {
      narrative: `We could not verify "${trimmedSignal}" against indexed resume evidence. Treat this as uncertain until supporting resume text is available.`,
      evidence_ids: [],
      grounded: false,
      confidence: "none",
    };
  }

  const topSimilarity = primary.similarity;
  const confidence: GroundedNarrativeResult["confidence"] =
    topSimilarity >= LOW_CONFIDENCE_THRESHOLD ? "high" : "low";

  const clauses = ranked
    .slice(0, 2)
    .map((item) => formatEvidenceClause(item))
    .filter(Boolean);

  const body = clauses.join(" ");
  const prefix =
    confidence === "low"
      ? "Based on limited indexed resume evidence, "
      : "";

  return {
    narrative: `${prefix}${body}`.trim(),
    evidence_ids: ranked.slice(0, 2).map((item) => item.evidence_id),
    grounded: true,
    confidence,
  };
}

/**
 * Enrich a Signal Positioning Report with RAG-backed narratives for major insights.
 * Does not modify scoring or edge-function output fields — adds grounded overlays only.
 */
export async function enrichPositioningReportWithEvidence(
  result: DirectorCalibrationResult,
  context: EvidenceRetrievalContext = {},
): Promise<DirectorCalibrationResult> {
  const enrichedDimensions = await Promise.all(
    result.dimensions.map(async (dimension) => {
      const query = dimension.strength_signal || dimension.name;
      const evidence = await retrieveEvidenceForTheme(query, context);
      const grounded = buildGroundedNarrative(query, evidence);

      return {
        ...dimension,
        grounded_strength_narrative: grounded.grounded ? grounded.narrative : undefined,
        supporting_evidence: evidence.length > 0 ? evidence : undefined,
        evidence_confidence: grounded.confidence,
      };
    }),
  );

  let signal_classifier = result.signal_classifier;
  if (signal_classifier) {
    const dimensionEntries = Object.entries(signal_classifier.dimension_scores) as Array<
      [keyof typeof signal_classifier.dimension_scores, typeof signal_classifier.dimension_scores.commercial]
    >;

    const enrichedScores = Object.fromEntries(
      await Promise.all(
        dimensionEntries.map(async ([key, dim]) => {
          const query = dim.gap || dim.gap_label || key;
          const evidence = await retrieveEvidenceForSignal(query, context);
          const grounded = buildGroundedNarrative(query, evidence);

          const hasAiQuotes = (dim.evidence_quotes?.length ?? 0) > 0;
          const grounded_rationale =
            !hasAiQuotes && grounded.grounded ? grounded.narrative : dim.rationale;

          return [
            key,
            {
              ...dim,
              grounded_rationale,
              supporting_evidence: evidence.length > 0 ? evidence : undefined,
              evidence_confidence: grounded.confidence,
            },
          ];
        }),
      ),
    ) as typeof signal_classifier.dimension_scores;

    signal_classifier = {
      ...signal_classifier,
      dimension_scores: enrichedScores,
    };
  }

  const tierEvidence = await retrieveEvidenceForTheme(
    result.director_signal_tier.rationale,
    context,
  );
  const tierGrounded = buildGroundedNarrative(
    result.director_signal_tier.tier,
    tierEvidence,
  );

  return {
    ...result,
    dimensions: enrichedDimensions,
    signal_classifier,
    director_signal_tier: {
      ...result.director_signal_tier,
      grounded_rationale:
        tierGrounded.grounded ? tierGrounded.narrative : undefined,
      supporting_evidence: tierEvidence.length > 0 ? tierEvidence : undefined,
      evidence_confidence: tierGrounded.confidence,
    },
  };
}

/** Stable key for correlating raw render with background enrichment. */
export function getDirectorReportEnrichmentKey(
  result: DirectorCalibrationResult,
  requestId?: string | null,
  pipelineStartedAtMs?: number,
): string {
  if (result.run_id) {
    return result.run_id;
  }
  if (requestId) {
    return requestId;
  }
  return `director-${pipelineStartedAtMs ?? Date.now()}`;
}

/** Marks in-flight enrichment superseded by a newer positioning run. */
export function markDirectorEnrichmentSuperseded(
  activeKeyRef: { current: string | null },
  pipelineStartedAtMs: number,
): void {
  activeKeyRef.current = `pending-${pipelineStartedAtMs}`;
}

export function logDirectorRawRenderedMs(
  pipelineStartedAtMs: number,
  enrichmentKey: string,
): void {
  if (!import.meta.env.DEV) {
    return;
  }

  console.log(
    JSON.stringify({
      event: "director_raw_rendered_ms",
      ms: Date.now() - pipelineStartedAtMs,
      enrichment_key: enrichmentKey,
    }),
  );
}

export interface RunBackgroundDirectorEvidenceEnrichmentOptions {
  directorData: DirectorCalibrationResult;
  context: EvidenceRetrievalContext;
  enrichmentKey: string;
  pipelineStartedAtMs: number;
  getActiveEnrichmentKey: () => string | null;
  onApplyEnriched: (enriched: DirectorCalibrationResult) => void;
  /** Test hook — defaults to enrichPositioningReportWithEvidence. */
  enrichFn?: (
    result: DirectorCalibrationResult,
    context: EvidenceRetrievalContext,
  ) => Promise<DirectorCalibrationResult>;
}

/**
 * Enriches a positioning report in the background. Silent on failure.
 * Applies enriched output only when the active enrichment key still matches.
 */
export async function runBackgroundDirectorEvidenceEnrichment(
  options: RunBackgroundDirectorEvidenceEnrichmentOptions,
): Promise<{ applied: boolean }> {
  const enrich = options.enrichFn ?? enrichPositioningReportWithEvidence;

  try {
    const enriched = await enrich(options.directorData, options.context);

    if (options.getActiveEnrichmentKey() !== options.enrichmentKey) {
      return { applied: false };
    }

    options.onApplyEnriched(enriched);

    if (import.meta.env.DEV) {
      console.log(
        JSON.stringify({
          event: "director_evidence_enriched_ms",
          ms: Date.now() - options.pipelineStartedAtMs,
          enrichment_key: options.enrichmentKey,
        }),
      );
    }

    return { applied: true };
  } catch {
    return { applied: false };
  }
}
