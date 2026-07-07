/**
 * calibratedResumeSanitizer — target-artifact scrub + export integrity guard
 * for calibrated resume output. Pure: no React/Deno APIs.
 *
 * Phase 10.0: prevents prior-target "WHY [COMPANY]" sections and parse
 * corruption from reaching preview/export when the current JD targets a
 * different company.
 */

import type { CalibratedResumeData } from "@/hooks/useResumeAssembly";
import { inferCompanyNameFromJd } from "@/lib/coverLetterSalutation";
import {
  enforceExperienceRenderInvariants,
  parseSourceExperienceRolesFromText,
  type SourceExperienceRole,
} from "@/lib/sourceExperienceParser";

export type { SourceExperienceRole };
export {
  buildSourceRoleId,
  normalizeSourceDates,
  parseSourceExperienceRolesFromText,
  assignSourceRoleIds,
  validateExperienceRoleShell,
  lockExperienceToSourceTruth,
} from "@/lib/sourceExperienceParser";

export interface CalibratedResumeSanitizeOptions {
  /** Current job description — used to infer the active target company. */
  jdText?: string;
  /** Original uploaded resume — used for employer typo repair and project naming. */
  originalResumeText?: string;
}

export interface CalibratedResumeSanitizeResult {
  resume: CalibratedResumeData;
  removed: string[];
  repaired: string[];
}

const WHY_HEADING_RX = /^WHY\s+([A-Za-z0-9&.'\-\s]+)\s*$/i;
const WHY_INLINE_RX = /\bWHY\s+([A-Za-z0-9&.'\-\s]{2,40})\b/gi;
const ORPHAN_FRAGMENT_RX = /^(?:kind\s+o\.?|o\s+[A-Z][a-z]{0,2}\.?)$/i;
const MONTH_NAME_RX =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DATE_IN_LINE_RX = new RegExp(
  `(?:${MONTH_NAME_RX}\\s*,?\\s*)?(?:\\d{1,2}\\/)?\\d{4}\\s*[-–—to]+\\s*(?:present|current|(?:${MONTH_NAME_RX}\\s+)?\\d{4})`,
  "i",
);
const ROLE_TITLE_RX =
  /\b(specialist|manager|analyst|coordinator|engineer|developer|director|lead|supervisor|associate|consultant|administrator|architect|representative|technician|executive|chief|senior|junior|principal|founder|builder|examiner|support)\b/i;
const COMPANY_SUFFIX_RX =
  /\b(inc\.?|llc|corp\.?|ltd\.?|co\.?|company|group|partners|consulting|services|solutions|technologies|enterprises|fund|department|labor|njdol)\b/i;
const COMPANY_ONLY_BULLET_RX =
  /^[A-Za-z][A-Za-z0-9&.'\-\s]{2,70}\s*[—–-]\s*(?:Remote|[A-Z][a-z]+(?:,\s*[A-Z]{2})?)\.?\s*$/;
const COMPANY_TITLE_HEADER_RX =
  /^([A-Za-z][A-Za-z0-9&.'\-\s]{2,70}(?:\.ai)?)\s*[—–]\s*(.+?)\.?\s*$/;
const ACCOMPLISHMENT_VERB_RX =
  /^\s*(built|managed|led|supported|coordinated|developed|created|integrated|made|drafted|handled|owned|improved|delivered|implemented|oversaw|trained|resolved|processed|reviewed|analyzed|designed|established|streamlined|partnered|collaborated|maintained|executed|facilitated|reduced|increased|achieved|provided|ensured|monitored|prepared|submitted|communicated|worked)\b/i;
const LOCATION_ONLY_RX = /^(?:remote|[A-Z][a-z]+(?:,\s*[A-Z]{2})?)$/i;
const TARGET_POSITIONING_RX =
  /\b(?:the\s+)?([A-Za-z0-9&.'\-\s]{2,40})\s+(?:support\s+model|model\s+depends|customer\s+model|service\s+model)\b/i;

/** Resolve the active target company from JD text for artifact scrubbing. */
export function resolveTargetCompany(jdText: string): string | undefined {
  const inferred = inferCompanyNameFromJd(jdText);
  if (inferred) return inferred;
  if (/\bCarMax\b/i.test(jdText)) return "CarMax";
  if (/\bJustworks\b/i.test(jdText)) return "Justworks";
  if (/\bGraybar\b/i.test(jdText)) return "Graybar";
  return undefined;
}

/** Normalize a company name for comparison. */
export function companyKey(name: string): string {
  return (name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** True when two company names refer to the same employer. */
export function companiesMatch(a: string, b: string): boolean {
  const ka = companyKey(a);
  const kb = companyKey(b);
  if (!ka || !kb) return false;
  return ka === kb || ka.includes(kb) || kb.includes(ka);
}

/** True when two role titles refer to the same role. */
export function titlesMatch(a: string, b: string): boolean {
  const na = (a || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const nb = (b || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

/** Extract company from a "WHY COMPANY" heading line. */
export function extractWhyHeadingCompany(line: string): string | null {
  const m = line.trim().match(WHY_HEADING_RX);
  return m ? m[1].trim() : null;
}

function isStaleTargetCompany(name: string, currentTarget?: string): boolean {
  if (!name?.trim() || !currentTarget?.trim()) return false;
  return !companiesMatch(name, currentTarget);
}

/** True when a line is a standalone WHY [COMPANY] heading. */
export function isWhyCompanyHeading(line: string): boolean {
  return WHY_HEADING_RX.test(line.trim());
}

/** Remove WHY blocks and stale company-positioning paragraphs from free text. */
export function scrubTargetArtifactsFromText(
  text: string,
  currentTarget?: string,
): { text: string; removed: string[] } {
  if (typeof text !== "string" || !text.trim()) {
    return { text: typeof text === "string" ? text : "", removed: [] };
  }

  const removed: string[] = [];
  const blocks = text.split(/\n{2,}/);
  const kept: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const lines = trimmed.split(/\n/).map((l) => l.trim()).filter(Boolean);

    // Drop standalone WHY lines and stale positioning lines inside a block.
    const filteredLines: string[] = [];
    for (const line of lines) {
      const whyCompany = extractWhyHeadingCompany(line);
      if (whyCompany && isStaleTargetCompany(whyCompany, currentTarget)) {
        removed.push(`WHY ${whyCompany}`);
        continue;
      }
      if (TARGET_POSITIONING_RX.test(line)) {
        const m = line.match(TARGET_POSITIONING_RX);
        const mentioned = m?.[1]?.trim();
        if (mentioned && isStaleTargetCompany(mentioned, currentTarget)) {
          removed.push(`target paragraph: ${mentioned}`);
          continue;
        }
      }
      filteredLines.push(line);
    }

    if (!filteredLines.length) continue;

    const firstLine = filteredLines[0] || "";
    const whyCompany = extractWhyHeadingCompany(firstLine);

    if (whyCompany && isStaleTargetCompany(whyCompany, currentTarget)) {
      removed.push(`WHY ${whyCompany}`);
      continue;
    }

    const joined = filteredLines.join("\n");
    if (TARGET_POSITIONING_RX.test(joined)) {
      const m = joined.match(TARGET_POSITIONING_RX);
      const mentioned = m?.[1]?.trim();
      if (mentioned && isStaleTargetCompany(mentioned, currentTarget)) {
        removed.push(`target paragraph: ${mentioned}`);
        continue;
      }
    }

    let cleaned = joined;
    for (const match of joined.matchAll(WHY_INLINE_RX)) {
      const inlineCompany = match[1]?.trim();
      if (inlineCompany && isStaleTargetCompany(inlineCompany, currentTarget)) {
        cleaned = cleaned.replace(match[0], "").trim();
        removed.push(`inline WHY ${inlineCompany}`);
      }
    }

    if (cleaned) kept.push(cleaned);
  }

  return { text: kept.join("\n\n").trim(), removed };
}

/** Repair unmatched closing parens in competency/skill fragments. */
export function repairUnmatchedCloseParen(text: string): string {
  if (typeof text !== "string" || !text.includes(")")) return text;
  const opens = (text.match(/\(/g) || []).length;
  const closes = (text.match(/\)/g) || []).length;
  if (closes <= opens) return text;

  let out = text;
  let excess = closes - opens;
  out = out.replace(/\)/g, (match) => {
    if (excess > 0) {
      excess -= 1;
      return "";
    }
    return match;
  });
  return out.replace(/\s{2,}/g, " ").replace(/,\s*,/g, ",").trim();
}

/** Remove orphan truncated fragments like "kind o." */
export function isOrphanFragment(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return true;
  if (ORPHAN_FRAGMENT_RX.test(t)) return true;
  if (/^[a-z]\.\s*$/i.test(t)) return true;
  if (t.length <= 4 && /\.$/.test(t) && !/^(Inc|LLC|etc)\.?$/i.test(t)) return true;
  return false;
}

/** True when a bullet is only a company/location line, not an accomplishment. */
export function isCompanyLocationOnlyBullet(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  if (COMPANY_ONLY_BULLET_RX.test(t)) return true;
  if (DATE_IN_LINE_RX.test(t)) return true;
  if (!ROLE_TITLE_RX.test(t) && COMPANY_SUFFIX_RX.test(t) && t.split(/\s+/).length <= 8) {
    if (/[—–-]/.test(t) && !/\b(managed|led|built|created|developed|coordinated|supported|handled|owned)\b/i.test(t)) {
      return true;
    }
  }
  return false;
}

/** Fix known employer typos when the source resume has the canonical name. */
export function repairEmployerTypo(name: string, originalResumeText = ""): string {
  if (!name?.trim()) return name;
  if (/^Asted\s+Fund/i.test(name) && /\bAST\s+Fund\s+Solutions\b/i.test(originalResumeText)) {
    return name.replace(/^Asted/i, "AST");
  }
  return name;
}

/** Normalize Resumix → Signalyz only when the source resume supports Signalyz. */
export function maybeNormalizeProjectName(name: string, originalResumeText = ""): string {
  const trimmed = (name || "").trim();
  if (!trimmed) return trimmed;
  if (/\bSignalyz\b/i.test(originalResumeText) && /^Resumix$/i.test(trimmed)) {
    return "Signalyz";
  }
  return trimmed;
}

/** Extract employer names from the original resume for re-homing orphan bullets. */
export function extractKnownEmployers(originalResumeText: string): string[] {
  if (!originalResumeText?.trim()) return [];
  const employers = new Set<string>();
  for (const line of originalResumeText.split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 90) continue;
    if (DATE_IN_LINE_RX.test(trimmed)) {
      const parts = trimmed.split(/\||[—–]/).map((p) => p.replace(DATE_IN_LINE_RX, "").trim()).filter(Boolean);
      for (const part of parts) {
        if (COMPANY_SUFFIX_RX.test(part) || /^[A-Z][A-Za-z0-9&.'\-\s]{2,50}$/.test(part)) {
          employers.add(part);
        }
      }
    }
    if (/^[A-Z][A-Za-z0-9&.'\-\s]{2,60}\s*[—–-]\s*(?:Remote|[A-Z][a-z]+,\s*[A-Z]{2})/.test(trimmed)) {
      employers.add(trimmed.split(/[—–-]/)[0].trim());
    }
  }
  if (/\bAST\s+Fund\s+Solutions\b/i.test(originalResumeText)) employers.add("AST Fund Solutions");
  if (/\bnThrive\b/i.test(originalResumeText)) employers.add("nThrive");
  if (/\bSignalyz(?:\.ai)?\b/i.test(originalResumeText)) employers.add("Signalyz.ai");
  if (/\bNew Jersey Department of Labor\b/i.test(originalResumeText)) {
    employers.add("New Jersey Department of Labor");
  }
  if (/\bNJDOL\b/i.test(originalResumeText)) employers.add("NJDOL");
  for (const line of originalResumeText.split(/\n/)) {
    const trimmed = line.trim().replace(/^[-•*]\s*/, "");
    const companyTitle = parseCompanyTitleHeaderBullet(trimmed, originalResumeText);
    if (companyTitle?.company) employers.add(companyTitle.company);
  }
  if (/^[A-Za-z][A-Za-z0-9&.'\-\s]{2,50}\s*[—–-]\s*Remote\.?\s*$/im.test(originalResumeText)) {
    const m = originalResumeText.match(/^([A-Za-z][A-Za-z0-9&.'\-\s]{2,50})\s*[—–-]\s*Remote/im);
    if (m?.[1]) employers.add(m[1].trim());
  }
  return [...employers];
}

/** True when a bullet is a company — title header (not an accomplishment). */
export function isCompanyTitleHeaderBullet(text: string, originalResumeText = ""): boolean {
  const t = (text || "").replace(/^\s*[-•*]\s*/, "").trim();
  if (!t || ACCOMPLISHMENT_VERB_RX.test(t)) return false;
  if (isMisplacedRoleHeaderBullet(t)) return false;

  const parsed = parseCompanyTitleHeaderBullet(t, originalResumeText);
  if (!parsed) return false;

  if (LOCATION_ONLY_RX.test(parsed.title)) return false;
  if (parsed.title.length < 3) return false;

  const known = extractKnownEmployers(originalResumeText);
  const canonical = repairEmployerTypo(parsed.company, originalResumeText);
  if (known.some((e) => companiesMatch(e, canonical) || companiesMatch(e, parsed.company))) {
    return true;
  }
  if (/signalyz/i.test(parsed.company)) return true;
  if (COMPANY_SUFFIX_RX.test(parsed.company)) return true;
  if (/\bnThrive\b/i.test(parsed.company)) return true;
  if (ROLE_TITLE_RX.test(parsed.title) || /,\s*[A-Za-z]/.test(parsed.title)) {
    return parsed.company.split(/\s+/).length >= 1;
  }
  return false;
}

/** Parse "Company — Title" header bullets into structured fields. */
export function parseCompanyTitleHeaderBullet(
  text: string,
  originalResumeText = "",
): { company: string; title: string } | null {
  const t = (text || "").replace(/^\s*[-•*]\s*/, "").trim();
  const m = t.match(COMPANY_TITLE_HEADER_RX);
  if (!m) return null;
  const company = repairEmployerTypo(m[1].trim(), originalResumeText);
  const title = m[2].trim().replace(/\.$/, "").trim();
  if (!company || !title) return null;
  return { company, title };
}

interface SourceRoleMetadata {
  company: string;
  title: string;
  dates: string;
  location: string;
}

const EXPERIENCE_SECTION_RX =
  /^(?:experience|professional experience|work experience|employment history)\b/i;
const RESUME_SECTION_STOP_RX =
  /^(?:skills|certifications|education|core competencies|professional summary|projects|independent projects)\b/i;

function normalizeBulletToken(text: string): string {
  return (text || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 96);
}

function isLikelyCompanyLine(line: string, originalResumeText: string): boolean {
  const t = (line || "").trim();
  if (!t || isLocationOnlyValue(t) || DATE_IN_LINE_RX.test(t)) return false;
  if (/\bSignalyz(?:\.ai)?\b/i.test(t)) return true;
  if (/\bnThrive\b/i.test(t)) return true;
  if (/\bAST\s+Fund/i.test(t)) return true;
  if (/\bDepartment of Labor\b/i.test(t)) return true;
  if (COMPANY_SUFFIX_RX.test(t)) return true;
  const known = extractKnownEmployers(originalResumeText);
  return known.some((e) => companiesMatch(e, t));
}

function isDateOnlyValue(value: string): boolean {
  const t = (value || "").trim();
  if (!t || !DATE_IN_LINE_RX.test(t)) return false;
  return t.replace(DATE_IN_LINE_RX, "").replace(/[-–—|]/g, "").trim().length < 3;
}

function datesExactlyMatch(a: string, b: string): boolean {
  const na = (a || "").toLowerCase().replace(/\s+/g, " ").trim();
  const nb = (b || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ya = extractYearTokens(a);
  const yb = extractYearTokens(b);
  return ya.length >= 2 && yb.length >= 2 && ya[0] === yb[0] && ya[1] === yb[1];
}

/** Parse the uploaded resume experience section into source-truth roles. */
export function parseSourceExperienceRoles(originalResumeText: string): SourceExperienceRole[] {
  return parseSourceExperienceRolesFromText(originalResumeText);
}

function bulletOverlapScore(roleBullets: string[], sourceBullets: string[]): number {
  if (!roleBullets.length || !sourceBullets.length) return 0;
  let score = 0;
  for (const bullet of roleBullets) {
    const token = normalizeBulletToken(bullet);
    if (!token || token.length < 12) continue;
    for (const sourceBullet of sourceBullets) {
      const sourceToken = normalizeBulletToken(sourceBullet);
      if (!sourceToken) continue;
      if (token.includes(sourceToken) || sourceToken.includes(token)) {
        score += 30;
        break;
      }
    }
  }
  return Math.min(score, 90);
}

function roleHasLocationConflict(
  role: CalibratedResumeData["experience"][number],
  source: SourceExperienceRole,
): boolean {
  const location = (role.location || "").trim();
  if (!location || !source.location) return false;
  if (locationsMatch(location, source.location)) return false;
  return true;
}

function roleNeedsSourceRehydration(
  role: CalibratedResumeData["experience"][number],
  originalResumeText: string,
): boolean {
  const company = (role.company || "").trim();
  const title = (role.title || "").trim();
  const dates = (role.dates || "").trim();
  const location = (role.location || "").trim();

  if (dates && !company && !title) return true;
  if (isDateOnlyValue(company) || isDateOnlyValue(title)) return true;
  if (isLocationOnlyValue(company) || isLocationOnlyValue(title)) return true;
  if (/^remote$/i.test(company) || /^remote$/i.test(title)) return true;
  if (location && (locationsMatch(location, company) || locationsMatch(location, title))) return true;
  if (company && title && locationsMatch(company, title) && isLocationOnlyValue(company)) return true;

  const sourceRoles = parseSourceExperienceRoles(originalResumeText);
  for (const source of sourceRoles) {
    if (!dates && !bulletOverlapScore(role.bullets || [], source.bullets)) continue;
    const dateMatch = dates ? scoreDateMatch(dates, source.dates) : 0;
    const overlap = bulletOverlapScore(role.bullets || [], source.bullets);
    if (overlap >= 30 && roleHasLocationConflict(role, source)) return true;
    if (dateMatch >= 80 && roleHasLocationConflict(role, source)) return true;
    if (dateMatch >= 80 && isLocationOnlyValue(company)) return true;
    if (dateMatch >= 80 && company && !companiesMatch(company, source.company)) return true;
    if (dateMatch >= 80 && title && source.title && !titlesMatch(title, source.title)) return true;
  }

  return false;
}

function scoreSourceRoleMatch(
  role: CalibratedResumeData["experience"][number],
  source: SourceExperienceRole,
): number {
  let score = 0;
  const company = (role.company || "").trim();
  const title = (role.title || "").trim();
  const dates = (role.dates || "").trim();
  const location = (role.location || "").trim();

  if (dates && source.dates) {
    if (datesExactlyMatch(dates, source.dates)) score += 400;
    else if (scoreDateMatch(dates, source.dates) >= 80) score += 350;
    else if (scoreDateMatch(dates, source.dates) >= 10) score += 50;
  }

  if (location && source.location && locationsMatch(location, source.location)) score += 120;
  score += bulletOverlapScore(role.bullets || [], source.bullets);

  if (company && companiesMatch(company, source.company)) score += 100;
  if (title && titlesMatch(title, source.title)) score += 80;
  if (company && title && companiesMatch(company, source.company) && titlesMatch(title, source.title)) {
    score += 200;
  }

  return score;
}

function findBestSourceRoleMatch(
  role: CalibratedResumeData["experience"][number],
  sourceRoles: SourceExperienceRole[],
  usedSourceIdx: Set<number>,
): { source: SourceExperienceRole; index: number; score: number } | null {
  let best: { source: SourceExperienceRole; index: number; score: number } | null = null;

  for (let i = 0; i < sourceRoles.length; i++) {
    const source = sourceRoles[i];
    const score = scoreSourceRoleMatch(role, source);
    if (score < 50) continue;
    if (usedSourceIdx.has(i) && score < 400) continue;
    if (!best || score > best.score) {
      best = { source, index: i, score };
    }
  }

  return best;
}

function rehydrateExperienceFromSourceTruth(
  experience: CalibratedResumeData["experience"],
  originalResumeText: string,
  repaired: string[],
): CalibratedResumeData["experience"] {
  if (!originalResumeText?.trim()) return experience;

  const sourceRoles = parseSourceExperienceRoles(originalResumeText);
  if (!sourceRoles.length) return experience;

  const usedSourceIdx = new Set<number>();

  return experience.map((role) => {
    let company = repairEmployerTypo(role.company || "", originalResumeText);
    let title = (role.title || "").trim();
    let dates = (role.dates || "").trim();
    let location = (role.location || "").trim();

    if (isLocationOnlyValue(company) && !location) {
      location = company;
      company = "";
    }
    if (isLocationOnlyValue(title) && !location) {
      location = title;
      title = "";
    }
    if (/^remote$/i.test(company)) {
      location = location || "Remote";
      company = "";
    }
    if (/^remote$/i.test(title)) {
      location = location || "Remote";
      title = "";
    }
    if (location && (locationsMatch(location, company) || locationsMatch(location, title))) {
      if (isLocationOnlyValue(company)) company = "";
      if (isLocationOnlyValue(title)) title = "";
    }

    const candidateRole = { ...role, company, title, dates, location };
    const needs = roleNeedsSourceRehydration(candidateRole, originalResumeText);
    const match = findBestSourceRoleMatch(candidateRole, sourceRoles, usedSourceIdx);

    if (
      match &&
      (needs ||
        match.score >= 350 ||
        roleHasLocationConflict(candidateRole, match.source) ||
        (isLocationOnlyValue(company) || isLocationOnlyValue(title)))
    ) {
      company = match.source.company;
      title = match.source.title;
      dates = match.source.dates || dates;
      location = match.source.location || location;
      usedSourceIdx.add(match.index);
      repaired.push(`rehydrated role from source truth: ${company || title}`);
    }

    ({ company, title } = splitCombinedCompanyTitle(company, title, originalResumeText));
    ({ dates, location } = normalizeDatesAndLocation(dates, location));

    return { ...role, company, title, dates, location };
  });
}

function extractYearTokens(dates: string): string[] {
  return (dates.match(/\d{4}/g) || []).slice(0, 2);
}

function datesOverlap(a: string, b: string): boolean {
  const ya = extractYearTokens(a);
  const yb = extractYearTokens(b);
  if (!ya.length || !yb.length) return false;
  if (ya[0] === yb[0]) return true;
  if (ya.length >= 2 && yb.length >= 2) {
    const aStart = Number.parseInt(ya[0], 10);
    const aEnd = Number.parseInt(ya[1], 10);
    const bStart = Number.parseInt(yb[0], 10);
    const bEnd = Number.parseInt(yb[1], 10);
    return aStart <= bEnd && bStart <= aEnd;
  }
  return false;
}

function scoreRoleMetadataMatch(
  role: { company?: string; title?: string },
  candidate: SourceRoleMetadata,
): number {
  const companyMatch = role.company ? companiesMatch(role.company, candidate.company) : false;
  const titleMatch = role.title ? titlesMatch(role.title, candidate.title) : false;
  if (companyMatch && titleMatch) return 300;
  if (companyMatch) return 100;
  return -1;
}

function collectSourceRoleCandidates(originalResumeText: string): SourceRoleMetadata[] {
  return parseSourceExperienceRoles(originalResumeText).map(({ bullets: _b, ...meta }) => meta);
}

function scoreDateMatch(targetDates: string, candidateDates: string): number {
  const targetYears = extractYearTokens(targetDates);
  const candidateYears = extractYearTokens(candidateDates);
  if (!targetYears.length || !candidateYears.length) return -1;
  if (targetYears[0] === candidateYears[0]) {
    if (targetYears.join() === candidateYears.join()) return 100;
    return 80;
  }
  return datesOverlap(targetDates, candidateDates) ? 10 : -1;
}

function parseHybridExperienceLine(
  line: string,
  originalResumeText: string,
): SourceRoleMetadata | null {
  const trimmed = line.trim().replace(/^[-•*]\s*/, "");
  if (!DATE_IN_LINE_RX.test(trimmed) || !/[—–-]/.test(trimmed)) return null;

  const dates = extractDatesSubstring(trimmed);
  const beforeDates = trimmed.replace(DATE_IN_LINE_RX, "").replace(/\|\s*Remote\b/gi, "").trim();
  const dashParts = beforeDates.split(/\s*[—–-]\s*/);
  if (dashParts.length < 2) return null;

  const company = repairEmployerTypo(dashParts[0].trim(), originalResumeText);
  const title = dashParts
    .slice(1)
    .join(" — ")
    .replace(/\|.*$/, "")
    .trim();
  if (!company || !title || ACCOMPLISHMENT_VERB_RX.test(company)) return null;

  return {
    company,
    title,
    dates,
    location: parseLocationFromLine(trimmed),
  };
}

function lookupRoleMetadataFromSource(
  company: string,
  originalResumeText: string,
  title = "",
): SourceRoleMetadata | null {
  if (!originalResumeText?.trim() || !company?.trim()) return null;

  let best: SourceRoleMetadata | null = null;
  let bestScore = -1;

  for (const candidate of collectSourceRoleCandidates(originalResumeText)) {
    const score = scoreRoleMetadataMatch({ company, title }, candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return bestScore >= 0 ? best : null;
}

function findSourceRoleByDates(
  dates: string,
  originalResumeText: string,
  company = "",
  title = "",
): SourceRoleMetadata | null {
  if (!dates?.trim() || !originalResumeText?.trim()) return null;

  if (company && !isLocationOnlyValue(company)) {
    const exact = lookupRoleMetadataFromSource(company, originalResumeText, title);
    if (exact) return exact;
  }

  let best: SourceRoleMetadata | null = null;
  let bestScore = -1;

  for (const candidate of collectSourceRoleCandidates(originalResumeText)) {
    const roleScore = scoreRoleMetadataMatch({ company, title }, candidate);
    const dateScore = scoreDateMatch(dates, candidate.dates);
    if (dateScore < 0) continue;

    const combinedScore = roleScore >= 300 ? roleScore : roleScore >= 100 ? roleScore + dateScore : dateScore;
    if (combinedScore > bestScore) {
      best = candidate;
      bestScore = combinedScore;
    }
  }

  return bestScore >= 0 ? best : null;
}

function locationsMatch(a: string, b: string): boolean {
  const na = (a || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const nb = (b || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function findSourceRoleByLocationAndDates(
  location: string,
  dates: string,
  originalResumeText: string,
): SourceRoleMetadata | null {
  if (!location?.trim() || !dates?.trim() || !originalResumeText?.trim()) return null;

  let best: SourceRoleMetadata | null = null;
  let bestScore = -1;

  for (const candidate of collectSourceRoleCandidates(originalResumeText)) {
    if (!candidate.location || !locationsMatch(location, candidate.location)) continue;
    const dateScore = scoreDateMatch(dates, candidate.dates);
    if (dateScore < 80) continue;
    const combinedScore = dateScore + (candidate.company ? 10 : 0);
    if (combinedScore > bestScore) {
      best = candidate;
      bestScore = combinedScore;
    }
  }

  return best;
}

function resolveRoleFromSource(
  company: string,
  title: string,
  dates: string,
  location: string,
  originalResumeText: string,
): SourceRoleMetadata | null {
  const companyLookup =
    company && !isLocationOnlyValue(company)
      ? lookupRoleMetadataFromSource(company, originalResumeText, title)
      : null;
  if (companyLookup) return companyLookup;

  if (dates) {
    const byDates = findSourceRoleByDates(dates, originalResumeText, company, title);
    if (byDates) return byDates;
  }

  if (location && dates) {
    return findSourceRoleByLocationAndDates(location, dates, originalResumeText);
  }

  return null;
}

function parseLocationFromLine(trimmed: string): string {
  const pipeParts = trimmed.split("|").map((p) => p.trim()).filter(Boolean);
  for (const part of pipeParts) {
    if (DATE_IN_LINE_RX.test(part)) continue;
    if (isLocationOnlyValue(part)) return part;
  }
  if (/\|\s*Remote\b/i.test(trimmed)) return "Remote";
  return "";
}

function isLocationOnlyValue(value: string): boolean {
  const t = (value || "").trim();
  if (!t) return false;
  if (/^remote$/i.test(t)) return true;
  if (/^[A-Za-z][A-Za-z\s.'-]+,\s*[A-Z]{2}$/.test(t)) return true;
  return false;
}

function splitCombinedCompanyTitle(
  company: string,
  title: string,
  originalResumeText: string,
): { company: string; title: string } {
  const c = (company || "").trim();
  const t = (title || "").trim();
  if (!c || !/[—–]/.test(c)) return { company: c, title: t };

  const parsed = parseCompanyTitleHeaderBullet(c, originalResumeText);
  if (!parsed) return { company: c, title: t };
  if (!t || titlesMatch(t, parsed.title)) {
    return { company: parsed.company, title: t || parsed.title };
  }
  return { company: c, title: t };
}

function normalizeDatesAndLocation(
  dates: string,
  location: string,
): { dates: string; location: string } {
  let d = (dates || "").trim();
  let l = (location || "").trim();
  const parts = d.split(/\s*·\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1) {
    const tail = parts[parts.length - 1];
    if (isLocationOnlyValue(tail)) {
      d = parts.slice(0, -1).join(" · ");
      if (!l) l = tail;
    }
  }
  return { dates: d, location: l };
}

function isTitleOnlyFragment(role: CalibratedResumeData["experience"][number]): boolean {
  const title = (role.title || "").trim();
  const company = (role.company || "").trim();
  const bullets = role.bullets?.length ?? 0;
  return Boolean(title) && !company && bullets === 0 && !/^remote$/i.test(title);
}

function isLocationFragment(role: CalibratedResumeData["experience"][number]): boolean {
  const company = (role.company || "").trim();
  const title = (role.title || "").trim();
  return isLocationOnlyValue(company) && !title;
}

function isRemoteTitleFragment(role: CalibratedResumeData["experience"][number]): boolean {
  return /^remote$/i.test((role.title || "").trim()) && !(role.company || "").trim();
}

function canonicalizeExperienceHeaders(
  experience: CalibratedResumeData["experience"],
  originalResumeText: string,
): { experience: CalibratedResumeData["experience"]; repaired: string[] } {
  const repaired: string[] = [];
  const roles = experience.map((role) => ({
    ...role,
    location: role.location || "",
    bullets: [...(role.bullets || [])],
  }));

  for (const role of roles) {
    let company = repairEmployerTypo(role.company || "", originalResumeText);
    let title = (role.title || "").trim();
    let dates = (role.dates || "").trim();
    let location = (role.location || "").trim();

    ({ company, title } = splitCombinedCompanyTitle(company, title, originalResumeText));

    if (isLocationOnlyValue(company) && !location) {
      location = company;
      company = "";
      repaired.push(`moved location from company field: ${location}`);
    }
    if (/^remote$/i.test(company) && !location) {
      location = "Remote";
      company = "";
    }
    if (isRemoteTitleFragment(role) && !location) {
      location = "Remote";
      title = "";
      repaired.push("moved Remote from title field into location");
    }

    ({ dates, location } = normalizeDatesAndLocation(dates, location));

    if (!company && !title && dates) {
      const fromDates = resolveRoleFromSource(company, title, dates, location, originalResumeText);
      if (fromDates) {
        company = fromDates.company;
        title = fromDates.title;
        if (!location && fromDates.location) location = fromDates.location;
        repaired.push(`attached company/title from source dates: ${company || title}`);
      }
    }

    if (company && !location) {
      const fromSource = lookupRoleMetadataFromSource(company, originalResumeText, title);
      if (fromSource?.location) location = fromSource.location;
    }

    role.company = company;
    role.title = title;
    role.dates = dates;
    role.location = location;
  }

  const merged: CalibratedResumeData["experience"] = [];
  for (let i = 0; i < roles.length; i++) {
    const role = roles[i];

    if (isTitleOnlyFragment(role)) {
      const next = roles[i + 1];
      const prev = merged[merged.length - 1];
      const target = next && !next.title ? next : prev;
      if (target) {
        if (!target.title) target.title = role.title;
        if (role.dates && !target.dates) target.dates = role.dates;
        if (role.location && !target.location) target.location = role.location;
        repaired.push(`merged title-only fragment: ${role.title}`);
        continue;
      }
    }

    if (isLocationFragment(role) && (role.bullets?.length ?? 0) === 0 && role.dates) {
      const locationValue = (role.company || "").trim();
      const next = roles[i + 1];
      const fromSource = findSourceRoleByDates(role.dates, originalResumeText, "", "");
      const target =
        next && !next.location
          ? next
          : fromSource
            ? null
            : merged[merged.length - 1];
      if (target && fromSource && companiesMatch(target.company || "", fromSource.company)) {
        if (!target.location) target.location = locationValue;
        if (role.dates && !target.dates) target.dates = role.dates;
        repaired.push(`merged location-only header into matching role: ${locationValue}`);
        continue;
      }
      if (fromSource) {
        role.company = fromSource.company;
        role.title = fromSource.title;
        role.location = fromSource.location || locationValue;
        repaired.push(`resolved location-only header from source: ${fromSource.company}`);
        merged.push(role);
        continue;
      }
    }

    if (isLocationFragment(role) && (role.bullets?.length ?? 0) > 0) {
      const locationValue = (role.company || "").trim();
      const fromSource =
        findSourceRoleByDates(role.dates, originalResumeText, "", "") ||
        (locationValue
          ? findSourceRoleByLocationAndDates(locationValue, role.dates, originalResumeText)
          : null);
      if (fromSource) {
        role.company = fromSource.company;
        role.title = fromSource.title;
        role.location = fromSource.location || locationValue;
        merged.push(role);
        repaired.push(`resolved location fragment with bullets from source: ${fromSource.company}`);
        continue;
      }

      const target = merged[merged.length - 1];
      if (target) {
        if (role.dates && !target.dates) target.dates = role.dates;
        target.bullets.push(...role.bullets);
        repaired.push(`merged location fragment bullets into ${target.company || target.title}`);
        continue;
      }
    }

    if (
      !(role.company || "").trim() &&
      !(role.title || "").trim() &&
      role.dates &&
      ((role.location || "").trim() || (role.bullets?.length ?? 0) > 0)
    ) {
      const fromSource = resolveRoleFromSource(
        "",
        "",
        role.dates,
        role.location || "",
        originalResumeText,
      );
      if (fromSource) {
        role.company = fromSource.company;
        role.title = fromSource.title;
        if (!role.location && fromSource.location) role.location = fromSource.location;
        repaired.push(`resolved role header from source dates: ${fromSource.company || fromSource.title}`);
        merged.push(role);
        continue;
      }

      if ((role.bullets?.length ?? 0) > 0) {
        const target = merged[merged.length - 1];
        if (target) {
          if (!target.dates) target.dates = role.dates;
          target.bullets.push(...role.bullets);
          repaired.push("merged date-only bullet block into previous role");
          continue;
        }
      }
    }

    merged.push(role);
  }

  const output = merged
    .filter((role) => {
      const company = (role.company || "").trim();
      const title = (role.title || "").trim();
      const bullets = role.bullets?.length ?? 0;
      if (!company && !title && bullets === 0) return false;
      if (isLocationOnlyValue(company) && bullets === 0) return false;
      if (/^remote$/i.test(title) && !company && bullets === 0) return false;
      if (DATE_IN_LINE_RX.test(company) && !title && bullets === 0) return false;
      return bullets > 0 || (Boolean(company) && Boolean(title));
    })
    .map((role) => {
      const split = splitCombinedCompanyTitle(role.company || "", role.title || "", originalResumeText);
      const normalized = normalizeDatesAndLocation(role.dates || "", role.location || "");
      return {
        ...role,
        company: split.company,
        title: split.title,
        dates: normalized.dates,
        location: normalized.location,
      };
    });

  return { experience: output, repaired };
}

function appendLocationToDates(dates: string, location: string): string {
  const d = (dates || "").trim();
  const l = (location || "").trim();
  if (!l) return d;
  if (!d) return l;
  if (new RegExp(`\\b${l}\\b`, "i").test(d)) return d;
  return `${d} · ${l}`;
}

function hasStrongSourceRoleMatch(
  company: string,
  title: string,
  dates: string,
  candidate: SourceRoleMetadata,
): boolean {
  const companyTitleMatch =
    Boolean(company && title) &&
    companiesMatch(candidate.company, company) &&
    titlesMatch(candidate.title, title);
  const companyDateMatch =
    Boolean(company && dates) &&
    companiesMatch(candidate.company, company) &&
    scoreDateMatch(dates, candidate.dates) >= 80;
  return companyTitleMatch || companyDateMatch;
}

function applySourceLocationOwnership(
  experience: CalibratedResumeData["experience"],
  originalResumeText: string,
  repaired: string[],
): CalibratedResumeData["experience"] {
  if (!originalResumeText?.trim()) return experience;

  return experience.map((role) => {
    let company = repairEmployerTypo(role.company || "", originalResumeText);
    let title = (role.title || "").trim();
    let dates = (role.dates || "").trim();
    let location = (role.location || "").trim();

    ({ company, title } = splitCombinedCompanyTitle(company, title, originalResumeText));
    ({ dates, location } = normalizeDatesAndLocation(dates, location));

    const fromSource = resolveRoleFromSource(company, title, dates, location, originalResumeText);
    if (!fromSource?.location) {
      return { ...role, company, title, dates, location };
    }

    if (
      hasStrongSourceRoleMatch(company, title, dates, fromSource) &&
      (!location || !locationsMatch(location, fromSource.location))
    ) {
      repaired.push(`locked location from source for ${company || title}: ${fromSource.location}`);
      location = fromSource.location;
    }

    return { ...role, company, title, dates, location };
  });
}

function enrichExperienceFromSource(
  experience: CalibratedResumeData["experience"],
  originalResumeText: string,
): CalibratedResumeData["experience"] {
  return experience.map((role) => {
    const next = { ...role, location: role.location || "", bullets: [...(role.bullets || [])] };
    let company = repairEmployerTypo(next.company || "", originalResumeText);
    let title = (next.title || "").trim();
    let dates = (next.dates || "").trim();
    let location = (next.location || "").trim();

    if (isLocationOnlyValue(company) && !location) {
      location = company.trim();
      company = "";
    }

    if (/^remote$/i.test(company)) {
      location = location || "Remote";
      company = "";
    }

    if (isRemoteTitleFragment(next) && !location) {
      location = "Remote";
      title = "";
    }

    const fromSource = resolveRoleFromSource(company, title, dates, location, originalResumeText);

    if (fromSource) {
      const exactCompanyTitle =
        Boolean(company && title) &&
        companiesMatch(fromSource.company, company) &&
        titlesMatch(fromSource.title, title);

      if (!company) company = fromSource.company;
      if (!title) title = fromSource.title;

      if (fromSource.dates) {
        if (!dates || exactCompanyTitle) {
          dates = fromSource.dates;
        }
      }

      if (fromSource.location) {
        if (
          !location ||
          (hasStrongSourceRoleMatch(company, title, dates, fromSource) &&
            !locationsMatch(location, fromSource.location))
        ) {
          location = fromSource.location;
        }
      }
    }

    ({ company, title } = splitCombinedCompanyTitle(company, title, originalResumeText));
    ({ dates, location } = normalizeDatesAndLocation(dates, location));

    next.company = company;
    next.title = title;
    next.dates = dates;
    next.location = location;
    return next;
  });
}

function hasRoleStructure(role: CalibratedResumeData["experience"][number]): boolean {
  return Boolean((role.company || "").trim() || (role.title || "").trim());
}

function shouldFlushRole(role: CalibratedResumeData["experience"][number]): boolean {
  return hasRoleStructure(role) || (role.bullets?.length ?? 0) > 0;
}

function extractDatesSubstring(text: string): string {
  const m = text.match(DATE_IN_LINE_RX);
  return m ? m[0] : "";
}

/** True when a bullet is actually a role header line (title/company/dates). */
export function isMisplacedRoleHeaderBullet(text: string): boolean {
  const t = (text || "").replace(/^\s*[-•*]\s*/, "").trim();
  if (!t || !DATE_IN_LINE_RX.test(t)) return false;
  if (/\|/.test(t)) return true;
  if (ROLE_TITLE_RX.test(t) && COMPANY_SUFFIX_RX.test(t) && t.split(/\s+/).length <= 14) return true;
  return false;
}

/** Parse a misplaced role-header bullet into structured fields. */
export function parseRoleHeaderBullet(text: string): { title: string; company: string; dates: string } | null {
  const t = (text || "").replace(/^\s*[-•*]\s*/, "").trim();
  if (!DATE_IN_LINE_RX.test(t)) return null;

  const dates = extractDatesSubstring(t);

  if (/\|/.test(t)) {
    const parts = t
      .split("|")
      .map((p) => p.trim())
      .map((p) => p.replace(DATE_IN_LINE_RX, "").replace(/\bRemote\b/gi, "").trim())
      .filter(Boolean);
    if (parts.length === 0) return null;
    if (ROLE_TITLE_RX.test(parts[0]) && parts.length >= 2) {
      return { title: parts[0], company: parts[1], dates };
    }
    if (parts.length === 1) {
      if (ROLE_TITLE_RX.test(parts[0])) {
        return { title: parts[0], company: "", dates };
      }
      return { title: "", company: parts[0], dates };
    }
    return { title: parts[0] || "", company: parts[1] || "", dates };
  }

  const remainder = t.replace(DATE_IN_LINE_RX, "").trim();
  if (remainder.length <= 4) return { title: "", company: "", dates };
  return null;
}

function isDatesOnlyBullet(text: string): boolean {
  const t = (text || "").trim();
  if (!DATE_IN_LINE_RX.test(t)) return false;
  return t.replace(DATE_IN_LINE_RX, "").replace(/[-–—|]/g, "").trim().length < 3;
}

function repairExperienceStructure(
  experience: CalibratedResumeData["experience"],
  originalResumeText: string,
): { experience: CalibratedResumeData["experience"]; repaired: string[] } {
  const repaired: string[] = [];
  const output: CalibratedResumeData["experience"] = [];

  for (const role of experience) {
    let current: CalibratedResumeData["experience"][number] = {
      ...role,
      company: repairEmployerTypo(role.company || "", originalResumeText),
      bullets: [],
    };

    if (/^remote$/i.test((current.company || "").trim())) {
      current.location = current.location || "Remote";
      current.company = "";
      repaired.push("moved Remote from company field into location");
    }

    for (const bullet of role.bullets || []) {
      if (isDatesOnlyBullet(bullet)) {
        if (!current.dates) {
          current.dates = extractDatesSubstring(bullet);
          repaired.push(`attached dates to ${current.company || current.title || "role"}`);
        }
        continue;
      }

      if (isMisplacedRoleHeaderBullet(bullet)) {
        const parsed = parseRoleHeaderBullet(bullet);
        if (parsed && (parsed.title || parsed.company)) {
          if (shouldFlushRole(current)) output.push({ ...current, bullets: [...current.bullets] });
          current = {
            title: parsed.title,
            company: repairEmployerTypo(parsed.company, originalResumeText),
            dates: parsed.dates,
            bullets: [],
          };
          repaired.push(`promoted role header from bullet: ${bullet.slice(0, 72)}`);
          continue;
        }
      }

      if (isCompanyTitleHeaderBullet(bullet, originalResumeText)) {
        const parsed = parseCompanyTitleHeaderBullet(bullet, originalResumeText);
        if (parsed) {
          const duplicateHeader =
            current.company &&
            companiesMatch(current.company, parsed.company) &&
            (!current.title || current.title === parsed.title) &&
            current.bullets.length === 0;

          if (duplicateHeader) {
            current.title = parsed.title || current.title;
            current.company = parsed.company;
            repaired.push(`merged duplicate company/title header: ${parsed.company}`);
            continue;
          }

          if (shouldFlushRole(current)) output.push({ ...current, bullets: [...current.bullets] });
          current = {
            title: parsed.title,
            company: parsed.company,
            dates: "",
            bullets: [],
          };
          repaired.push(`promoted company/title header: ${bullet.slice(0, 72)}`);
          continue;
        }
      }

      if (isCompanyLocationOnlyBullet(bullet)) {
        const companyFromBullet = parseCompanyFromBullet(bullet);
        if (companyFromBullet) {
          const canonical = repairEmployerTypo(companyFromBullet, originalResumeText);
          if (shouldFlushRole(current)) output.push({ ...current, bullets: [...current.bullets] });
          current = {
            title: "",
            company: canonical,
            dates: "",
            bullets: [],
          };
          repaired.push(`promoted company-location line: ${canonical}`);
          continue;
        }
      }

      current.bullets.push(bullet);
    }

    if (shouldFlushRole(current)) output.push(current);
  }

  let combined = output.filter((r) => hasRoleStructure(r) || (r.bullets?.length ?? 0) > 0);

  const orphanBullets: string[] = [];
  combined = combined.filter((role) => {
    if (!hasRoleStructure(role) && (role.bullets?.length ?? 0) > 0) {
      if ((role.dates || "").trim()) return true;
      orphanBullets.push(...role.bullets);
      repaired.push("merged orphan bullets into nearest structured role");
      return false;
    }
    if (!hasRoleStructure(role) && (role.bullets?.length ?? 0) === 0) return false;
    return true;
  });

  if (orphanBullets.length > 0 && combined.length > 0) {
    const unattached = combined.find((r) => !r.company && r.title && (r.bullets?.length ?? 0) === 0);
    if (unattached) {
      unattached.bullets = [...(unattached.bullets || []), ...orphanBullets];
    } else {
      const target =
        combined.find((r) => /signalyz/i.test(r.company || "")) ||
        combined.find((r) => hasRoleStructure(r)) ||
        combined[0];
      target.bullets = [...(target.bullets || []), ...orphanBullets];
    }
  }

  combined = enrichExperienceFromSource(combined, originalResumeText);

  const deduped: CalibratedResumeData["experience"] = [];
  for (const role of combined) {
    const existingIdx = deduped.findIndex(
      (r) =>
        companiesMatch(r.company || "", role.company || "") &&
        (r.title || "").trim().toLowerCase() === (role.title || "").trim().toLowerCase(),
    );
    if (existingIdx >= 0) {
      const existing = deduped[existingIdx];
      if (!existing.dates && role.dates) existing.dates = role.dates;
      if (!existing.title && role.title) existing.title = role.title;
      if (!existing.company && role.company) existing.company = role.company;
      existing.bullets = [...(existing.bullets || []), ...(role.bullets || [])];
      repaired.push(`deduped role: ${role.company || role.title}`);
      continue;
    }
    deduped.push(role);
  }

  const rehome = rehomeEmployerBullets(deduped, originalResumeText);
  repaired.push(...rehome.repaired);
  const enriched = enrichExperienceFromSource(rehome.experience, originalResumeText);
  return {
    experience: enriched.filter(
      (role) =>
        hasRoleStructure(role) &&
        !ACCOMPLISHMENT_VERB_RX.test(role.company || "") &&
        !ACCOMPLISHMENT_VERB_RX.test(role.title || ""),
    ),
    repaired,
  };
}

function parseCompanyFromBullet(bullet: string): string | null {
  const t = bullet.trim();
  const dash = t.split(/[—–-]/)[0]?.trim();
  if (dash && dash.length >= 3 && dash.length <= 70) return dash;
  return null;
}

function rehomeEmployerBullets(
  experience: CalibratedResumeData["experience"],
  originalResumeText: string,
): { experience: CalibratedResumeData["experience"]; repaired: string[] } {
  const repaired: string[] = [];
  const knownEmployers = extractKnownEmployers(originalResumeText).map((e) => ({
    raw: e,
    key: companyKey(e),
  }));

  const roles = experience.map((role) => ({
    ...role,
    bullets: [...(role.bullets || [])],
  }));

  for (const role of roles) {
    const keptBullets: string[] = [];
    for (const bullet of role.bullets) {
      if (!isCompanyLocationOnlyBullet(bullet)) {
        keptBullets.push(bullet);
        continue;
      }

      const companyFromBullet = parseCompanyFromBullet(bullet);
      if (!companyFromBullet) {
        repaired.push(`removed company-only bullet: ${bullet}`);
        continue;
      }

      const canonical = repairEmployerTypo(companyFromBullet, originalResumeText);
      const key = companyKey(canonical);
      const known = knownEmployers.find((e) => e.key === key || key.includes(e.key) || e.key.includes(key));

      if (!known) {
        repaired.push(`removed unknown company-only bullet: ${bullet}`);
        continue;
      }

      const existingIdx = roles.findIndex((r) => companiesMatch(r.company || "", canonical));
      if (existingIdx >= 0) {
        repaired.push(`removed duplicate company bullet under ${role.company || role.title}: ${bullet}`);
        continue;
      }

      roles.push({
        title: "",
        company: canonical,
        dates: "",
        bullets: [],
      });
      repaired.push(`re-homed employer from bullet: ${canonical}`);
    }
    role.bullets = keptBullets;
  }

  return {
    experience: roles.filter((r) => r.company || r.title || (r.bullets?.length ?? 0) > 0),
    repaired,
  };
}

/**
 * Scrub stale target-company artifacts and repair parse corruption on a
 * calibrated resume before preview/export.
 */
export function sanitizeCalibratedResume(
  resume: CalibratedResumeData,
  options: CalibratedResumeSanitizeOptions = {},
): CalibratedResumeSanitizeResult {
  const currentTarget = resolveTargetCompany(options.jdText || "");
  const originalResumeText = options.originalResumeText || "";
  const removed: string[] = [];
  const repaired: string[] = [];

  const out: CalibratedResumeData = {
    ...resume,
    header: { ...resume.header },
    core_competencies: [...(resume.core_competencies || [])],
    experience: (resume.experience || []).map((exp) => ({
      ...exp,
      bullets: [...(exp.bullets || [])],
    })),
    independent_projects: (resume.independent_projects || []).map((p) => ({
      ...p,
      bullets: [...(p.bullets || [])],
    })),
    certifications: [...(resume.certifications || [])],
    education: [...(resume.education || [])],
    skills: [...(resume.skills || [])],
    signal_keywords: [...(resume.signal_keywords || [])],
  };

  const summaryScrub = scrubTargetArtifactsFromText(out.summary || "", currentTarget);
  out.summary = summaryScrub.text;
  removed.push(...summaryScrub.removed);

  out.core_competencies = out.core_competencies
    .map((item) => repairUnmatchedCloseParen(item))
    .map((item) => scrubTargetArtifactsFromText(item, currentTarget).text)
    .filter((item) => item.trim() && !isOrphanFragment(item));

  out.certifications = out.certifications
    .map((item) => scrubTargetArtifactsFromText(item, currentTarget).text)
    .filter(Boolean);

  for (const exp of out.experience) {
    exp.company = repairEmployerTypo(exp.company || "", originalResumeText);
    exp.bullets = (exp.bullets || [])
      .map((b) => scrubTargetArtifactsFromText(b, currentTarget).text)
      .filter((b) => b.trim() && !isOrphanFragment(b) && !isWhyCompanyHeading(b));
  }

  const structureRepair = repairExperienceStructure(out.experience, originalResumeText);
  out.experience = structureRepair.experience;
  repaired.push(...structureRepair.repaired);

  const headerCanon = canonicalizeExperienceHeaders(out.experience, originalResumeText);
  out.experience = headerCanon.experience;
  repaired.push(...headerCanon.repaired);

  out.experience = enrichExperienceFromSource(out.experience, originalResumeText);
  const locationLocked = applySourceLocationOwnership(out.experience, originalResumeText, repaired);
  out.experience = enforceExperienceRenderInvariants(locationLocked, originalResumeText, repaired);

  out.independent_projects = out.independent_projects.map((proj) => ({
    ...proj,
    name: maybeNormalizeProjectName(proj.name || "", originalResumeText),
    description: scrubTargetArtifactsFromText(proj.description || "", currentTarget).text,
    bullets: (proj.bullets || [])
      .map((b) => scrubTargetArtifactsFromText(b, currentTarget).text)
      .filter((b) => b.trim() && !isOrphanFragment(b)),
  }));

  return { resume: out, removed, repaired };
}

/** Quick integrity check — returns human-readable issues after sanitization. */
export function validateCalibratedResumeIntegrity(resume: CalibratedResumeData): string[] {
  const issues: string[] = [];

  for (const item of resume.core_competencies || []) {
    if (item.includes(")") && (item.match(/\(/g) || []).length < (item.match(/\)/g) || []).length) {
      issues.push(`unmatched parenthesis in competency: ${item}`);
    }
  }

  for (const line of [resume.summary, ...(resume.certifications || [])].filter(Boolean)) {
    const why = extractWhyHeadingCompany(line.split(/\n/)[0] || "");
    if (why) issues.push(`residual WHY heading: ${why}`);
  }

  for (const exp of resume.experience || []) {
    for (const bullet of exp.bullets || []) {
      if (isOrphanFragment(bullet)) issues.push(`orphan fragment bullet: ${bullet}`);
      if (isCompanyLocationOnlyBullet(bullet)) issues.push(`company-only bullet: ${bullet}`);
      if (isMisplacedRoleHeaderBullet(bullet)) issues.push(`misplaced role header bullet: ${bullet}`);
      if (isCompanyTitleHeaderBullet(bullet)) issues.push(`company/title header bullet: ${bullet}`);
    }
    if (exp.dates && !exp.company && !exp.title) {
      issues.push(`detached dates without role context: ${exp.dates}`);
    }
  }

  return issues;
}
