import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  formatEmbeddingForPg,
  getEmbeddingProvider,
  type EmbeddingProvider,
} from "./embeddingClient";
import type {
  DocumentChunkMatch,
  DocumentChunkMetadata,
  RetrieveRelevantEvidenceParams,
  RetrieveRelevantEvidenceResult,
  SaveDocumentChunksParams,
  SaveDocumentChunksResult,
} from "./types";

function toMetadata(value: Json | null): DocumentChunkMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as DocumentChunkMetadata;
}

async function requireAuthenticatedUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw new Error(`Failed to resolve authenticated user: ${error.message}`);
  }

  if (!user) {
    throw new Error("Authentication required to access document chunks.");
  }

  return user.id;
}

/**
 * Embeds and stores document chunks for the current authenticated user.
 * Re-indexing a document replaces existing chunks for that document_id.
 */
export async function saveDocumentChunks(
  params: SaveDocumentChunksParams,
  provider: EmbeddingProvider = getEmbeddingProvider(),
): Promise<SaveDocumentChunksResult> {
  const userId = await requireAuthenticatedUserId();
  const { documentId, chunks, metadata = {} } = params;

  if (!documentId) {
    throw new Error("documentId is required.");
  }

  if (chunks.length === 0) {
    throw new Error("At least one chunk is required.");
  }

  const validChunks = chunks
    .map((chunk) => ({ ...chunk, content: chunk.content.trim() }))
    .filter((chunk) => chunk.content.length > 0);

  if (validChunks.length === 0) {
    throw new Error("All chunks were empty after trimming.");
  }

  const embeddings = await provider.embed(validChunks.map((chunk) => chunk.content));

  if (embeddings.length !== validChunks.length) {
    throw new Error(
      `Embedding provider returned ${embeddings.length} vectors for ${validChunks.length} chunks.`,
    );
  }

  const { error: deleteError } = await supabase
    .from("document_chunks")
    .delete()
    .eq("user_id", userId)
    .eq("document_id", documentId);

  if (deleteError) {
    throw new Error(`Failed to clear existing document chunks: ${deleteError.message}`);
  }

  const rows = validChunks.map((chunk, index) => ({
    user_id: userId,
    document_id: documentId,
    chunk_index: chunk.index,
    content: chunk.content.trim(),
    metadata: {
      ...metadata,
      ...(chunk.metadata ?? {}),
    } as Json,
    embedding: formatEmbeddingForPg(embeddings[index]),
  }));

  const { error: insertError } = await supabase.from("document_chunks").insert(rows);

  if (insertError) {
    throw new Error(`Failed to save document chunks: ${insertError.message}`);
  }

  return {
    documentId,
    chunkCount: rows.length,
  };
}

/**
 * Embeds a query and retrieves the most relevant stored chunks via match_document_chunks.
 */
export async function retrieveRelevantEvidence(
  params: RetrieveRelevantEvidenceParams,
  provider: EmbeddingProvider = getEmbeddingProvider(),
): Promise<RetrieveRelevantEvidenceResult> {
  const query = params.query.trim();
  if (!query) {
    throw new Error("query is required.");
  }

  const queryEmbedding = await provider.embedOne(query);

  const { data, error } = await supabase.rpc("match_document_chunks", {
    query_embedding: formatEmbeddingForPg(queryEmbedding),
    match_count: params.matchCount ?? 5,
    match_threshold: params.matchThreshold ?? 0.7,
  });

  if (error) {
    throw new Error(`Failed to retrieve relevant evidence: ${error.message}`);
  }

  const matches: DocumentChunkMatch[] = (data ?? []).map((row) => ({
    id: row.id,
    documentId: row.document_id,
    chunkIndex: row.chunk_index,
    content: row.content,
    metadata: toMetadata(row.metadata),
    similarity: row.similarity,
  }));

  return {
    query,
    matches,
  };
}
