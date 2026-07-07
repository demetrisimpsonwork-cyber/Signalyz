/**
 * Client session helpers for canonical one-time report run fingerprints.
 * Server remains source of truth; local state avoids mid-run paywall confusion.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  buildReportRunFingerprint,
  normalizeReportRunText,
} from "../../supabase/functions/_shared/reportRunFingerprint.ts";

const STORAGE_KEY = "signalyz_active_report_run_v1";
const STORAGE_PROBE_KEY = "__signalyz_report_run_probe__";
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

/** Coerce unknown input to trimmed text without throwing during render. */
export function safeTrimText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  try {
    return String(value).trim();
  } catch {
    return "";
  }
}

function isSessionStorageAvailable(): boolean {
  try {
    if (typeof sessionStorage === "undefined") return false;
    sessionStorage.setItem(STORAGE_PROBE_KEY, "1");
    sessionStorage.removeItem(STORAGE_PROBE_KEY);
    return true;
  } catch {
    return false;
  }
}

function parseStoredActiveRun(raw: string): StoredActiveReportRun | null {
  try {
    const parsed = JSON.parse(raw) as Partial<StoredActiveReportRun>;
    if (
      typeof parsed?.fingerprint !== "string" ||
      !parsed.fingerprint ||
      typeof parsed.userId !== "string" ||
      !parsed.userId ||
      typeof parsed.expiresAt !== "number" ||
      !Number.isFinite(parsed.expiresAt)
    ) {
      return null;
    }
    return {
      fingerprint: parsed.fingerprint,
      userId: parsed.userId,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

function readStored(): StoredActiveReportRun | null {
  if (!isSessionStorageAvailable()) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = parseStoredActiveRun(raw);
    if (!parsed) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
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
  if (!isSessionStorageAvailable()) return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function rememberActiveReportRun(userId: string, fingerprint: string): void {
  if (!userId || !fingerprint || !isSessionStorageAvailable()) return;
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
  originalResumeText: unknown,
  jdText: unknown,
): Promise<ReportRunInvokeFields | null> {
  try {
    const resume = safeTrimText(originalResumeText);
    const jd = safeTrimText(jdText);
    if (!userId || !resume || !jd) return null;
    if (
      normalizeReportRunText(resume).length < 100 ||
      normalizeReportRunText(jd).length < 20
    ) {
      return null;
    }
    const reportRunFingerprint = await buildReportRunFingerprint(userId, resume, jd);
    if (!reportRunFingerprint) return null;
    return { originalResumeText: resume, jdText: jd, reportRunFingerprint };
  } catch {
    return null;
  }
}

export async function rememberActiveReportRunForInputs(
  userId: string,
  originalResumeText: unknown,
  jdText: unknown,
): Promise<string | null> {
  try {
    const fields = await buildReportRunInvokeFields(userId, originalResumeText, jdText);
    if (!fields?.reportRunFingerprint) return null;
    rememberActiveReportRun(userId, fields.reportRunFingerprint);
    return fields.reportRunFingerprint;
  } catch {
    return null;
  }
}

/**
 * Returns true when the signed-in user already redeemed a $9 credit for this fingerprint.
 * RLS restricts reads to auth.uid() = user_id — no userId filter required in the query.
 */
export async function hasRedeemedReportRunForFingerprint(
  runFingerprint: string,
): Promise<boolean> {
  const fingerprint = runFingerprint?.trim();
  if (!fingerprint) return false;
  try {
    const { data, error } = await supabase
      .from("one_time_report_redemptions")
      .select("id")
      .eq("run_fingerprint", fingerprint)
      .maybeSingle();
    if (error) {
      if (import.meta.env.DEV) {
        console.warn("[reportRunSession] redemption lookup failed:", error.message);
      }
      return false;
    }
    return !!data?.id;
  } catch {
    return false;
  }
}

export async function isActiveReportRunForInputs(
  userId: string,
  originalResumeText: unknown,
  jdText: unknown,
): Promise<boolean> {
  try {
    const stored = readStored();
    if (!stored || stored.userId !== userId) return false;
    const fields = await buildReportRunInvokeFields(userId, originalResumeText, jdText);
    if (!fields?.reportRunFingerprint) return false;
    return stored.fingerprint === fields.reportRunFingerprint;
  } catch {
    return false;
  }
}

export function withReportRunFields<T extends Record<string, unknown>>(
  body: T,
  fields: ReportRunInvokeFields | null | undefined,
): T & Partial<ReportRunInvokeFields> {
  if (!fields) return body;
  const resume = safeTrimText(fields.originalResumeText);
  const jd = safeTrimText(fields.jdText);
  if (!resume || !jd) return body;
  return {
    ...body,
    originalResumeText: resume,
    jdText: jd,
    ...(fields.reportRunFingerprint
      ? { reportRunFingerprint: fields.reportRunFingerprint }
      : {}),
  };
}
