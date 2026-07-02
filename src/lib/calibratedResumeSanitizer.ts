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
  /^[A-Z][A-Za-z0-9&.'\-\s]{2,70}\s*[—–-]\s*(?:Remote|[A-Z][a-z]+(?:,\s*[A-Z]{2})?)\.?\s*$/;
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
  return [...employers];
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

  const rehome = rehomeEmployerBullets(out.experience, originalResumeText);
  out.experience = rehome.experience;
  repaired.push(...rehome.repaired);

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
    }
  }

  return issues;
}
