import { useCallback, useEffect, useState } from "react";
import {
  buildReportRunInvokeFields,
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
  const [reportRunFields, setReportRunFields] = useState<ReportRunInvokeFields | null>(null);

  useEffect(() => {
    if (!userId || !resume || !jd) {
      setActiveRunMatch(false);
      setReportRunFields(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const fields = await buildReportRunInvokeFields(userId, resume, jd);
        const active = await isActiveReportRunForInputs(userId, resume, jd);
        if (!cancelled) {
          setReportRunFields(fields);
          setActiveRunMatch(active);
        }
      } catch (err) {
        logReportRunAccessWarning("session lookup", err);
        if (!cancelled) {
          setReportRunFields(null);
          setActiveRunMatch(false);
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

  return { activeRunMatch, reportRunFields, rememberActiveRun };
}
