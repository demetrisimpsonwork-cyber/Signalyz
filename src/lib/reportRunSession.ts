/**
 * Client session helpers for canonical one-time report run fingerprints.
 * Server remains source of truth; local state avoids mid-run paywall confusion.
 */

import {
  buildReportRunFingerprint,
  normalizeReportRunText,
} from "../../supabase/functions/_shared/reportRunFingerprint.ts";

const STORAGE_KEY = "signalyz_active_report_run_v1";
const TTL_MS = 24 * 60 * 60 * 1000;

export interface ReportRunInvokeFields {
  originalResumeText: string;
  jdText: string;
  reportRunFingerprint?: string;
}

interface StoredActiveReportRun {
  fingerprint: string;
  userId: string;
  expiresAt: number;
}

function readStored(): StoredActiveReportRun | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredActiveReportRun;
    if (!parsed?.fingerprint || !parsed.userId || !parsed.expiresAt) return null;
    if (Date.now() > parsed.expiresAt) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearActiveReportRun(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function rememberActiveReportRun(userId: string, fingerprint: string): void {
  if (!userId || !fingerprint) return;
  try {
    const payload: StoredActiveReportRun = {
      fingerprint,
      userId,
      expiresAt: Date.now() + TTL_MS,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export async function buildReportRunInvokeFields(
  userId: string,
  originalResumeText: string,
  jdText: string,
): Promise<ReportRunInvokeFields | null> {
  const resume = originalResumeText?.trim() ?? "";
  const jd = jdText?.trim() ?? "";
  if (!userId || !resume || !jd) return null;
  if (normalizeReportRunText(resume).length < 100 || normalizeReportRunText(jd).length < 20) {
    return null;
  }
  const reportRunFingerprint = await buildReportRunFingerprint(userId, resume, jd);
  return { originalResumeText: resume, jdText: jd, reportRunFingerprint };
}

export async function rememberActiveReportRunForInputs(
  userId: string,
  originalResumeText: string,
  jdText: string,
): Promise<string | null> {
  const fields = await buildReportRunInvokeFields(userId, originalResumeText, jdText);
  if (!fields?.reportRunFingerprint) return null;
  rememberActiveReportRun(userId, fields.reportRunFingerprint);
  return fields.reportRunFingerprint;
}

export async function isActiveReportRunForInputs(
  userId: string,
  originalResumeText: string,
  jdText: string,
): Promise<boolean> {
  const stored = readStored();
  if (!stored || stored.userId !== userId) return false;
  const fields = await buildReportRunInvokeFields(userId, originalResumeText, jdText);
  if (!fields?.reportRunFingerprint) return false;
  return stored.fingerprint === fields.reportRunFingerprint;
}

export function withReportRunFields<T extends Record<string, unknown>>(
  body: T,
  fields: ReportRunInvokeFields | null | undefined,
): T & Partial<ReportRunInvokeFields> {
  if (!fields?.originalResumeText || !fields?.jdText) return body;
  return {
    ...body,
    originalResumeText: fields.originalResumeText,
    jdText: fields.jdText,
    ...(fields.reportRunFingerprint
      ? { reportRunFingerprint: fields.reportRunFingerprint }
      : {}),
  };
}
