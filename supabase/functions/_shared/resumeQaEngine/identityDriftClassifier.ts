/**
 * Phase 3E — identity drift precision taxonomy.
 *
 * Root cause: extractCompanyNames() treated header contact locations (e.g. "Newark, NJ")
 * as employers when parsing pipe-delimited lines, causing false missing_employers warnings.
 */
import { parseResumeSections, normalizeCorpus } from "./types.ts";

export type IdentityDriftSubtype =
  | "identity_drift.minor_employer_omission"
  | "identity_drift.major_employer_missing"
  | "identity_drift.chronology_distorted"
  | "identity_drift.current_role_missing"
  | "identity_drift.generic_inflation"
  | "identity_drift.metric_loss"
  | "identity_drift.generic_voice";

export function isLocationLike(value: string): boolean {
  const trimmed = value.trim();
  if (/^[A-Za-z .'-]+,\s*[A-Z]{2}$/.test(trimmed)) return true;
  if (/^[A-Za-z .'-]+,\s*[A-Za-z .'-]+$/.test(trimmed) && trimmed.length <= 40) return true;
  return false;
}

/** Extract employer names from experience role lines only — not header contact fields. */
export function extractEmployerNames(text: string): string[] {
  const sections = parseResumeSections(text);
  const companies: string[] = [];

  for (const section of sections) {
    if (!section.company) continue;
    const company = section.company.trim();
    if (!company || isLocationLike(company)) continue;
    if (!/(?:19|20)\d{2}/.test(section.body)) continue;
    companies.push(company);
  }

  return companies;
}

export function classifyMissingEmployersDrift(input: {
  sourceResumeText: string;
  generatedResumeText: string;
  missingEmployers: string[];
}): IdentityDriftSubtype {
  const sourceEmployers = extractEmployerNames(input.sourceResumeText);
  const generatedEmployers = extractEmployerNames(input.generatedResumeText);

  if (sourceEmployers.length === 0 || input.missingEmployers.length === 0) {
    return "identity_drift.minor_employer_omission";
  }

  const currentSource = sourceEmployers[0]?.toLowerCase() ?? "";
  const missingReal = input.missingEmployers.filter((m) => !isLocationLike(m));

  if (missingReal.length === 0) {
    return "identity_drift.minor_employer_omission";
  }

  const currentMissing = missingReal.some(
    (m) => normalizeCorpus(m) === normalizeCorpus(currentSource) || currentSource.includes(normalizeCorpus(m)),
  );

  if (currentMissing) {
    return "identity_drift.current_role_missing";
  }

  if (generatedEmployers.length === 0 && sourceEmployers.length >= 2) {
    return "identity_drift.major_employer_missing";
  }

  if (missingReal.length >= Math.ceil(sourceEmployers.length * 0.75)) {
    return "identity_drift.major_employer_missing";
  }

  return "identity_drift.minor_employer_omission";
}

export function isAdvisoryIdentityDriftSubtype(subtype: IdentityDriftSubtype): boolean {
  return (
    subtype === "identity_drift.minor_employer_omission" ||
    subtype === "identity_drift.generic_inflation" ||
    subtype === "identity_drift.metric_loss" ||
    subtype === "identity_drift.generic_voice"
  );
}

export function isStrongIdentityDriftSubtype(subtype: IdentityDriftSubtype): boolean {
  return (
    subtype === "identity_drift.major_employer_missing" ||
    subtype === "identity_drift.current_role_missing" ||
    subtype === "identity_drift.chronology_distorted"
  );
}
