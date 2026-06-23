import { EMBEDDING_DIMENSION, type EmbeddingVector } from "./types";

export interface EmbeddingProvider {
  readonly dimension: typeof EMBEDDING_DIMENSION;
  readonly name: string;
  embed(texts: readonly string[]): Promise<EmbeddingVector[]>;
  embedOne(text: string): Promise<EmbeddingVector>;
}

export class PlaceholderEmbeddingProvider implements EmbeddingProvider {
  readonly dimension = EMBEDDING_DIMENSION;
  readonly name = "placeholder";

  embed(_texts: readonly string[]): Promise<EmbeddingVector[]> {
    return Promise.reject(
      new Error(
        "Embedding provider not configured. Call setEmbeddingProvider(createEdgeFunctionEmbeddingProvider()) for production or inject a test provider.",
      ),
    );
  }

  embedOne(_text: string): Promise<EmbeddingVector> {
    return Promise.reject(
      new Error(
        "Embedding provider not configured. Call setEmbeddingProvider(createEdgeFunctionEmbeddingProvider()) for production or inject a test provider.",
      ),
    );
  }
}

let activeProvider: EmbeddingProvider = new PlaceholderEmbeddingProvider();

export function getEmbeddingProvider(): EmbeddingProvider {
  return activeProvider;
}

export function setEmbeddingProvider(provider: EmbeddingProvider): void {
  if (provider.dimension !== EMBEDDING_DIMENSION) {
    throw new Error(
      `Embedding provider dimension ${provider.dimension} does not match expected ${EMBEDDING_DIMENSION}.`,
    );
  }

  activeProvider = provider;
}

export function resetEmbeddingProvider(): void {
  activeProvider = new PlaceholderEmbeddingProvider();
}

/** Serializes a float vector for pgvector columns via PostgREST. */
export function formatEmbeddingForPg(vector: readonly number[]): string {
  if (vector.length !== EMBEDDING_DIMENSION) {
    throw new Error(
      `Expected embedding length ${EMBEDDING_DIMENSION}, received ${vector.length}.`,
    );
  }

  return `[${vector.join(",")}]`;
}
