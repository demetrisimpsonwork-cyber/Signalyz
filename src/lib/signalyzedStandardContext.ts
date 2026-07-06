import type {
  AstShadowSummary,
  BulletPreservationSummary,
  ExportValidationSummary,
  LinkPreservationSummary,
  QaShadowSummary,
} from "@/lib/signalyzedStandard/types";

export interface SignalyzedSourceReportsBundle {
  ast?: AstShadowSummary | null;
  qa?: QaShadowSummary | null;
  link?: LinkPreservationSummary | null;
  bullet?: BulletPreservationSummary | null;
  docxExport?: ExportValidationSummary | null;
}

const byRequestId = new Map<string, SignalyzedSourceReportsBundle>();
let latestBundle: SignalyzedSourceReportsBundle = {};

function mergeBundle(
  existing: SignalyzedSourceReportsBundle,
  partial: SignalyzedSourceReportsBundle,
): SignalyzedSourceReportsBundle {
  return {
    ast: partial.ast ?? existing.ast,
    qa: partial.qa ?? existing.qa,
    link: partial.link ?? existing.link,
    bullet: partial.bullet ?? existing.bullet,
    docxExport: partial.docxExport ?? existing.docxExport,
  };
}

/** Remember sanitized shadow reports for later export evaluation. */
export function rememberSignalyzedSourceReports(
  requestId: string | undefined,
  partial: SignalyzedSourceReportsBundle,
): void {
  latestBundle = mergeBundle(latestBundle, partial);
  if (requestId) {
    byRequestId.set(requestId, mergeBundle(byRequestId.get(requestId) ?? {}, partial));
  }
}

export function getSignalyzedSourceReports(requestId?: string): SignalyzedSourceReportsBundle {
  if (requestId && byRequestId.has(requestId)) {
    return byRequestId.get(requestId)!;
  }
  return latestBundle;
}

/** Test helper — reset in-memory cache. */
export function clearSignalyzedSourceReportsCache(): void {
  byRequestId.clear();
  latestBundle = {};
}
