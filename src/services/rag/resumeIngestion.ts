import { supabase } from "@/integrations/supabase/client";
import { chunkResumeSections } from "./chunkResumeSections";
import {
  getEmbeddingProvider,
  type EmbeddingProvider,
} from "./embeddingClient";
import { retrieveRelevantEvidence, saveDocumentChunks } from "./documentChunks";
import type {
  DocumentChunkMetadata,
  IngestResumeDocumentParams,
  IngestResumeDocumentResult,
  ResumeEvidenceMatch,
} from "./types";

const SESSION_TOKEN_KEY = "signalyz_session_token";
const MIN_RESUME_INGEST_CHARS = 50;
const INGEST_DEBOUNCE_MS = 1500;

let ingestTimer: ReturnType<typeof setTimeout> | null = null;
let lastIngestedFingerprint = "";

function getSessionId(): string {
  let token = localStorage.getItem(SESSION_TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(SESSION_TOKEN_KEY, token);
  }
  return token;
}

function buildIngestFingerprint(sessionId: string, resumeText: string): string {
  return `${sessionId}:${resumeText.length}:${resumeText.slice(0, 96)}`;
}

async function tryGetAuthenticatedUserId(): Promise<string | null> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user.id;
}

function isResumeChunk(metadata: DocumentChunkMetadata): boolean {
  return metadata.document_type === "resume";
}

function matchesSession(metadata: DocumentChunkMetadata, sessionId?: string): boolean {
  if (!sessionId) {
    return true;
  }

  return metadata.session_id === sessionId;
}

/**
 * Parses, embeds, and stores resume section chunks for the signed-in user.
 * Returns null when the user is anonymous or the resume is too short.
 */
export async function ingestResumeDocument(
  params: IngestResumeDocumentParams,
  provider: EmbeddingProvider = getEmbeddingProvider(),
): Promise<IngestResumeDocumentResult | null> {
  const resumeText = params.resumeText.trim();
  if (resumeText.length < MIN_RESUME_INGEST_CHARS) {
    return null;
  }

  const userId = await tryGetAuthenticatedUserId();
  if (!userId) {
    return null;
  }

  const sessionId = params.sessionId.trim();
  if (!sessionId) {
    throw new Error("sessionId is required.");
  }

  const chunks = chunkResumeSections(resumeText);
  if (chunks.length === 0) {
    return null;
  }

  const saved = await saveDocumentChunks(
    {
      documentId: sessionId,
      chunks,
      metadata: {
        document_type: "resume",
        session_id: sessionId,
        source: params.source ?? "paste",
      },
    },
    provider,
  );

  return {
    ...saved,
    sessionId,
  };
}

/**
 * Retrieves resume evidence chunks ranked by semantic similarity.
 */
export async function retrieveResumeEvidence(
  query: string,
  options: {
    topK?: number;
    sessionId?: string;
    matchThreshold?: number;
  } = {},
  provider: EmbeddingProvider = getEmbeddingProvider(),
): Promise<ResumeEvidenceMatch[]> {
  const topK = options.topK ?? 5;
  const sessionId = options.sessionId ?? getSessionId();

  const retrieval = await retrieveRelevantEvidence(
    {
      query,
      matchCount: Math.max(topK * 3, topK),
      matchThreshold: options.matchThreshold ?? 0.5,
    },
    provider,
  );

  return retrieval.matches
    .filter((match) => isResumeChunk(match.metadata) && matchesSession(match.metadata, sessionId))
    .slice(0, topK)
    .map((match) => ({
      id: match.id,
      documentId: match.documentId,
      chunkIndex: match.chunkIndex,
      content: match.content,
      similarity: match.similarity,
      metadata: match.metadata,
    }));
}

/**
 * Debounced, fire-and-forget resume ingestion after parse/upload completes.
 * Silent for anonymous users and infrastructure failures.
 */
export function scheduleResumeIngestion(
  resumeText: string,
  sessionId: string = getSessionId(),
  source?: IngestResumeDocumentParams["source"],
): void {
  const trimmed = resumeText.trim();
  if (trimmed.length < MIN_RESUME_INGEST_CHARS) {
    return;
  }

  const fingerprint = buildIngestFingerprint(sessionId, trimmed);
  if (fingerprint === lastIngestedFingerprint) {
    return;
  }

  if (ingestTimer) {
    clearTimeout(ingestTimer);
  }

  ingestTimer = setTimeout(() => {
    ingestTimer = null;

    void ingestResumeDocument({ resumeText: trimmed, sessionId, source })
      .then((result) => {
        if (!result) {
          return;
        }

        lastIngestedFingerprint = fingerprint;

        if (import.meta.env.DEV) {
          console.info(
            `[RAG] Resume ingestion complete: ${result.chunkCount} chunks for session ${result.sessionId}`,
          );
        }
      })
      .catch((error) => {
        if (import.meta.env.DEV) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn("[RAG] Resume ingestion failed:", message);
        }
      });
  }, INGEST_DEBOUNCE_MS);
}

/** @internal Test helper to reset debounce state between unit tests. */
export function resetResumeIngestionScheduleState(): void {
  if (ingestTimer) {
    clearTimeout(ingestTimer);
    ingestTimer = null;
  }
  lastIngestedFingerprint = "";
}

export { getSessionId as getResumeSessionId };
