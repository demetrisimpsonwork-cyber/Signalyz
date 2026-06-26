/**
 * Resilient Edge Function invocation that survives tab-switching / backgrounding.
 *
 * The browser can cancel in-flight fetch requests when a tab is backgrounded.
 * This module stores the active promise globally so:
 *   1. If the user switches away and comes back, we return the same promise.
 *   2. The request is never re-triggered or orphaned.
 *   3. "Failed to send a request to the Edge Function" is caught and translated
 *      to a user-friendly message.
 */

import { supabase } from "@/integrations/supabase/client";

interface InFlightEntry {
  promise: Promise<{ data: any; error: any }>;
  startedAt: number;
}

// Global map keyed by a caller-chosen id (e.g. "alignment", "director", "assembly")
const inFlight = new Map<string, InFlightEntry>();

const TAB_SWITCH_ERRORS = [
  "failed to send a request",
  "failed to fetch",
  "load failed",
  "network error",
  "networkerror",
  "http: 0",
  "the operation was aborted",
  "aborted",
];

function isTabSwitchError(err: any): boolean {
  const msg = (err?.message || err?.toString?.() || "").toLowerCase();
  return TAB_SWITCH_ERRORS.some((e) => msg.includes(e));
}

export const FRIENDLY_FAIL_MSG =
  "Generation took longer than expected. Tap to retry.";

/** Structured error from edge function with debug info */
export class StructuredEdgeError extends Error {
  error_code: string;
  request_id?: string;
  http_status?: number;
  debug?: { step?: string; details?: string };
  constructor(
    payload: {
      error_code?: string;
      message?: string;
      request_id?: string;
      debug?: { step?: string; details?: string };
    },
    httpStatus?: number,
  ) {
    super(payload.message || payload.error_code || "Unknown error");
    this.error_code = payload.error_code || "UNKNOWN";
    this.request_id = payload.request_id;
    this.http_status = httpStatus;
    this.debug = payload.debug;
  }

  /** User-facing assembly error with HTTP status, request_id, and stage when available */
  formatAssemblyMessage(): string {
    const lines: string[] = [];
    if (this.message) lines.push(this.message);
    if (this.http_status) lines.push(`HTTP ${this.http_status}`);
    if (this.request_id) lines.push(`request_id: ${this.request_id}`);
    if (this.debug?.step) lines.push(`stage: ${this.debug.step}`);
    if (this.debug?.details) lines.push(this.debug.details);
    return lines.join("\n");
  }
}

/**
 * Invoke an edge function resiliently.
 *
 * @param key   Unique key for de-duplication (e.g. "alignment")
 * @param name  Edge function name
 * @param body  JSON body
 * @param timeoutMs  Hard timeout (default 90s)
 * @returns  The data payload on success
 * @throws  Error with a user-friendly message on failure
 */
export async function invokeResilient(
  key: string,
  name: string,
  body: Record<string, any>,
  timeoutMs = 90_000,
): Promise<any> {
  // If there's already an in-flight request for this key, rejoin it
  const existing = inFlight.get(key);
  if (existing) {
    const age = Date.now() - existing.startedAt;
    if (age < timeoutMs + 5_000) {
      // Still potentially alive — rejoin
      const { data, error } = await existing.promise;
      inFlight.delete(key);
      if (error) throw await enrichFunctionsError(error);
      if (data?.status === "error")
        throw new StructuredEdgeError(data);
      return data;
    }
    // Stale — remove and start fresh
    inFlight.delete(key);
  }

  // Fire the request and store promise globally so it survives unmounts
  const promise = supabase.functions.invoke(name, { body });
  inFlight.set(key, { promise, startedAt: Date.now() });

  // Hard timeout race
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("__TIMEOUT__")), timeoutMs),
  );

  try {
    const { data, error } = await Promise.race([promise, timeout]) as { data: any; error: any };
    inFlight.delete(key);
    if (error) {
      throw await enrichFunctionsError(error);
    }
    if (data?.status === "error") {
      throw new StructuredEdgeError(data);
    }
    return data;
  } catch (err: any) {
    inFlight.delete(key);
    if (err instanceof StructuredEdgeError) throw err;
    if (err.message === "__TIMEOUT__") throw new Error(FRIENDLY_FAIL_MSG);
    throw coerce(err);
  }
}

/** Returns true if a request with this key is currently in-flight */
export function isInFlight(key: string): boolean {
  return inFlight.has(key);
}

/** Drop a stale in-flight entry so a fresh invoke can start (e.g. explicit Re-Assemble) */
export function clearInFlight(key: string): void {
  inFlight.delete(key);
}

async function enrichFunctionsError(err: any): Promise<Error> {
  if (err?.name === "FunctionsHttpError" && err?.context instanceof Response) {
    const response = err.context as Response;
    const httpStatus = response.status;
    let bodyText = "";
    try {
      bodyText = await response.text();
    } catch {
      // ignore read failures
    }
    if (bodyText) {
      try {
        const parsed = JSON.parse(bodyText);
        if (parsed?.status === "error") {
          return new StructuredEdgeError(parsed, httpStatus);
        }
        const msg = parsed?.message || parsed?.error || bodyText.slice(0, 300);
        const synthetic = new StructuredEdgeError(
          {
            error_code: parsed?.error_code || "EDGE_ERROR",
            message: msg,
            request_id: parsed?.request_id,
            debug: parsed?.debug,
          },
          httpStatus,
        );
        return synthetic;
      } catch (e) {
        if (e instanceof StructuredEdgeError) return e;
      }
      const fallback = new StructuredEdgeError(
        { error_code: "EDGE_ERROR", message: bodyText.slice(0, 300) },
        httpStatus,
      );
      return fallback;
    }
    const statusOnly = new StructuredEdgeError(
      { error_code: "EDGE_ERROR", message: err.message || "Edge function failed" },
      httpStatus,
    );
    return statusOnly;
  }
  return coerce(err);
}

function coerce(err: any): Error {
  if (isTabSwitchError(err)) return new Error(FRIENDLY_FAIL_MSG);
  if (err instanceof Error) return err;
  return new Error(
    typeof err === "object" ? JSON.stringify(err).slice(0, 300) : String(err),
  );
}
