/**
 * Google Analytics 4 (gtag) bridge — optional, never blocks UX.
 * Configured in index.html with measurement ID G-JJYNZ2ZB0J.
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

/** Send a GA4 event when gtag is available (browser only). */
export function sendGa4Event(event: string, params: Record<string, unknown> = {}): void {
  try {
    if (typeof window === "undefined" || typeof window.gtag !== "function") return;
    window.gtag("event", event, params);
  } catch {
    // Analytics must never throw
  }
}
