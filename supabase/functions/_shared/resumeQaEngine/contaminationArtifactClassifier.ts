import { normalizePhrase } from "./synonymGraph.ts";

/**
 * Root cause (Phase 3D): `calibratedResumeToPlainText()` places `City, ST` as the last
 * contact field immediately before the `Summary` section header. When
 * `extractContaminationCandidates()` flattened newlines, regex mining produced phantom
 * phrases like "NJ Summary Founding" and "IL Summary Customer" — parser/section artifacts,
 * not true cross-JD contamination.
 */
export type ContaminationSubtype =
  | "true_contamination"
  | "known_signature"
  | "section_artifact"
  | "location_artifact"
  | "summary_artifact"
  | "normal_resume_phrase"
  | "unclear";

export const RESUME_SECTION_LABELS = new Set([
  "experience",
  "education",
  "skills",
  "summary",
  "projects",
  "certifications",
  "core competencies",
]);

/** US state / territory abbreviations — lowercase normalized. */
export const US_STATE_ABBR = new Set([
  "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "id", "il", "in", "ia",
  "ks", "ky", "la", "me", "md", "ma", "mi", "mn", "ms", "mo", "mt", "ne", "nv", "nh", "nj",
  "nm", "ny", "nc", "nd", "oh", "ok", "or", "pa", "ri", "sc", "sd", "tn", "tx", "ut", "vt",
  "va", "wa", "wv", "wi", "wy", "dc",
]);

const NORMAL_RESUME_PHRASES = new Set([
  "professional summary",
  "core competencies",
  "full stack",
  "customer success",
  "customer service",
  "software engineer",
  "account manager",
]);

/** True when matched term is a known phantom from location + section header flattening. */
export function isLocationSummaryArtifactPhrase(phrase: string): boolean {
  const parts = normalizePhrase(phrase).split(" ").filter(Boolean);
  if (parts.length < 2) return false;
  if (!US_STATE_ABBR.has(parts[0]!) || !RESUME_SECTION_LABELS.has(parts[1]!)) return false;
  return true;
}

export function isSectionHeaderArtifactPhrase(phrase: string): boolean {
  const parts = normalizePhrase(phrase).split(" ").filter(Boolean);
  if (parts.length < 2) return false;
  if (!RESUME_SECTION_LABELS.has(parts[0]!)) return false;
  return true;
}

export function classifyContaminationPhrase(
  phrase: string,
  options?: { knownSignature?: boolean },
): ContaminationSubtype {
  if (options?.knownSignature) return "known_signature";

  const norm = normalizePhrase(phrase);
  const parts = norm.split(" ").filter(Boolean);

  if (isLocationSummaryArtifactPhrase(phrase)) {
    return parts.length === 2 ? "location_artifact" : "summary_artifact";
  }

  if (parts.length === 2 && parts[0]!.length <= 3 && RESUME_SECTION_LABELS.has(parts[1]!)) {
    return "location_artifact";
  }

  if (isSectionHeaderArtifactPhrase(phrase)) {
    return "section_artifact";
  }

  if (NORMAL_RESUME_PHRASES.has(norm)) {
    return "normal_resume_phrase";
  }

  if (parts.length <= 1 || norm.length < 6) {
    return "unclear";
  }

  return "true_contamination";
}

export function isArtifactContaminationSubtype(subtype: ContaminationSubtype): boolean {
  return (
    subtype === "section_artifact" ||
    subtype === "location_artifact" ||
    subtype === "summary_artifact" ||
    subtype === "normal_resume_phrase" ||
    subtype === "unclear"
  );
}

export function isTrueContaminationSubtype(subtype: ContaminationSubtype): boolean {
  return subtype === "true_contamination" || subtype === "known_signature";
}

/** Defense-in-depth for legacy logs without contamination_subtype. */
export function matchedTermLooksLikeArtifact(term: string): boolean {
  return isLocationSummaryArtifactPhrase(term) || isSectionHeaderArtifactPhrase(term);
}
