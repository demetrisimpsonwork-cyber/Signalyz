/**
 * Cover-letter addressee / salutation helpers.
 * Pure — safe to unit-test without rendering the cover letter UI.
 */

const INVALID_NAME_PARTS = new Set([
  "and",
  "or",
  "the",
  "a",
  "an",
  "for",
  "to",
  "of",
  "at",
  "in",
  "on",
  "key",
  "contact",
  "liaison",
  "customers",
  "customer",
  "hiring",
  "team",
  "manager",
  "recruiter",
]);

/** True when text looks like a real person name (First Last), not JD boilerplate. */
export function isValidPersonName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return false;
  return parts.every((part) => {
    const lower = part.toLowerCase();
    if (INVALID_NAME_PARTS.has(lower)) return false;
    return /^[A-Z][a-zA-Z'-]{1,}$/.test(part);
  });
}

export function inferCompanyNameFromJd(jd: string): string | undefined {
  if (!jd?.trim()) return undefined;
  const patterns = [
    /(?:company|employer|organization)[:\s]+([A-Z][\w &.,'-]+)/i,
    /(?:about|join|at)\s+([A-Z][\w'-]{2,40})(?:\s*[,.\n])/i,
    /value of\s+([A-Z][\w'-]{2,40})\s*:/i,
  ];
  for (const rx of patterns) {
    const m = jd.match(rx);
    const candidate = m?.[1]?.trim();
    if (candidate && candidate.length < 50 && !/\band\b/i.test(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export function inferHiringManagerFromJd(jd: string): string | undefined {
  if (!jd?.trim()) return undefined;
  const patterns = [
    /(?:hiring\s+manager|recruiter)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/,
    /(?:report(?:s|ing)\s+to)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/,
  ];
  for (const rx of patterns) {
    const m = jd.match(rx);
    const candidate = m?.[1]?.trim();
    if (candidate && isValidPersonName(candidate)) return candidate;
  }
  return undefined;
}

export interface CoverLetterAddressee {
  addresseeLine: string;
  salutation: string;
}

/** Build a paste-ready salutation; never emits "Dear and liaison,"-style artifacts. */
export function buildCoverLetterAddressee(jd: string): CoverLetterAddressee {
  const companyName = inferCompanyNameFromJd(jd);
  const hiringManager = inferHiringManagerFromJd(jd);

  if (hiringManager) {
    return {
      addresseeLine: hiringManager,
      salutation: `Dear ${hiringManager},`,
    };
  }

  if (companyName) {
    return {
      addresseeLine: `Hiring Team, ${companyName}`,
      salutation: `Dear ${companyName} Hiring Team,`,
    };
  }

  return {
    addresseeLine: "Hiring Team",
    salutation: "Dear Hiring Team,",
  };
}
