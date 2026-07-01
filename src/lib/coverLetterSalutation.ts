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

// Words/phrases that mark a candidate as a slogan, benefit, or JD fragment —
// never a real company name. Matched case-insensitively as substrings.
const COMPANY_BLACKLIST = [
  "match", "secure your future", "secure", "future", "make a difference",
  "difference", "benefit", "ownership", "employee", "value", "liaison",
  "contact", "customer", "role", "opportunity", "satisfaction", "help",
  "hiring", "team", "position", "candidate", "applicant", "responsibilities",
  "requirements", "qualifications", "salary", "compensation", "equal",
];

// Connector words allowed inside a multi-word company name (non-leading only).
const COMPANY_CONNECTORS = new Set(["of", "and", "the", "&", "for"]);

/**
 * True only when `raw` looks like a real company name (proper noun, up to a few
 * Title-Cased tokens) and not a slogan, benefit line, or sentence fragment.
 */
export function isValidCompanyName(raw: string): boolean {
  const name = (raw || "").trim().replace(/[.,;:]+$/, "").trim();
  if (!name) return false;
  if (name.length < 2 || name.length > 40) return false;
  // No mid-string sentence punctuation → rejects taglines/fragments.
  if (/[.!?]/.test(name)) return false;

  const lower = name.toLowerCase();
  for (const bad of COMPANY_BLACKLIST) {
    if (lower.includes(bad)) return false;
  }

  const words = name.split(/\s+/);
  if (words.length > 4) return false;

  // Every token must be a proper noun (Title case or ALLCAPS acronym); only
  // small connectors are allowed, and only in non-leading positions. This alone
  // rejects fragments like "Match to help secure your future" (lowercase words).
  return words.every((word, idx) => {
    if (idx > 0 && COMPANY_CONNECTORS.has(word.toLowerCase())) return true;
    return /^[A-Z][A-Za-z0-9&'.-]*$/.test(word) || /^[A-Z]{2,}$/.test(word);
  });
}

/**
 * Confidently detect a real company name from the JD, or return undefined so the
 * caller falls back to "Dear Hiring Team,". Only validated proper-noun names are
 * accepted; slogans and benefit fragments are always rejected.
 */
export function inferCompanyNameFromJd(jd: string): string | undefined {
  if (!jd?.trim()) return undefined;

  // Capture "<preposition/label> <Proper Noun sequence>" candidates. The captured
  // group only extends through Title-Cased tokens, so it stops at the first
  // lowercase word (e.g. "At Graybar, we" → "Graybar").
  // Case-insensitive on the lead-in only; the captured text preserves original
  // casing, which isValidCompanyName re-checks to enforce proper-noun names.
  const candidatePattern =
    /(?:\b(?:at|join|with|for)\s+|\b(?:company|employer|organization)\s*[:\-]?\s*)([A-Za-z][A-Za-z0-9&'.-]+(?:\s+(?:of|and|the|&|for|[A-Za-z][A-Za-z0-9&'.-]+)){0,3})/gi;

  const tally = new Map<string, number>();
  let m: RegExpExecArray | null;
  while ((m = candidatePattern.exec(jd)) !== null) {
    const candidate = m[1]?.trim().replace(/[.,;:]+$/, "").trim();
    if (candidate && isValidCompanyName(candidate)) {
      tally.set(candidate, (tally.get(candidate) ?? 0) + 1);
    }
  }

  if (tally.size === 0) return undefined;
  // Prefer the most frequently mentioned valid company (real company names
  // repeat; incidental proper nouns usually appear once).
  let best: string | undefined;
  let bestCount = 0;
  for (const [name, count] of tally) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best;
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
