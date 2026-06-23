export { chunkText } from "./chunkText";
export { chunkResumeSections } from "./chunkResumeSections";
export {
  formatEmbeddingForPg,
  getEmbeddingProvider,
  PlaceholderEmbeddingProvider,
  resetEmbeddingProvider,
  setEmbeddingProvider,
  type EmbeddingProvider,
} from "./embeddingClient";
export {
  createEdgeFunctionEmbeddingProvider,
  EdgeFunctionEmbeddingProvider,
  EmbeddingServiceError,
} from "./edgeEmbeddingProvider";
export { retrieveRelevantEvidence, saveDocumentChunks } from "./documentChunks";
export {
  ingestResumeDocument,
  retrieveResumeEvidence,
  resetResumeIngestionScheduleState,
  scheduleResumeIngestion,
  getResumeSessionId,
} from "./resumeIngestion";
export type {
  ChunkTextOptions,
  DocumentChunkMatch,
  DocumentChunkMetadata,
  EmbeddingVector,
  IngestResumeDocumentParams,
  IngestResumeDocumentResult,
  ResumeEvidenceMatch,
  RetrieveRelevantEvidenceParams,
  RetrieveRelevantEvidenceResult,
  SaveDocumentChunksParams,
  SaveDocumentChunksResult,
  TextChunk,
} from "./types";
export { EMBEDDING_DIMENSION } from "./types";
export type { ResumeSectionKind } from "./chunkResumeSections";
export {
  extractPrimaryResumeBullet,
  buildCalibrationEvidenceQueries,
  retrieveCalibrationEvidencePackage,
  type EvidencePackageItem,
  type CalibratedBulletRecord,
  type GroundingStatus,
} from "./groundedCalibrationClient";
