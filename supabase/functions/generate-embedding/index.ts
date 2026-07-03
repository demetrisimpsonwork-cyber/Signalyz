import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createServerEmbeddingProvider,
  EmbeddingConfigError,
  EmbeddingProviderError,
} from "../_shared/embeddingProviders.ts";
import {
  DAILY_EMBEDDING_LIMIT,
  getEmbeddingUsageCount,
  incrementEmbeddingUsage,
} from "../_shared/entitlements.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type ErrorCode =
  | "UNAUTHORIZED"
  | "MISSING_TEXT"
  | "CONFIG_ERROR"
  | "PROVIDER_ERROR"
  | "RATE_LIMIT"
  | "INTERNAL_ERROR";

function makeRequestId(): string {
  return crypto.randomUUID();
}

function errorResponse(
  requestId: string,
  status: number,
  errorCode: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
) {
  return new Response(
    JSON.stringify({
      status: "error",
      request_id: requestId,
      error_code: errorCode,
      message,
      ...(details ? { details } : {}),
    }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}

function successResponse(
  requestId: string,
  payload: { embedding?: number[]; embeddings?: number[][] },
) {
  return new Response(
    JSON.stringify({
      status: "success",
      request_id: requestId,
      ...payload,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}

function normalizeTexts(body: Record<string, unknown>): string[] | null {
  if (typeof body.text === "string") {
    return [body.text];
  }

  if (Array.isArray(body.texts)) {
    return body.texts.filter((value): value is string => typeof value === "string");
  }

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = makeRequestId();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse(requestId, 401, "UNAUTHORIZED", "Authentication required.");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));

    if (userError || !user) {
      return errorResponse(requestId, 401, "UNAUTHORIZED", "Authentication required.");
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const usageDate = new Date().toISOString().slice(0, 10);
    const embeddingUsage = await getEmbeddingUsageCount(serviceClient, user.id, usageDate);
    if (embeddingUsage >= DAILY_EMBEDDING_LIMIT) {
      return errorResponse(
        requestId,
        429,
        "RATE_LIMIT",
        "Daily embedding limit reached. Please try again tomorrow.",
      );
    }

    const body = await req.json().catch(() => ({}));
    const texts = normalizeTexts(body);

    if (!texts || texts.length === 0) {
      return errorResponse(
        requestId,
        400,
        "MISSING_TEXT",
        "Provide a non-empty `text` string or a non-empty `texts` array.",
      );
    }

    const provider = createServerEmbeddingProvider();
    const embeddings = await provider.embed(texts);
    await incrementEmbeddingUsage(serviceClient, user.id, usageDate);

    if (embeddings.length === 1 && texts.length === 1 && typeof body.text === "string") {
      return successResponse(requestId, { embedding: embeddings[0] });
    }

    return successResponse(requestId, { embeddings });
  } catch (error) {
    if (error instanceof EmbeddingConfigError) {
      console.error(
        JSON.stringify({
          request_id: requestId,
          function: "generate-embedding",
          error_code: "CONFIG_ERROR",
          message: error.message,
        }),
      );
      return errorResponse(requestId, 500, "CONFIG_ERROR", "Embedding service is not configured.");
    }

    if (error instanceof EmbeddingProviderError) {
      console.error(
        JSON.stringify({
          request_id: requestId,
          function: "generate-embedding",
          error_code: "PROVIDER_ERROR",
          message: error.message,
        }),
      );
      return errorResponse(requestId, 502, "PROVIDER_ERROR", "Embedding provider temporarily unavailable.");
    }

    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("At least one text input") || message.includes("non-empty")) {
      return errorResponse(requestId, 400, "MISSING_TEXT", message);
    }

    console.error(
      JSON.stringify({
        request_id: requestId,
        function: "generate-embedding",
        error_code: "INTERNAL_ERROR",
        message,
      }),
    );

    return errorResponse(
      requestId,
      500,
      "INTERNAL_ERROR",
      "Embedding generation failed unexpectedly.",
    );
  }
});
