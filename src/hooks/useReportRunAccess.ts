import { useCallback, useEffect, useState } from "react";
import {
  buildReportRunInvokeFields,
  isActiveReportRunForInputs,
  rememberActiveReportRunForInputs,
  type ReportRunInvokeFields,
} from "@/lib/reportRunSession";

export function useReportRunAccess(
  userId: string | undefined,
  originalResumeText: string,
  jdText: string,
) {
  const [activeRunMatch, setActiveRunMatch] = useState(false);
  const [reportRunFields, setReportRunFields] = useState<ReportRunInvokeFields | null>(null);

  useEffect(() => {
    if (!userId || !originalResumeText.trim() || !jdText.trim()) {
      setActiveRunMatch(false);
      setReportRunFields(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      const fields = await buildReportRunInvokeFields(userId, originalResumeText, jdText);
      const active = await isActiveReportRunForInputs(userId, originalResumeText, jdText);
      if (!cancelled) {
        setReportRunFields(fields);
        setActiveRunMatch(active);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, originalResumeText, jdText]);

  const rememberActiveRun = useCallback(async () => {
    if (!userId || !originalResumeText.trim() || !jdText.trim()) return;
    await rememberActiveReportRunForInputs(userId, originalResumeText, jdText);
    setActiveRunMatch(true);
  }, [userId, originalResumeText, jdText]);

  return { activeRunMatch, reportRunFields, rememberActiveRun };
}
