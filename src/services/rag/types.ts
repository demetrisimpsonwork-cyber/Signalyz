/** Matches OpenAI text-embedding-3-small / ada-002 dimension. */
export const EMBEDDING_DIMENSION = 1536 as const;

export type EmbeddingVector = number[];

export interface TextChunk {
  index: number;
  content: string;
  /** Per-chunk metadata merged with document-level metadata on save. */
  metadata?: DocumentChunkMetadata;
}

export interface ChunkTextOptions {
  /** Target maximum characters per chunk. Default: 1000 */
  maxChunkSize?: number;
  /** Overlap between consecutive chunks in characters. Default: 200 */
  chunkOverlap?: number;
}

export type DocumentChunkMetadata = Record<string, unknown>;

export interface SaveDocumentChunksParams {
  documentId: string;
  chunks: TextChunk[];
  /** Applied to every stored chunk unless overridden per chunk. */
  metadata?: DocumentChunkMetadata;
}

export interface SaveDocumentChunksResult {
  documentId: string;
  chunkCount: number;
}

export interface RetrieveRelevantEvidenceParams {
  query: string;
  matchCount?: number;
  matchThreshold?: number;
}

export interface DocumentChunkMatch {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  metadata: DocumentChunkMetadata;
  similarity: number;
}

export interface RetrieveRelevantEvidenceResult {
  query: string;
  matches: DocumentChunkMatch[];
}

export interface ResumeEvidenceMatch {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  similarity: number;
  metadata: DocumentChunkMetadata;
}

export interface IngestResumeDocumentParams {
  resumeText: string;
  sessionId: string;
  source?: "paste" | "pdf" | "docx";
}

export interface IngestResumeDocumentResult extends SaveDocumentChunksResult {
  sessionId: string;
}
