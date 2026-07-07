import { useCallback, useEffect, useState } from "react";
import {
  buildReportRunInvokeFields,
  hasRedeemedReportRunForFingerprint,
  isActiveReportRunForInputs,
  rememberActiveReportRunForInputs,
  safeTrimText,
  type ReportRunInvokeFields,
} from "@/lib/reportRunSession";

function logReportRunAccessWarning(context: string, err: unknown): void {
  const name = err instanceof Error ? err.name : "unknown";
  const message = err instanceof Error ? err.message : "lookup failed";
  if (import.meta.env.DEV) {
    console.warn(`[useReportRunAccess] ${context}:`, name, message);
  }
}

export function useReportRunAccess(
  userId: string | undefined,
  originalResumeText: unknown,
  jdText: unknown,
) {
  const resume = safeTrimText(originalResumeText);
  const jd = safeTrimText(jdText);
  const [activeRunMatch, setActiveRunMatch] = useState(false);
  const [hasRedeemedCurrentRun, setHasRedeemedCurrentRun] = useState(false);
  const [accessLookupPending, setAccessLookupPending] = useState(false);
  const [reportRunFields, setReportRunFields] = useState<ReportRunInvokeFields | null>(null);

  useEffect(() => {
    if (!userId || !resume || !jd) {
      setActiveRunMatch(false);
      setHasRedeemedCurrentRun(false);
      setReportRunFields(null);
      setAccessLookupPending(false);
      return;
    }

    let cancelled = false;
    setAccessLookupPending(true);

    void (async () => {
      try {
        const fields = await buildReportRunInvokeFields(userId, resume, jd);
        const active = await isActiveReportRunForInputs(userId, resume, jd);
        let redeemed = false;
        if (!active && fields?.reportRunFingerprint) {
          redeemed = await hasRedeemedReportRunForFingerprint(fields.reportRunFingerprint);
        }
        if (!cancelled) {
          setReportRunFields(fields);
          setActiveRunMatch(active);
          setHasRedeemedCurrentRun(redeemed);
          setAccessLookupPending(false);
        }
      } catch (err) {
        logReportRunAccessWarning("session lookup", err);
        if (!cancelled) {
          setReportRunFields(null);
          setActiveRunMatch(false);
          setHasRedeemedCurrentRun(false);
          setAccessLookupPending(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, resume, jd]);

  const rememberActiveRun = useCallback(async () => {
    if (!userId || !resume || !jd) return;
    try {
      await rememberActiveReportRunForInputs(userId, resume, jd);
      setActiveRunMatch(true);
    } catch (err) {
      logReportRunAccessWarning("remember active run", err);
    }
  }, [userId, resume, jd]);

  return {
    activeRunMatch,
    hasRedeemedCurrentRun,
    accessLookupPending,
    reportRunFields,
    rememberActiveRun,
  };
}

/** Mirrors Index.tsx paid-access gating for tests. */
export function computeEffectiveReportAccess(input: {
  isPro: boolean;
  isAdmin: boolean;
  hasOneTimeCredit: boolean;
  activeRunMatch: boolean;
  hasRedeemedCurrentRun: boolean;
}): boolean {
  return (
    input.isPro ||
    input.isAdmin ||
    input.hasOneTimeCredit ||
    input.activeRunMatch ||
    input.hasRedeemedCurrentRun
  );
}
