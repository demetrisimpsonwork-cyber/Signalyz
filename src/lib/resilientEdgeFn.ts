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
      if (error) throw coerce(error);
      if (data?.status === "error")
        throw new Error(data.message || data.error || FRIENDLY_FAIL_MSG);
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
      // Try to extract structured error from non-2xx response body
      if (typeof error === "object" && error?.context?.body) {
        try {
          const parsed = JSON.parse(error.context.body);
          if (parsed?.status === "error") {
            throw new StructuredEdgeError(parsed);
          }
        } catch (e) {
          if (e instanceof StructuredEdgeError) throw e;
        }
      }
      throw coerce(error);
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

function coerce(err: any): Error {
  if (isTabSwitchError(err)) return new Error(FRIENDLY_FAIL_MSG);
  if (err instanceof Error) return err;
  return new Error(
    typeof err === "object" ? JSON.stringify(err).slice(0, 300) : String(err),
  );
}
