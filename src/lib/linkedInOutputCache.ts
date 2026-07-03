/**
 * LinkedIn output localStorage cache with analysis-run fingerprint validation.
 */

import {
  buildAnalysisRunFingerprint,
  fingerprintsMatch,
  type AnalysisRunFingerprint,
} from "@/lib/analysisRunFingerprint";

export const LINKEDIN_OUTPUT_STORAGE_KEY = "signalyz_linkedin_output";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface LinkedInOutputData {
  headline: { headline: string; signal_basis: string } | null;
  aboutGuidance: Array<{ gap_addressed: string; suggestion: string; resume_evidence: string }> | null;
  experienceNotes: Array<{ role_title: string; company: string; note: string }> | null;
}

interface StoredLinkedInCache {
  v: 2;
  ts: number;
  fingerprint: AnalysisRunFingerprint;
  headline: LinkedInOutputData["headline"];
  aboutGuidance: LinkedInOutputData["aboutGuidance"];
  experienceNotes: LinkedInOutputData["experienceNotes"];
}

export function clearLinkedInOutputCache(): void {
  try {
    localStorage.removeItem(LINKEDIN_OUTPUT_STORAGE_KEY);
  } catch {}
}

export function saveLinkedInOutputCache(
  output: LinkedInOutputData,
  params: { jdText?: string; resumeText?: string; runSessionKey?: string },
): void {
  try {
    const payload: StoredLinkedInCache = {
      v: 2,
      ts: Date.now(),
      fingerprint: buildAnalysisRunFingerprint(params),
      headline: output.headline,
      aboutGuidance: output.aboutGuidance,
      experienceNotes: output.experienceNotes,
    };
    localStorage.setItem(LINKEDIN_OUTPUT_STORAGE_KEY, JSON.stringify(payload));
  } catch {}
}

export function loadLinkedInOutputCache(params: {
  jdText?: string;
  resumeText?: string;
  runSessionKey?: string;
}): LinkedInOutputData | null {
  try {
    const raw = localStorage.getItem(LINKEDIN_OUTPUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredLinkedInCache>;
    if (!parsed || parsed.v !== 2 || !parsed.fingerprint) {
      clearLinkedInOutputCache();
      return null;
    }
    if (Date.now() - (parsed.ts || 0) > CACHE_TTL_MS) {
      clearLinkedInOutputCache();
      return null;
    }
    const current = buildAnalysisRunFingerprint(params);
    if (!fingerprintsMatch(parsed.fingerprint, current)) {
      clearLinkedInOutputCache();
      return null;
    }
    return {
      headline: parsed.headline || null,
      aboutGuidance: parsed.aboutGuidance || null,
      experienceNotes: parsed.experienceNotes || null,
    };
  } catch {
    clearLinkedInOutputCache();
    return null;
  }
}
