import { supabase } from "@/integrations/supabase/client";
import { EMBEDDING_DIMENSION, type EmbeddingVector } from "./types";
import type { EmbeddingProvider } from "./embeddingClient";

type EmbeddingErrorCode =
  | "EDGE_INVOKE_ERROR"
  | "UNAUTHORIZED"
  | "MISSING_TEXT"
  | "CONFIG_ERROR"
  | "PROVIDER_ERROR"
  | "INTERNAL_ERROR"
  | "INVALID_RESPONSE";

export class EmbeddingServiceError extends Error {
  readonly code: EmbeddingErrorCode;

  constructor(code: EmbeddingErrorCode, message: string) {
    super(message);
    this.name = "EmbeddingServiceError";
    this.code = code;
  }
}

interface EmbeddingSuccessResponse {
  status: "success";
  embedding?: number[];
  embeddings?: number[][];
}

interface EmbeddingErrorResponse {
  status?: "error";
  error_code?: EmbeddingErrorCode;
  message?: string;
}

function assertEmbeddingDimension(vector: number[], label: string): EmbeddingVector {
  if (vector.length !== EMBEDDING_DIMENSION) {
    throw new EmbeddingServiceError(
      "INVALID_RESPONSE",
      `${label} returned ${vector.length} dimensions; expected ${EMBEDDING_DIMENSION}.`,
    );
  }

  return vector;
}

function mapEdgeError(data: EmbeddingErrorResponse | null, invokeError: Error | null): never {
  if (invokeError) {
    throw new EmbeddingServiceError(
      "EDGE_INVOKE_ERROR",
      invokeError.message || "Failed to invoke generate-embedding edge function.",
    );
  }

  const code = (data?.error_code ?? "PROVIDER_ERROR") as EmbeddingErrorCode;
  throw new EmbeddingServiceError(code, data?.message || "Embedding generation failed.");
}

/**
 * Production embedding provider that calls the generate-embedding edge function.
 * API keys stay server-side; the browser only sends text input.
 */
export class EdgeFunctionEmbeddingProvider implements EmbeddingProvider {
  readonly dimension = EMBEDDING_DIMENSION;
  readonly name = "edge-function";

  async embedOne(text: string): Promise<EmbeddingVector> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new EmbeddingServiceError("MISSING_TEXT", "Text input is required.");
    }

    const { data, error } = await supabase.functions.invoke("generate-embedding", {
      body: { text: trimmed },
    });

    const payload = data as EmbeddingSuccessResponse | EmbeddingErrorResponse | null;
    if (error || payload?.status === "error" || payload?.error_code) {
      mapEdgeError(payload, error);
    }

    if (!payload?.embedding || !Array.isArray(payload.embedding)) {
      throw new EmbeddingServiceError(
        "INVALID_RESPONSE",
        "generate-embedding returned an invalid single-embedding payload.",
      );
    }

    return assertEmbeddingDimension(payload.embedding, "generate-embedding");
  }

  async embed(texts: readonly string[]): Promise<EmbeddingVector[]> {
    if (texts.length === 0) {
      throw new EmbeddingServiceError("MISSING_TEXT", "At least one text input is required.");
    }

    const normalized = texts.map((text) => text.trim());
    if (normalized.some((text) => text.length === 0)) {
      throw new EmbeddingServiceError("MISSING_TEXT", "All text inputs must be non-empty.");
    }

    const { data, error } = await supabase.functions.invoke("generate-embedding", {
      body: { texts: normalized },
    });

    const payload = data as EmbeddingSuccessResponse | EmbeddingErrorResponse | null;
    if (error || payload?.status === "error" || payload?.error_code) {
      mapEdgeError(payload, error);
    }

    if (!payload?.embeddings || !Array.isArray(payload.embeddings)) {
      throw new EmbeddingServiceError(
        "INVALID_RESPONSE",
        "generate-embedding returned an invalid batch embedding payload.",
      );
    }

    if (payload.embeddings.length !== normalized.length) {
      throw new EmbeddingServiceError(
        "INVALID_RESPONSE",
        `Expected ${normalized.length} embeddings, received ${payload.embeddings.length}.`,
      );
    }

    return payload.embeddings.map((embedding, index) =>
      assertEmbeddingDimension(embedding, `generate-embedding[${index}]`),
    );
  }
}

/** Factory for the secure server-side embedding provider. */
export function createEdgeFunctionEmbeddingProvider(): EdgeFunctionEmbeddingProvider {
  return new EdgeFunctionEmbeddingProvider();
}
