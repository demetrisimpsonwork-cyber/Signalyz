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
const DATE_IN_LINE_RX =
  /(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*,?\s*)?(?:\d{1,2}\/)?\d{4}\s*[-–—to]+\s*(?:present|current|\d{4})/i;
const ROLE_TITLE_RX =
  /\b(specialist|manager|analyst|coordinator|engineer|developer|director|lead|supervisor|associate|consultant|administrator|architect|representative|technician|executive|chief|senior|junior|principal|founder|builder)\b/i;
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

/** Extract company from a "WHY COMPANY" heading line. */
export function extractWhyHeadingCompany(line: string): string | null {
  const m = line.trim().match(WHY_HEADING_RX);
  return m ? m[1].trim() : null;
}

function companiesMatch(a: string, b: string): boolean {
  const ka = companyKey(a);
  const kb = companyKey(b);
  if (!ka || !kb) return false;
  return ka === kb || ka.includes(kb) || kb.includes(ka);
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
    location: /\bremote\b/i.test(trimmed) ? "Remote" : "",
  };
}

function lookupRoleMetadataFromSource(
  company: string,
  originalResumeText: string,
): SourceRoleMetadata | null {
  if (!originalResumeText?.trim() || !company?.trim()) return null;

  for (const line of originalResumeText.split(/\n/)) {
    const trimmed = line.trim().replace(/^[-•*]\s*/, "");
    if (!trimmed) continue;

    const hybrid = parseHybridExperienceLine(trimmed, originalResumeText);
    if (hybrid && companiesMatch(hybrid.company, company)) return hybrid;

    const pipeParsed = parseRoleHeaderBullet(trimmed);
    if (pipeParsed && companiesMatch(pipeParsed.company, company)) {
      return {
        company: repairEmployerTypo(pipeParsed.company, originalResumeText),
        title: pipeParsed.title,
        dates: pipeParsed.dates,
        location: /\bremote\b/i.test(trimmed) ? "Remote" : "",
      };
    }

    const companyTitle = parseCompanyTitleHeaderBullet(trimmed, originalResumeText);
    if (companyTitle && companiesMatch(companyTitle.company, company)) {
      const dates = DATE_IN_LINE_RX.test(trimmed) ? extractDatesSubstring(trimmed) : "";
      return {
        company: companyTitle.company,
        title: companyTitle.title,
        dates,
        location: /\bremote\b/i.test(trimmed) ? "Remote" : "",
      };
    }
  }
  return null;
}

function findSourceRoleByDates(dates: string, originalResumeText: string): SourceRoleMetadata | null {
  if (!dates?.trim() || !originalResumeText?.trim()) return null;

  let best: SourceRoleMetadata | null = null;
  let bestScore = -1;

  for (const line of originalResumeText.split(/\n/)) {
    const trimmed = line.trim().replace(/^[-•*]\s*/, "");
    if (!DATE_IN_LINE_RX.test(trimmed)) continue;

    const hybrid = parseHybridExperienceLine(trimmed, originalResumeText);
    if (hybrid) {
      const score = scoreDateMatch(dates, hybrid.dates);
      if (score > bestScore) {
        best = hybrid;
        bestScore = score;
      }
      continue;
    }

    const pipeParsed = parseRoleHeaderBullet(trimmed);
    if (pipeParsed?.company) {
      const candidate = {
        company: repairEmployerTypo(pipeParsed.company, originalResumeText),
        title: pipeParsed.title,
        dates: pipeParsed.dates || extractDatesSubstring(trimmed),
        location: /\bremote\b/i.test(trimmed) ? "Remote" : "",
      };
      const score = scoreDateMatch(dates, candidate.dates);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
      continue;
    }

    const companyTitle = parseCompanyTitleHeaderBullet(trimmed, originalResumeText);
    if (companyTitle) {
      const candidate = {
        company: companyTitle.company,
        title: companyTitle.title,
        dates: extractDatesSubstring(trimmed),
        location: /\bremote\b/i.test(trimmed) ? "Remote" : "",
      };
      const score = scoreDateMatch(dates, candidate.dates);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
  }

  return bestScore >= 0 ? best : null;
}

function appendLocationToDates(dates: string, location: string): string {
  const d = (dates || "").trim();
  const l = (location || "").trim();
  if (!l) return d;
  if (!d) return l;
  if (new RegExp(`\\b${l}\\b`, "i").test(d)) return d;
  return `${d} · ${l}`;
}

function enrichExperienceFromSource(
  experience: CalibratedResumeData["experience"],
  originalResumeText: string,
): CalibratedResumeData["experience"] {
  return experience.map((role) => {
    const next = { ...role, bullets: [...(role.bullets || [])] };
    let company = repairEmployerTypo(next.company || "", originalResumeText);
    let title = (next.title || "").trim();
    let dates = (next.dates || "").trim();

    if (/^remote$/i.test(company)) {
      dates = appendLocationToDates(dates, company);
      company = "";
    }

    const lookupKey = company || title;
    const fromSource =
      (lookupKey ? lookupRoleMetadataFromSource(lookupKey, originalResumeText) : null) ||
      ((!company || !title) && dates ? findSourceRoleByDates(dates, originalResumeText) : null);

    if (fromSource) {
      if (!company) company = fromSource.company;
      if (!title) title = fromSource.title;
      if (!dates && fromSource.dates) dates = fromSource.dates;
      if (fromSource.location) dates = appendLocationToDates(dates, fromSource.location);
    }

    next.company = company;
    next.title = title;
    next.dates = dates;
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
    if (parts.length === 1) return { title: "", company: parts[0], dates };
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
      current.dates = appendLocationToDates(current.dates, current.company);
      current.company = "";
      repaired.push("moved Remote from company field into dates");
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
