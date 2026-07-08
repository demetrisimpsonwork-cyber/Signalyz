const STORAGE_KEY = "signalyz_history_handoff_v1";

export interface HistoryAnalyzeHandoff {
  resume_text: string;
  jd_text: string;
}

export function setHistoryAnalyzeHandoff(payload: HistoryAnalyzeHandoff): void {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        resume_text: payload.resume_text,
        jd_text: payload.jd_text,
        ts: Date.now(),
      }),
    );
  } catch {
    // ignore storage failures
  }
}

export function consumeHistoryAnalyzeHandoff(): HistoryAnalyzeHandoff | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const resume_text = typeof parsed.resume_text === "string" ? parsed.resume_text : "";
    const jd_text = typeof parsed.jd_text === "string" ? parsed.jd_text : "";
    if (!resume_text.trim() || !jd_text.trim()) return null;
    return { resume_text, jd_text };
  } catch {
    return null;
  }
}
