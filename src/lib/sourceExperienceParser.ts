/**
 * sourceExperienceParser — layout-agnostic source resume experience parsing
 * and source-truth role locking. Pure: no React/Deno APIs.
 */

import type { CalibratedResumeData } from "@/hooks/useResumeAssembly";

export interface SourceExperienceRole {
  company: string;
  title: string;
  dates: string;
  location: string;
  bullets: string[];
}

export interface SourceExperienceRoleWithId extends SourceExperienceRole {
  sourceRoleId: string;
}

const MONTH_NAME_RX =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
export const SOURCE_DATE_IN_LINE_RX = new RegExp(
  `(?:${MONTH_NAME_RX}\\s*,?\\s*)?(?:\\d{1,2}\\/)?\\d{4}\\s*[-–—to]+\\s*(?:present|current|(?:${MONTH_NAME_RX}\\s+)?\\d{4})`,
  "i",
);
const ROLE_TITLE_RX =
  /\b(specialist|manager|analyst|coordinator|engineer|developer|director|lead|supervisor|associate|consultant|administrator|architect|representative|technician|executive|chief|senior|junior|principal|founder|builder|examiner|support|enablement)\b/i;
const COMPANY_SUFFIX_RX =
  /\b(inc\.?|llc|corp\.?|ltd\.?|co\.?|company|group|partners|consulting|services|solutions|technologies|enterprises|fund|department|labor|njdol)\b/i;
const COMPANY_TITLE_HEADER_RX =
  /^([A-Za-z][A-Za-z0-9&.'\-\s]{2,90}(?:\.ai)?)\s*[—–-]\s*(.+?)\.?\s*$/;
const EXPERIENCE_SECTION_RX =
  /^(?:experience|professional experience|work experience|employment history)\b/i;
const RESUME_SECTION_STOP_RX =
  /^(?:skills|certifications|education|core competencies|professional summary|projects|independent projects)\b/i;

function companyKey(name: string): string {
  return (name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function companiesMatch(a: string, b: string): boolean {
  const ka = companyKey(a);
  const kb = companyKey(b);
  if (!ka || !kb) return false;
  return ka === kb || ka.includes(kb) || kb.includes(ka);
}

function titlesMatch(a: string, b: string): boolean {
  const na = (a || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const nb = (b || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function repairEmployerTypo(name: string, originalResumeText = ""): string {
  if (!name?.trim()) return name;
  if (/^Asted\s+Fund/i.test(name) && /\bAST\s+Fund\s+Solutions\b/i.test(originalResumeText)) {
    return name.replace(/^Asted/i, "AST");
  }
  return name;
}

/** Normalize date range spacing while preserving source meaning. */
export function normalizeSourceDates(dates: string): string {
  if (!dates?.trim()) return "";
  return dates
    .trim()
    .replace(/\s*(?:-|–|—|\s+to\s+)\s*/gi, " – ")
    .replace(/\s+/g, " ")
    .replace(/\bpresent\b/i, "Present")
    .replace(/\bcurrent\b/i, "Present")
    .trim();
}

export function buildSourceRoleId(index: number, role: SourceExperienceRole): string {
  const company = companyKey(role.company || "");
  const title = (role.title || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 48);
  const dates = normalizeSourceDates(role.dates || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 32);
  return `${index}:${company}:${title}:${dates}`;
}

function extractDatesSubstring(text: string): string {
  const m = text.match(SOURCE_DATE_IN_LINE_RX);
  return m ? m[0] : "";
}

function extractYearTokens(dates: string): string[] {
  return (dates.match(/\d{4}/g) || []).slice(0, 2);
}

function datesExactlyMatch(a: string, b: string): boolean {
  const na = normalizeSourceDates(a).toLowerCase();
  const nb = normalizeSourceDates(b).toLowerCase();
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ya = extractYearTokens(a);
  const yb = extractYearTokens(b);
  return ya.length >= 2 && yb.length >= 2 && ya[0] === yb[0] && ya[1] === yb[1];
}

function isLocationOnlyValue(value: string): boolean {
  const t = (value || "").trim();
  if (!t) return false;
  if (/^remote$/i.test(t)) return true;
  if (/^[A-Za-z][A-Za-z\s.'-]+,\s*[A-Z]{2}$/.test(t)) return true;
  return false;
}

function isDateOnlyValue(value: string): boolean {
  const t = (value || "").trim();
  if (!t || !SOURCE_DATE_IN_LINE_RX.test(t)) return false;
  return t.replace(SOURCE_DATE_IN_LINE_RX, "").replace(/[-–—|]/g, "").trim().length < 3;
}

function parseLocationFromLine(trimmed: string): string {
  const pipeParts = trimmed.split("|").map((p) => p.trim()).filter(Boolean);
  for (const part of pipeParts) {
    if (SOURCE_DATE_IN_LINE_RX.test(part)) continue;
    if (isLocationOnlyValue(part)) return part;
  }
  if (/\|\s*Remote\b/i.test(trimmed)) return "Remote";
  const tail = trimmed.replace(SOURCE_DATE_IN_LINE_RX, "").replace(/^[|·\s-–—]+/, "").trim();
  if (isLocationOnlyValue(tail)) return tail;
  return "";
}

function parseDateAndLocationLine(line: string): { dates: string; location: string } | null {
  if (!SOURCE_DATE_IN_LINE_RX.test(line)) return null;
  const dates = normalizeSourceDates(extractDatesSubstring(line));
  const location = parseLocationFromLine(line);
  return { dates, location };
}

function isLikelyCompanyLine(line: string, originalResumeText: string): boolean {
  const t = (line || "").trim();
  if (!t || isLocationOnlyValue(t) || SOURCE_DATE_IN_LINE_RX.test(t)) return false;
  if (/[—–-]/.test(t) && COMPANY_TITLE_HEADER_RX.test(t)) return false;
  if (/\bSignalyz(?:\.ai)?\b/i.test(t)) return true;
  if (/\bnThrive\b/i.test(t)) return true;
  if (/\bAST\s+Fund/i.test(t)) return true;
  if (/\bDepartment of Labor\b/i.test(t)) return true;
  if (COMPANY_SUFFIX_RX.test(t)) return true;
  if (/^[A-Z][A-Za-z0-9&.'\-\s]{2,60}$/.test(t) && !ROLE_TITLE_RX.test(t)) return true;
  return false;
}

function parseCompanyTitleHeaderLine(
  line: string,
  originalResumeText: string,
): { company: string; title: string } | null {
  const t = line.trim();
  const m = t.match(COMPANY_TITLE_HEADER_RX);
  if (!m) return null;
  const company = repairEmployerTypo(m[1].trim(), originalResumeText);
  let title = m[2].trim().replace(/\.$/, "").trim();
  if (!company || !title) return null;
  if (/\|/.test(title)) {
    const segments = title.split("|").map((p) => p.trim()).filter(Boolean);
    const titleSegments = segments.filter(
      (p) => !SOURCE_DATE_IN_LINE_RX.test(p) && !isLocationOnlyValue(p),
    );
    if (!titleSegments.length) return null;
    title = titleSegments[0];
  }
  if (SOURCE_DATE_IN_LINE_RX.test(title) || isLocationOnlyValue(title)) return null;
  return { company, title };
}

function parseTitleDatesPipeLine(line: string): { title: string; dates: string } | null {
  if (!/\|/.test(line) || !SOURCE_DATE_IN_LINE_RX.test(line)) return null;
  const parts = line
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length !== 2) return null;

  const firstHasDate = SOURCE_DATE_IN_LINE_RX.test(parts[0]);
  const secondHasDate = SOURCE_DATE_IN_LINE_RX.test(parts[1]);
  if (firstHasDate === secondHasDate) return null;

  const titlePart = secondHasDate ? parts[0] : parts[1];
  const datePart = secondHasDate ? parts[1] : parts[0];
  if (!titlePart || isLocationOnlyValue(titlePart) || isLikelyCompanyLine(titlePart, "")) return null;
  if (SOURCE_DATE_IN_LINE_RX.test(titlePart)) return null;

  return {
    title: titlePart,
    dates: normalizeSourceDates(extractDatesSubstring(datePart)),
  };
}

function parsePipeRoleHeaderLine(
  line: string,
  originalResumeText: string,
): { company: string; title: string; location: string; dates: string } | null {
  if (!/\|/.test(line)) return null;

  const dates = SOURCE_DATE_IN_LINE_RX.test(line)
    ? normalizeSourceDates(extractDatesSubstring(line))
    : "";
  const parts = line
    .split("|")
    .map((p) => p.trim())
    .map((p) => p.replace(SOURCE_DATE_IN_LINE_RX, "").trim())
    .filter(Boolean);

  if (parts.length < 2) return null;

  let headCompany = parts[0];
  let headTitle = "";
  const emDashHead = parseCompanyTitleHeaderLine(parts[0], originalResumeText);
  if (emDashHead) {
    headCompany = emDashHead.company;
    headTitle = emDashHead.title;
  }

  if (isLikelyCompanyLine(headCompany, originalResumeText)) {
    const titleParts = headTitle
      ? [headTitle, ...parts.slice(1)]
      : parts.slice(1);
    const locationParts = titleParts.filter((p) => isLocationOnlyValue(p));
    const nonLocationParts = titleParts.filter((p) => !isLocationOnlyValue(p));

    if (locationParts.length && nonLocationParts.length >= 1) {
      return {
        company: repairEmployerTypo(headCompany, originalResumeText),
        title: nonLocationParts.join(" | "),
        location: locationParts[locationParts.length - 1],
        dates,
      };
    }

    if (parts.length >= 3 && isLocationOnlyValue(parts[parts.length - 1])) {
      return {
        company: repairEmployerTypo(headCompany, originalResumeText),
        title: headTitle || parts.slice(1, -1).join(" | "),
        location: parts[parts.length - 1],
        dates,
      };
    }

    return {
      company: repairEmployerTypo(headCompany, originalResumeText),
      title: headTitle || parts.slice(1).join(" | "),
      location: parseLocationFromLine(line),
      dates,
    };
  }

  if (ROLE_TITLE_RX.test(parts[0]) && isLikelyCompanyLine(parts[1], originalResumeText)) {
    return {
      company: repairEmployerTypo(parts[1], originalResumeText),
      title: parts[0],
      location: parts.length >= 3 && isLocationOnlyValue(parts[2]) ? parts[2] : "",
      dates,
    };
  }

  return null;
}

function normalizeBulletToken(text: string): string {
  return (text || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 96);
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

function locationsMatch(a: string, b: string): boolean {
  const na = (a || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const nb = (b || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
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
    else if (extractYearTokens(dates)[0] === extractYearTokens(source.dates)[0]) score += 350;
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

function mergeAdjacentBlockLayoutRoles(
  roles: SourceExperienceRole[],
  originalResumeText: string,
): SourceExperienceRole[] {
  const merged: SourceExperienceRole[] = [];
  let i = 0;

  while (i < roles.length) {
    const head = { ...roles[i], bullets: [...roles[i].bullets] };
    const tail = roles[i + 1];

    if (
      tail &&
      !head.bullets.length &&
      head.title &&
      !head.company &&
      isLikelyCompanyLine(tail.company, originalResumeText) &&
      tail.bullets.length > 0
    ) {
      merged.push({
        company: tail.company,
        title: head.title,
        dates: head.dates || tail.dates,
        location: tail.location || head.location,
        bullets: tail.bullets,
      });
      i += 2;
      continue;
    }

    if (
      tail &&
      !head.bullets.length &&
      head.company &&
      !head.title &&
      !isLikelyCompanyLine(head.company, originalResumeText) &&
      isLikelyCompanyLine(tail.company, originalResumeText) &&
      tail.bullets.length > 0
    ) {
      merged.push({
        company: tail.company,
        title: head.company,
        dates: head.dates || tail.dates,
        location: tail.location || head.location,
        bullets: tail.bullets,
      });
      i += 2;
      continue;
    }

    if (head.company && !head.title && !isLikelyCompanyLine(head.company, originalResumeText)) {
      head.title = head.company;
      head.company = "";
    }

    merged.push(head);
    i += 1;
  }

  return merged;
}

function attachDateLocationToCurrent(current: SourceExperienceRole, line: string): boolean {
  if (!current || current.dates) return false;
  if (!(current.company || current.title)) return false;
  const parsed = parseDateAndLocationLine(line);
  if (!parsed) return false;
  current.dates = parsed.dates;
  if (!current.location && parsed.location) current.location = parsed.location;
  return true;
}

/** Parse uploaded resume experience into source-truth roles (layout-agnostic). */
export function parseSourceExperienceRolesFromText(originalResumeText: string): SourceExperienceRole[] {
  if (!originalResumeText?.trim()) return [];

  const lines = originalResumeText.split(/\n/).map((l) => l.trim()).filter(Boolean);
  let startIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (EXPERIENCE_SECTION_RX.test(lines[i])) {
      startIdx = i + 1;
      break;
    }
  }

  const roles: SourceExperienceRole[] = [];
  let current: SourceExperienceRole | null = null;

  const flush = () => {
    if (!current) return;
    if (current.company && !current.title && !isLikelyCompanyLine(current.company, originalResumeText)) {
      current.title = current.company;
      current.company = "";
    }
    if (current.company || current.title || current.bullets.length > 0) {
      roles.push({
        company: repairEmployerTypo(current.company || "", originalResumeText),
        title: (current.title || "").trim(),
        dates: normalizeSourceDates(current.dates || ""),
        location: (current.location || "").trim(),
        bullets: [...current.bullets],
      });
    }
    current = null;
  };

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (RESUME_SECTION_STOP_RX.test(line) && !/^[-•*]/.test(line)) break;

    if (/^[-•*]/.test(line)) {
      if (!current) current = { company: "", title: "", dates: "", location: "", bullets: [] };
      current.bullets.push(line.replace(/^[-•*]\s*/, "").trim());
      continue;
    }

    if (current && attachDateLocationToCurrent(current, line)) continue;

    const titleDates = parseTitleDatesPipeLine(line);
    if (titleDates) {
      flush();
      current = {
        company: "",
        title: titleDates.title,
        dates: titleDates.dates,
        location: "",
        bullets: [],
      };
      continue;
    }

    const pipeHeader = parsePipeRoleHeaderLine(line, originalResumeText);
    if (pipeHeader) {
      flush();
      current = {
        company: pipeHeader.company,
        title: pipeHeader.title,
        dates: pipeHeader.dates,
        location: pipeHeader.location,
        bullets: [],
      };
      continue;
    }

    const companyTitle = parseCompanyTitleHeaderLine(line, originalResumeText);
    if (companyTitle) {
      flush();
      current = {
        company: companyTitle.company,
        title: companyTitle.title,
        dates: SOURCE_DATE_IN_LINE_RX.test(line) ? normalizeSourceDates(extractDatesSubstring(line)) : "",
        location: parseLocationFromLine(line),
        bullets: [],
      };
      continue;
    }

    if (SOURCE_DATE_IN_LINE_RX.test(line)) {
      const parsed = parseDateAndLocationLine(line);
      if (parsed && current && (current.company || current.title) && !current.dates) {
        current.dates = parsed.dates;
        if (!current.location && parsed.location) current.location = parsed.location;
        continue;
      }
      if (isDateOnlyValue(line)) {
        flush();
        current = {
          company: "",
          title: "",
          dates: parsed?.dates || normalizeSourceDates(extractDatesSubstring(line)),
          location: parsed?.location || "",
          bullets: [],
        };
        continue;
      }
    }

    if (isLocationOnlyValue(line)) {
      if (current && !current.location) current.location = line;
      continue;
    }

    if (current) {
      if (!current.company && isLikelyCompanyLine(line, originalResumeText)) {
        current.company = repairEmployerTypo(line, originalResumeText);
        continue;
      }
      if (
        !current.location &&
        isLocationOnlyValue(line) &&
        (current.company || current.title)
      ) {
        current.location = line;
        continue;
      }
      if (!current.title && !isLikelyCompanyLine(line, originalResumeText) && line.length >= 3) {
        current.title = line;
        continue;
      }
    }

    if (isLikelyCompanyLine(line, originalResumeText)) {
      flush();
      current = { company: repairEmployerTypo(line, originalResumeText), title: "", dates: "", location: "", bullets: [] };
      continue;
    }
  }

  flush();

  const deduped: SourceExperienceRole[] = [];
  for (const role of roles) {
    const existingIdx = deduped.findIndex(
      (r) =>
        companiesMatch(r.company, role.company) &&
        titlesMatch(r.title, role.title) &&
        datesExactlyMatch(r.dates, role.dates),
    );
    if (existingIdx >= 0) {
      const existing = deduped[existingIdx];
      if (!existing.location && role.location) existing.location = role.location;
      if (!existing.dates && role.dates) existing.dates = role.dates;
      existing.bullets.push(...role.bullets);
      continue;
    }
    deduped.push(role);
  }

  const consolidated = mergeAdjacentBlockLayoutRoles(deduped, originalResumeText);

  return consolidated.filter((r) => {
    const hasIdentity = Boolean(r.company || r.title);
    const hasEvidence = Boolean(r.dates || r.bullets.length > 0);
    if (!hasIdentity || !hasEvidence) return false;
    if (isLocationOnlyValue(r.company) && !r.title) return false;
    if (isLocationOnlyValue(r.title) && !r.company) return false;
    if (/^remote$/i.test(r.company) || /^remote$/i.test(r.title)) return false;
    return true;
  });
}

export function assignSourceRoleIds(roles: SourceExperienceRole[]): SourceExperienceRoleWithId[] {
  return roles.map((role, index) => ({
    ...role,
    sourceRoleId: buildSourceRoleId(index, role),
  }));
}

function roleFieldLooksLikeDate(value: string): boolean {
  const t = (value || "").trim();
  return Boolean(t) && (isDateOnlyValue(t) || SOURCE_DATE_IN_LINE_RX.test(t));
}

export function validateExperienceRoleShell(role: CalibratedResumeData["experience"][number]): string[] {
  const issues: string[] = [];
  const company = (role.company || "").trim();
  const title = (role.title || "").trim();
  const dates = (role.dates || "").trim();
  const location = (role.location || "").trim();

  if (!company) issues.push("empty company");
  if (!title) issues.push("empty title");
  if (!dates) issues.push("empty dates");
  if (roleFieldLooksLikeDate(company)) issues.push("company looks like date");
  if (roleFieldLooksLikeDate(title)) issues.push("title looks like date");
  if (isLocationOnlyValue(company)) issues.push("company looks like location");
  if (isLocationOnlyValue(title)) issues.push("title looks like location");
  if (location && (locationsMatch(location, company) || locationsMatch(location, title))) {
    issues.push("location duplicated as company/title");
  }
  if (/^remote$/i.test(company) || /^remote$/i.test(title)) issues.push("remote used as company/title");
  return issues;
}

/** Rebuild experience shells from source truth; preserve matched generated bullets. */
export function lockExperienceToSourceTruth(
  experience: CalibratedResumeData["experience"],
  originalResumeText: string,
  repaired: string[],
): CalibratedResumeData["experience"] {
  const sourceRoles = parseSourceExperienceRolesFromText(originalResumeText);
  if (!sourceRoles.length) return experience;

  const usedGenerated = new Set<number>();
  const locked: CalibratedResumeData["experience"] = [];

  for (const source of sourceRoles) {
    let bestIdx = -1;
    let bestScore = -1;
    for (let gi = 0; gi < experience.length; gi++) {
      if (usedGenerated.has(gi)) continue;
      const score = scoreSourceRoleMatch(experience[gi], source);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = gi;
      }
    }

    const generated = bestIdx >= 0 && bestScore >= 50 ? experience[bestIdx] : null;
    if (generated) usedGenerated.add(bestIdx);

    const bullets =
      generated?.bullets?.length && bestScore >= 50
        ? generated.bullets
        : source.bullets.length
          ? source.bullets
          : generated?.bullets || [];

    locked.push({
      company: source.company,
      title: source.title,
      dates: normalizeSourceDates(source.dates),
      location: source.location,
      bullets,
    });
    repaired.push(`locked role shell from source truth: ${source.company || source.title}`);
  }

  return locked;
}

export function enforceExperienceRenderInvariants(
  experience: CalibratedResumeData["experience"],
  originalResumeText: string,
  repaired: string[],
): CalibratedResumeData["experience"] {
  const sourceRoles = parseSourceExperienceRolesFromText(originalResumeText);
  if (!sourceRoles.length) {
    return experience.filter((role) => validateExperienceRoleShell(role).length === 0);
  }

  const output = lockExperienceToSourceTruth(experience, originalResumeText, repaired);

  return output.filter((role) => {
    const issues = validateExperienceRoleShell(role);
    if (issues.length) {
      repaired.push(`dropped invalid role shell: ${issues.join(", ")}`);
      return false;
    }
    return true;
  });
}
