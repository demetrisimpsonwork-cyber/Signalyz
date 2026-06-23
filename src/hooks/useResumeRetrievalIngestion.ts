import { useEffect } from "react";
import type { ResumeInputSource } from "@/components/ResumeUpload";
import { getResumeSessionId, scheduleResumeIngestion } from "@/services/rag";

/**
 * Silently indexes parsed resume text for retrieval after intake completes.
 * No UI impact — skips anonymous sessions inside the ingestion service.
 */
export function useResumeRetrievalIngestion(
  resumeText: string,
  source: ResumeInputSource = "paste",
): void {
  useEffect(() => {
    scheduleResumeIngestion(resumeText, getResumeSessionId(), source);
  }, [resumeText, source]);
}
