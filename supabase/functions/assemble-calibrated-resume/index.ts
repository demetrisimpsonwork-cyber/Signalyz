// assemble-calibrated-resume v3.0 — robust resume parser
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Fuzzy section header matching ───

const SECTION_PATTERNS: [RegExp, string][] = [
  [/^(professional\s+)?summary\s*(of\s+qualifications)?$/i, "summary"],
  [/^(career\s+)?(profile|objective|overview)$/i, "summary"],
  [/^(professional\s+|work\s+)?experience$/i, "experience"],
  [/^work\s+history$/i, "experience"],
  [/^employment(\s+history)?$/i, "experience"],
  [/^(relevant\s+)?experience$/i, "experience"],
  [/^(core\s+)?competenc(ies|y)$/i, "skills"],
  [/^(core\s+|technical\s+|key\s+)?skills(\s+&\s+abilities)?$/i, "skills"],
  [/^technical\s+(proficienc|competenc)(ies|y)$/i, "skills"],
  [/^areas?\s+of\s+expertise$/i, "skills"],
  [/^(professional\s+)?certifications?(\s+&\s+licens(es|ure))?$/i, "certifications"],
  [/^licens(es|ure)(\s+&\s+certifications?)?$/i, "certifications"],
  [/^education(\s+&\s+training)?$/i, "education"],
  [/^academic(\s+background)?$/i, "education"],
  [/^(independent\s+|personal\s+|side\s+)?projects?$/i, "projects"],
  [/^awards?(\s+&\s+honors?)?$/i, "awards"],
  [/^honors?(\s+&\s+awards?)?$/i, "awards"],
  [/^volunteer(\s+experience)?$/i, "volunteer"],
  [/^publications?$/i, "publications"],
];

function fuzzyMatch(text: string, pattern: string, threshold = 0.85): boolean {
  const a = text.toLowerCase().replace(/[^a-z\s]/g, "").trim();
  const b = pattern.toLowerCase().replace(/[^a-z\s]/g, "").trim();
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  // Simple similarity: longest common subsequence ratio
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return true;
  let matches = 0;
  let j = 0;
  for (let i = 0; i < longer.length && j < shorter.length; i++) {
    if (longer[i] === shorter[j]) { matches++; j++; }
  }
  return (matches / longer.length) >= threshold;
}

function detectSectionHeader(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 60) return null;

  // Remove common decorators
  const cleaned = trimmed
    .replace(/^[-=_*#►▪•]+\s*/, "")
    .replace(/\s*[-=_*#►▪•]+$/, "")
    .replace(/[:]\s*$/, "")
    .trim();
  if (!cleaned || cleaned.length > 50) return null;

  // Check if it looks like a header: ALL CAPS, or matches known patterns
  const isAllCaps = cleaned === cleaned.toUpperCase() && /[A-Z]{3,}/.test(cleaned);
  const isShort = cleaned.split(/\s+/).length <= 5;

  for (const [rx, section] of SECTION_PATTERNS) {
    if (rx.test(cleaned)) return section;
  }

  // Fuzzy match against known section names
  if (isAllCaps && isShort) {
    const sectionNames = [
      "professional summary", "summary", "core competencies", "skills",
      "professional experience", "experience", "work history", "employment history",
      "education", "certifications", "independent projects", "projects",
      "awards", "honors", "volunteer experience", "publications",
    ];
    for (const name of sectionNames) {
      if (fuzzyMatch(cleaned, name, 0.85)) {
        if (name.includes("summary") || name.includes("profile") || name.includes("objective")) return "summary";
        if (name.includes("experience") || name.includes("work") || name.includes("employment")) return "experience";
        if (name.includes("skill") || name.includes("competenc") || name.includes("expertise")) return "skills";
        if (name.includes("certif") || name.includes("licens")) return "certifications";
        if (name.includes("education") || name.includes("academic")) return "education";
        if (name.includes("project")) return "projects";
        if (name.includes("award") || name.includes("honor")) return "awards";
        if (name.includes("volunteer")) return "volunteer";
        if (name.includes("publication")) return "publications";
      }
    }
  }

  return null;
}

// ─── Role entry detection ───

const DATE_RX = /(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*,?\s*)?(?:\d{1,2}\/)?(\d{4})\s*[-–—to]+\s*(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*,?\s*)?(?:\d{1,2}\/)?(present|current|\d{4})/i;

const SINGLE_DATE_RX = /(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*,?\s*)?\d{4}/i;

const YEAR_RX = /\b(19|20)\d{2}\b/;

const BULLET_RX = /^[\s]*[-•▪►*]\s+/;
const COMPANY_SUFFIXES = /\b(inc\.?|llc|corp\.?|ltd\.?|co\.?|company|group|partners|consulting|services|solutions|technologies|enterprises|international|associates)\b/i;
const ROLE_TITLE_RX = /\b(specialist|manager|analyst|coordinator|engineer|developer|director|lead|supervisor|associate|consultant|administrator|architect|designer|officer|president|vice\s+president|vp|intern|assistant|head\s+of|representative|technician|executive|chief|senior|junior|principal)\b/i;
const LOCATION_LINE_RX = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,?\s+[A-Z]{2}(?:\s+\d{5})?$/;
const EDU_KEYWORDS_TITLE = /\b(university|college|bachelor|master|b\.?s\.?|b\.?a\.?|m\.?s\.?|m\.?a\.?|m\.?b\.?a\.?|ph\.?d|associate|diploma|gpa|degree|school|institute|academy)\b/i;
const SECTION_HEADER_TITLE_RX = /^(EXPERIENCE|EDUCATION|SKILLS|SUMMARY|PROFILE|CONTACT|CERTIFICATIONS?|CORE\s+COMPETENCIES|PROFESSIONAL\s+SUMMARY|WORK\s+HISTORY|EMPLOYMENT)\s*$/i;

const ACTION_VERB_SET_TITLE = new Set([
  "managed","led","developed","created","built","improved","directed",
  "established","implemented","executed","organized","analyzed","designed",
  "maintained","delivered","coordinated","supported","reduced","increased",
  "streamlined","automated","facilitated","negotiated",
  "launched","oversaw","supervised","trained","partnered","resolved",
  "provided","reported","documented","monitored","tracked","planned",
  "produced","optimized","communicated","communicate",
]);

/** Returns true if the string looks contaminated (location, education, bullet, section header) */
function isFieldContaminated(v: string): boolean {
  if (!v) return false;
  const t = v.trim();
  if (LOCATION_LINE_RX.test(t)) return true;
  if (EDU_KEYWORDS_TITLE.test(t)) return true;
  if (SECTION_HEADER_TITLE_RX.test(t)) return true;
  if (t.length > 80) return true; // too long to be a title or company
  // Starts with action verb — it's a bullet fragment
  const firstWord = t.split(/[\s,]/)[0]?.toLowerCase() || "";
  if (ACTION_VERB_SET_TITLE.has(firstWord)) return true;
  // Contact pattern
  if (/[\w.+-]+@[\w.-]+\.\w{2,}/.test(t)) return true;
  if (/(?:\(\d{3}\)[\s.-]?\d{3}[\s.-]?\d{4}|\d{3}[-.\s]\d{3}[-.\s]\d{4})/.test(t)) return true;
  // Bullet-prefix patterns from PDF copy-paste: "o Provide...", "• Managed..."
  if (/^o\s+[A-Z]/.test(t)) return true;
  // Sentence-like content (contains multiple clauses/commas and reads like a bullet)
  if (t.split(/\s+/).length > 10) return true;
  // Financial figures contamination
  if (/\$[\d,.]+/.test(t)) return true;
  // Lowercase-starting fragments that aren't proper titles/companies (e.g., "beverage from")
  if (/^[a-z]/.test(t)) return true;
  // Ends with a preposition/conjunction — likely a sentence fragment
  if (/\b(from|for|and|with|the|of|to|in|on|at|by)\s*$/i.test(t) && t.split(/\s+/).length <= 4) return true;
  return false;
}

/** Sanitize a title field — blank it out if contaminated */
function sanitizeTitle(v: string): string {
  if (isFieldContaminated(v)) return "";
  return v.trim();
}

/** Sanitize a company field — blank it out if contaminated */
function sanitizeCompany(v: string): string {
  if (isFieldContaminated(v)) return "";
  return v.trim();
}

interface ParsedRole {
  title: string;
  company: string;
  dates: string;
  bullets: string[];
}

/**
 * Detect if a line looks like a job entry header (Company | Title | Year pattern).
 * Used to prevent nesting role headers as bullets inside a previous role.
 */
function isJobEntryHeader(line: string): boolean {
  const trimmed = line.trim();
  // Must contain a 4-digit year
  if (!YEAR_RX.test(trimmed)) return false;
  // Must be reasonably short (not a full sentence/bullet)
  if (trimmed.length > 120) return false;
  // Should contain a separator (|, —, –, ·) OR have multiple segments
  const hasSeparator = /[|—–·]/.test(trimmed);
  const hasDateRange = DATE_RX.test(trimmed);
  // Pattern: "Company (via Something) | Title | Year"
  if (hasSeparator && YEAR_RX.test(trimmed)) return true;
  // Pattern: line with date range and short enough to be a header
  if (hasDateRange && trimmed.length < 100) return true;
  // Pattern: line has company suffix + year
  if (COMPANY_SUFFIXES.test(trimmed) && YEAR_RX.test(trimmed) && trimmed.length < 80) return true;
  return false;
}

function parseRoleHeaderLine(line: string): { title: string; company: string; dates: string } {
  const trimmed = line.trim();
  const dateMatch = trimmed.match(DATE_RX);
  const dates = dateMatch ? dateMatch[0] : (trimmed.match(YEAR_RX)?.[0] || "");
  let remainder = trimmed.replace(DATE_RX, "").replace(/\b(19|20)\d{2}\b/, "").replace(/[|—–,·/]\s*$/, "").replace(/^\s*[|—–,·/]\s*/, "").trim();

  // Preserve raw remainder for fallback
  const rawRemainder = remainder;
  let title = remainder;
  let company = "";

  // Try splitting on common delimiters: | — – /
  const delimiterOrder = ["|", "—", "–", "/"];
  let splitDone = false;

  for (const delim of delimiterOrder) {
    if (!remainder.includes(delim)) continue;
    // For "/" only split if it looks structural (not part of "and/or")
    if (delim === "/" && /\b\w+\/\w+\b/.test(remainder) && remainder.split("/").length === 2) {
      const parts = remainder.split("/").map(s => s.trim());
      // Only split on / if one part is clearly company or title
      if (!COMPANY_SUFFIXES.test(parts[0]) && !COMPANY_SUFFIXES.test(parts[1]) &&
          !ROLE_TITLE_RX.test(parts[0]) && !ROLE_TITLE_RX.test(parts[1])) {
        continue; // skip — "/" is probably part of a phrase like "Sales/Marketing"
      }
    }
    const parts = remainder.split(delim).map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const compIdx = parts.findIndex(p => COMPANY_SUFFIXES.test(p));
      const titleIdx = parts.findIndex(p => ROLE_TITLE_RX.test(p));
      if (compIdx >= 0 && titleIdx >= 0 && compIdx !== titleIdx) {
        company = parts[compIdx];
        title = parts[titleIdx];
      } else if (compIdx >= 0) {
        company = parts[compIdx];
        title = parts.filter((_, i) => i !== compIdx).join(` ${delim} `);
      } else if (titleIdx >= 0) {
        title = parts[titleIdx];
        company = parts.filter((_, i) => i !== titleIdx).join(` ${delim} `);
      } else {
        // Default: first part = company, second = title
        company = parts[0];
        title = parts.slice(1).join(` ${delim} `);
      }
      splitDone = true;
      break;
    }
  }

  // Try comma-separated if no other delimiter worked
  if (!splitDone && remainder.includes(",")) {
    const parts = remainder.split(",").map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      if (ROLE_TITLE_RX.test(parts[parts.length - 1])) {
        title = parts[parts.length - 1];
        company = parts.slice(0, -1).join(", ");
      } else if (ROLE_TITLE_RX.test(parts[0])) {
        title = parts[0];
        company = parts.slice(1).join(", ");
      } else if (COMPANY_SUFFIXES.test(parts[0])) {
        company = parts[0];
        title = parts.slice(1).join(", ");
      }
    }
  }

  // Sanitize: if title looks like location/education/bullet, blank it
  title = sanitizeTitle(title);
  company = sanitizeCompany(company);

  // HARD REQUIREMENT: never return blank title — preserve raw header as fallback
  if (!title && !company) {
    title = rawRemainder;
  } else if (!title && company) {
    // If company was found but title is blank, check if company is actually a title
    if (ROLE_TITLE_RX.test(company) && !COMPANY_SUFFIXES.test(company)) {
      title = company;
      company = "";
    } else {
      title = rawRemainder; // preserve full raw as title
    }
  }

  return { title, company, dates };
}

function parseExperienceBlock(lines: string[]): ParsedRole[] {
  const roles: ParsedRole[] = [];
  let currentRole: ParsedRole | null = null;
  let pendingText: string[] = [];

  const flushPending = () => {
    if (currentRole && pendingText.length > 0) {
      for (const t of pendingText) {
        if (t.length > 15) currentRole.bullets.push(t);
      }
      pendingText = [];
    }
  };

  const commitRole = () => {
    flushPending();
    if (currentRole) {
      if (currentRole.title && !currentRole.company && currentRole.title.includes("|")) {
        const parts = currentRole.title.split("|").map(s => s.trim());
        if (parts.length >= 2) {
          currentRole.title = parts[0];
          currentRole.company = parts[1];
        }
      }
      // Final sanitization pass on title and company fields
      currentRole.title = sanitizeTitle(currentRole.title);
      currentRole.company = sanitizeCompany(currentRole.company);
      roles.push(currentRole);
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const isBullet = BULLET_RX.test(line);

    // CRITICAL: Before treating as bullet, check if line is a job entry header
    if (isBullet) {
      const bulletText = line.replace(BULLET_RX, "").trim();
      if (isJobEntryHeader(bulletText)) {
        // This is a role header disguised as a bullet — close current role, open new
        commitRole();
        const parsed = parseRoleHeaderLine(bulletText);
        currentRole = { title: parsed.title, company: parsed.company, dates: parsed.dates, bullets: [] };
        continue;
      }
      // Normal bullet
      if (currentRole) {
        flushPending();
        currentRole.bullets.push(bulletText);
      }
      continue;
    }

    // Check if this line is a job entry header (even without bullet prefix)
    if (isJobEntryHeader(line)) {
      commitRole();
      const parsed = parseRoleHeaderLine(line);
      currentRole = { title: parsed.title, company: parsed.company, dates: parsed.dates, bullets: [] };

      // Look ahead: next line might be company name if not detected
      if (!parsed.company && i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (nextLine && !DATE_RX.test(nextLine) && !BULLET_RX.test(nextLine) && nextLine.length < 60 && !isJobEntryHeader(nextLine) && !isFieldContaminated(nextLine)) {
          currentRole.company = nextLine;
          i++;
        }
      }
      continue;
    }

    const hasDate = DATE_RX.test(line);
    const hasCompanySuffix = COMPANY_SUFFIXES.test(line);
    const isShortLine = line.length < 80;

    // Detect a new role entry: line has a date range
    if (hasDate && !isBullet) {
      commitRole();
      const dateMatch = line.match(DATE_RX);
      const dates = dateMatch ? dateMatch[0] : "";
      let titleCompany = line.replace(DATE_RX, "").replace(/[|—–,·]\s*$/, "").replace(/^\s*[|—–,·]\s*/, "").trim();

      let title = titleCompany;
      let company = "";

      if (titleCompany.includes("|")) {
        const parts = titleCompany.split("|").map(s => s.trim());
        const compIdx = parts.findIndex(p => COMPANY_SUFFIXES.test(p));
        const titleIdx = parts.findIndex(p => ROLE_TITLE_RX.test(p));
        if (compIdx >= 0 && titleIdx >= 0 && compIdx !== titleIdx) {
          company = parts[compIdx]; title = parts[titleIdx];
        } else if (compIdx >= 0) {
          company = parts[compIdx]; title = parts.filter((_, i) => i !== compIdx).join(" | ");
        } else {
          title = parts[0]; company = parts.slice(1).join(" | ");
        }
      } else if (titleCompany.includes("—") || titleCompany.includes("–")) {
        const sep = titleCompany.includes("—") ? "—" : "–";
        const parts = titleCompany.split(sep).map(s => s.trim());
        if (COMPANY_SUFFIXES.test(parts[1] || "")) {
          title = parts[0]; company = parts[1];
        } else if (COMPANY_SUFFIXES.test(parts[0] || "")) {
          company = parts[0]; title = parts[1] || "";
        } else if (ROLE_TITLE_RX.test(parts[0]) && !ROLE_TITLE_RX.test(parts[1] || "")) {
          title = parts[0]; company = parts[1] || "";
        } else {
          title = parts[0]; company = parts[1] || "";
        }
      }

      // Sanitize
      title = sanitizeTitle(title);
      company = sanitizeCompany(company);

      currentRole = { title, company, dates, bullets: [] };

      if (!company && i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (nextLine && !DATE_RX.test(nextLine) && !BULLET_RX.test(nextLine) && nextLine.length < 60 && !isJobEntryHeader(nextLine) && !isFieldContaminated(nextLine)) {
          if (COMPANY_SUFFIXES.test(nextLine) || nextLine.length < 50) {
            currentRole.company = nextLine;
            i++;
          }
        }
      }
      continue;
    }

    // Detect role entry where company suffix is present and line is short
    if (!currentRole && isShortLine && hasCompanySuffix && !isBullet) {
      if (i + 1 < lines.length && DATE_RX.test(lines[i + 1].trim())) {
        commitRole();
        const nextLine = lines[i + 1].trim();
        const dateMatch = nextLine.match(DATE_RX);
        const dates = dateMatch ? dateMatch[0] : "";
        const titlePart = sanitizeTitle(nextLine.replace(DATE_RX, "").trim().replace(/[|—–,·]\s*$/, "").trim());
        currentRole = { title: titlePart || "", company: line, dates, bullets: [] };
        i++;
        continue;
      }
    }

    // Detect standalone company name line (no dates, short, proper-cased, no bullet)
    // followed by a title line or date line
    if (!currentRole && isShortLine && !isBullet && !hasDate && line.length > 2 && line.length < 60) {
      // Check if next line has a date or role title keyword
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        const nextHasDate = DATE_RX.test(nextLine) || YEAR_RX.test(nextLine);
        const nextHasTitle = ROLE_TITLE_RX.test(nextLine);
        if ((nextHasDate || nextHasTitle) && !isFieldContaminated(line)) {
          commitRole();
          const companyName = line;
          // Parse next line for title+dates
          if (nextHasDate) {
            const dateMatch = nextLine.match(DATE_RX);
            const dates = dateMatch ? dateMatch[0] : (nextLine.match(YEAR_RX)?.[0] || "");
            const titlePart = sanitizeTitle(nextLine.replace(DATE_RX, "").replace(/\b(19|20)\d{2}\b/, "").replace(/[|—–,·]\s*$/, "").replace(/^\s*[|—–,·]\s*/, "").trim());
            currentRole = { title: titlePart, company: companyName, dates, bullets: [] };
            i++;
          } else {
            currentRole = { title: sanitizeTitle(nextLine), company: companyName, dates: "", bullets: [] };
            i++;
          }
          continue;
        }
      }
    }

    // Plain text within a role — treat as bullet if long enough
    if (currentRole && line.length > 20) {
      pendingText.push(line);
      continue;
    }

    // Short text that might be a company name for current role
    if (currentRole && !currentRole.company && isShortLine && line.length < 60 && !isFieldContaminated(line)) {
      currentRole.company = line;
      continue;
    }
  }

  commitRole();
  return roles;
}

// ─── Education line validators ───

const EDU_KEYWORDS_RX = /\b(university|college|institute|school|academy|bachelor|master|associate|doctor|phd|mba|bs|ba|ms|ma|bba|bsc|msc|diploma|certificate|ged|high\s+school|degree)\b/i;

const EDU_REJECT_VERBS = new Set([
  "managed","led","developed","created","built","improved","directed",
  "established","implemented","executed","organized","analyzed","designed",
  "maintained","delivered","coordinated","supported","reduced","increased",
  "streamlined","automated","facilitated","negotiated",
  "launched","oversaw","supervised","trained","partnered","resolved",
  "provided","reported","documented","monitored","tracked","planned",
  "produced","optimized","communicate","communicated","oversee",
]);

function isEduLineValid(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 120) return false;
  // Reject lines that start with action verbs (experience bullets)
  const firstWord = trimmed.split(/[\s,]/)[0]?.toLowerCase().replace(/[^a-z]/g, "") || "";
  if (EDU_REJECT_VERBS.has(firstWord)) return false;
  // Reject contact patterns
  if (/[\w.+-]+@[\w.-]+\.\w{2,}/.test(trimmed)) return false;
  if (/(?:\(\d{3}\)[\s.-]?\d{3}[\s.-]?\d{4}|\d{3}[-.\s]\d{3}[-.\s]\d{4})/.test(trimmed)) return false;
  // Reject section header words that aren't education
  if (/^(EXPERIENCE|SKILLS|SUMMARY|PROFILE|CONTACT|CERTIFICATIONS?|PROFESSIONAL)\s*$/i.test(trimmed)) return false;
  return true;
}

/** Validate that a string is a plausible institution name, not body text */
function isValidInstitution(v: string): boolean {
  if (!v || v.length > 100) return false;
  if (/\$[\d,.]+/.test(v)) return false;
  if (v.split(/\s+/).length > 8) return false;
  const firstWord = v.split(/[\s,]/)[0]?.toLowerCase().replace(/[^a-z]/g, "") || "";
  if (EDU_REJECT_VERBS.has(firstWord)) return false;
  if (/^\d{4}\s*[-–—to]+\s*\d{4}$/.test(v.trim())) return false;
  if (/^\d{4}$/.test(v.trim())) return false;
  if (/[\w.+-]+@[\w.-]+\.\w{2,}/.test(v)) return false;
  if (/(?:\(\d{3}\)[\s.-]?\d{3}[\s.-]?\d{4}|\d{3}[-.\s]\d{3}[-.\s]\d{4})/.test(v)) return false;
  // Reject location-only strings: "City, ST" with no school name
  if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,?\s+[A-Z]{2}(?:\s+\d{5})?$/.test(v.trim())) return false;
  // Reject bullet prefix patterns
  if (/^o\s+[A-Z]/.test(v.trim())) return false;
  if (EDU_KEYWORDS_RX.test(v)) return true;
  if (v.length < 60 && /^[A-Z]/.test(v)) return true;
  return false;
}

/** Validate that a string is a plausible academic degree */
const DEGREE_KEYWORDS_RX = /\b(bachelor|master|associate|doctor|ph\.?d|m\.?b\.?a|b\.?s\.?|b\.?a\.?|m\.?s\.?|m\.?a\.?|b\.?b\.?a|b\.?sc|m\.?sc|diploma|certificate|ged|high\s+school|juris\s+doctor|j\.?d\.?|ll\.?m|ll\.?b|d\.?min|ed\.?d|a\.?a\.?s?|a\.?s\.?)\b/i;

function isValidDegree(v: string): boolean {
  if (!v) return false;
  const t = v.trim();
  if (!DEGREE_KEYWORDS_RX.test(t)) return false;
  if (/\$[\d,.]+/.test(t)) return false;
  const firstWord = t.split(/[\s,]/)[0]?.toLowerCase().replace(/[^a-z]/g, "") || "";
  if (EDU_REJECT_VERBS.has(firstWord)) return false;
  if (t.split(/\s+/).length > 12) return false;
  if (/^o\s+[A-Z]/.test(t)) return false;
  return true;
}

function parseEducationBlock(lines: string[]): Array<{ institution: string; degree: string; year: string }> {
  const entries: Array<{ institution: string; degree: string; year: string }> = [];
  let currentEntry: { institution: string; degree: string; year: string } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Gate: reject contaminated lines
    if (!isEduLineValid(trimmed)) continue;

    const yearMatch = trimmed.match(/\b(19|20)\d{2}\b/);

    // If line has a degree keyword, start new entry
    if (/\b(bachelor|master|associate|doctor|phd|mba|bs|ba|ms|ma|bba|bsc|msc|diploma|certificate|ged|high\s+school)\b/i.test(trimmed)) {
      if (currentEntry) entries.push(currentEntry);
      const degreeCandidate = trimmed.replace(/\b(19|20)\d{2}\b/g, "").replace(/[|—–,·]\s*$/, "").trim();
      currentEntry = {
        degree: isValidDegree(degreeCandidate) ? degreeCandidate : "",
        institution: "",
        year: yearMatch ? yearMatch[0] : "",
      };
    } else if (currentEntry && !currentEntry.institution) {
      // Validate before accepting as institution
      const candidate = trimmed.replace(/\b(19|20)\d{2}\b/g, "").trim();
      if (isValidInstitution(candidate)) {
        currentEntry.institution = candidate;
      }
      if (!currentEntry.year && yearMatch) currentEntry.year = yearMatch[0];
    } else if (EDU_KEYWORDS_RX.test(trimmed)) {
      // Only start a new entry if line has education indicators (not just a year)
      if (currentEntry) entries.push(currentEntry);
      const instCandidate = trimmed.replace(/\b(19|20)\d{2}\b/g, "").trim();
      currentEntry = {
        institution: isValidInstitution(instCandidate) ? instCandidate : "",
        degree: "",
        year: yearMatch ? yearMatch[0] : "",
      };
    } else if (yearMatch && EDU_KEYWORDS_RX.test(trimmed)) {
      if (currentEntry) entries.push(currentEntry);
      currentEntry = { institution: "", degree: "", year: yearMatch[0] };
    }
    // Otherwise skip — don't create entries from arbitrary text
  }
  if (currentEntry) entries.push(currentEntry);
  return entries;
}

function parseProjectsBlock(lines: string[]): Array<{ name: string; description: string; bullets: string[] }> {
  const projects: Array<{ name: string; description: string; bullets: string[] }> = [];
  let current: { name: string; description: string; bullets: string[] } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (BULLET_RX.test(trimmed)) {
      if (current) current.bullets.push(trimmed.replace(BULLET_RX, "").trim());
    } else if (!current || (trimmed.length < 60 && !BULLET_RX.test(trimmed))) {
      if (current) projects.push(current);
      current = { name: trimmed, description: "", bullets: [] };
    } else {
      current.description += (current.description ? " " : "") + trimmed;
    }
  }
  if (current) projects.push(current);
  return projects;
}

// ─── Phase 1: Full resume parser ───

function extractHeaderFromResume(text: string): any {
  const header = { name: "", title: "", email: "", phone: "", linkedin: "", location: "" };
  if (!text) return header;

  const lines = text.split("\n").map((l: string) => l.trim()).filter(Boolean);
  const emailRx = /[\w.+-]+@[\w.-]+\.\w{2,}/;
  const phoneRx = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
  const locationRx = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,?\s+[A-Z]{2}(?:\s+\d{5})?$/;
  const linkedinRx = /linkedin\.com\/in\/[\w-]+/i;

  const scanLimit = Math.min(lines.length, 12);

  for (let i = 0; i < scanLimit; i++) {
    const line = lines[i];

    // Stop at section headers
    if (detectSectionHeader(line)) break;

    // Email — scan all header lines
    if (!header.email) {
      const m = line.match(emailRx);
      if (m) header.email = m[0];
    }
    // Phone — scan all header lines, also match embedded in longer lines
    if (!header.phone) {
      const m = line.match(phoneRx);
      if (m) header.phone = m[0];
    }
    if (!header.linkedin) {
      const m = line.match(linkedinRx);
      if (m) header.linkedin = m[0];
    }
    if (!header.location && locationRx.test(line)) header.location = line;

    // Name: scan first 3 lines for name-like patterns
    if (!header.name && i <= 2 && line.length < 50 && !emailRx.test(line) && !phoneRx.test(line)) {
      const t = line.trim();
      // Reject known placeholders
      if (/^full\s+name$/i.test(t)) continue;
      if (/^(EXPERIENCE|EDUCATION|SKILLS|SUMMARY|PROFILE|CONTACT|CERTIFICATIONS?)/i.test(t)) continue;
      if (/^[\d()+\-.\s]+$/.test(t)) continue;
      if (linkedinRx.test(t)) continue;
      // Accept: "First Last", "First M. Last", "First Middle Last", "FIRST LAST"
      if (/^[A-Z][a-zA-Z'-]+(\s+[A-Z]\.?\s+)?(\s+[A-Z][a-zA-Z'-]+){0,2}$/.test(t)) {
        header.name = t;
      }
      // Also accept ALL CAPS names: "JOHN SMITH"
      else if (/^[A-Z]{2,}(\s+[A-Z]{2,}){0,2}$/.test(t) && t.length < 30) {
        // Convert to title case
        header.name = t.replace(/\b(\w)(\w*)/g, (_: string, first: string, rest: string) => first.toUpperCase() + rest.toLowerCase());
      }
    }
  }

  // If location not found by pattern, check for "City, ST" embedded in contact lines
  if (!header.location) {
    for (let i = 0; i < Math.min(lines.length, 8); i++) {
      const m = lines[i].match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,\s*[A-Z]{2})/);
      if (m) { header.location = m[1]; break; }
    }
  }

  // If email/phone not found in clean lines, try multi-field lines (e.g. "name@email.com | (555) 123-4567 | City, ST")
  if (!header.email || !header.phone) {
    for (let i = 0; i < Math.min(lines.length, 8); i++) {
      const line = lines[i];
      if (!header.email) { const m = line.match(emailRx); if (m) header.email = m[0]; }
      if (!header.phone) { const m = line.match(phoneRx); if (m) header.phone = m[0]; }
    }
  }

  return header;
}

function parseResumeTextIntoSections(text: string): any {
  const lines = text.split("\n");
  const sections: { type: string; lines: string[] }[] = [];
  let currentSection = { type: "preamble", lines: [] as string[] };

  // First pass: split into named sections
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const detectedSection = detectSectionHeader(trimmed);
    if (detectedSection) {
      if (currentSection.lines.length > 0 || currentSection.type !== "preamble") {
        sections.push(currentSection);
      }
      currentSection = { type: detectedSection, lines: [] };
      continue;
    }

    currentSection.lines.push(trimmed);
  }
  if (currentSection.lines.length > 0) sections.push(currentSection);

  // Second pass: parse each section by type
  const result: any = {
    experience: [],
    summary: "",
    education: [],
    skills: [],
    certifications: [],
    independentProjects: [],
  };

  // Confidence tracking
  let totalSections = 0;
  let parsedSections = 0;

  for (const section of sections) {
    totalSections++;

    switch (section.type) {
      case "summary":
        result.summary = section.lines.join(" ").trim();
        if (result.summary) parsedSections++;
        break;

      case "experience": {
        const roles = parseExperienceBlock(section.lines);
        if (roles.length > 0) {
          result.experience.push(...roles);
          parsedSections++;
        } else {
          // Low confidence: preserve as text block with a single role
          result.experience.push({
            title: "",
            company: "",
            dates: "",
            bullets: section.lines.filter(l => l.length > 10),
          });
        }
        break;
      }

      case "skills": {
        const allSkills: string[] = [];
        for (const line of section.lines) {
          // Split by common delimiters
          const parts = line.split(/[,•|►▪·;]/).map(s => s.replace(BULLET_RX, "").trim()).filter(s => s.length > 1 && s.length < 50);
          allSkills.push(...parts);
        }
        result.skills = allSkills;
        if (allSkills.length > 0) parsedSections++;
        break;
      }

      case "education": {
        const edu = parseEducationBlock(section.lines);
        result.education = edu;
        if (edu.length > 0) parsedSections++;
        break;
      }

      case "certifications": {
        result.certifications = section.lines.map(l => l.replace(BULLET_RX, "").trim()).filter(Boolean);
        if (result.certifications.length > 0) parsedSections++;
        break;
      }

      case "projects": {
        result.independentProjects = parseProjectsBlock(section.lines);
        if (result.independentProjects.length > 0) parsedSections++;
        break;
      }

      case "preamble": {
        // Lines before any section header — might contain experience if no sections detected
        // Check if there are date-like patterns suggesting roles
        const hasRoleData = section.lines.some(l => DATE_RX.test(l));
        if (hasRoleData) {
          const roles = parseExperienceBlock(section.lines);
          if (roles.length > 0) result.experience.push(...roles);
        }
        break;
      }

      default:
        // Unknown sections (awards, volunteer, publications) — preserve as certifications/extra
        if (section.type === "awards" || section.type === "volunteer" || section.type === "publications") {
          result.certifications.push(...section.lines.map(l => l.replace(BULLET_RX, "").trim()).filter(Boolean));
        }
        break;
    }
  }

  // If no sections were detected at all, try to parse the entire text as experience
  if (sections.length <= 1 && result.experience.length === 0) {
    const allLines = text.split("\n").map(l => l.trim()).filter(Boolean);
    // Skip header lines (first 3-5)
    const bodyLines = allLines.slice(3);
    const roles = parseExperienceBlock(bodyLines);
    if (roles.length > 0) {
      result.experience = roles;
    } else {
      // Last resort: split into bullet-like chunks
      const bullets = bodyLines.filter(l => l.length > 15);
      if (bullets.length > 0) {
        result.experience = [{ title: "", company: "", dates: "", bullets }];
      }
    }
  }

  return result;
}

function extractJDSignals(directorResult: any): string {
  const parts: string[] = [];
  if (directorResult.signal_classifier?.jd_signal_extraction) {
    const jd = directorResult.signal_classifier.jd_signal_extraction;
    if (jd.priority_summary) parts.push(`Employer priority: ${jd.priority_summary}`);
    if (jd.role_identity_signals?.length) parts.push(`Role signals: ${jd.role_identity_signals.join(", ")}`);
    if (jd.strategic_signals?.length) parts.push(`Strategic signals: ${jd.strategic_signals.join(", ")}`);
    if (jd.operational_signals?.length) parts.push(`Operational signals: ${jd.operational_signals.join(", ")}`);
    if (jd.leadership_signals?.length) parts.push(`Leadership signals: ${jd.leadership_signals.join(", ")}`);
  }
  if (directorResult.gap_analyzer?.priority_order?.length) {
    parts.push(`Signal gaps to address: ${directorResult.gap_analyzer.priority_order.join(", ")}`);
  }
  if (directorResult.signal_classifier?.target_level_inferred) {
    parts.push(`Target level: ${directorResult.signal_classifier.target_level_inferred}`);
  }
  if (directorResult.signal_classifier?.overall_seniority_alignment) {
    parts.push(`Alignment: ${directorResult.signal_classifier.overall_seniority_alignment}`);
  }
  return parts.join("\n");
}

function reorderCompetencies(skills: string[], directorResult: any): string[] {
  if (!skills.length) return skills;
  const jdSignals: string[] = [];
  const jdExtraction = directorResult.signal_classifier?.jd_signal_extraction;
  if (jdExtraction) {
    jdSignals.push(
      ...(jdExtraction.role_identity_signals || []),
      ...(jdExtraction.strategic_signals || []),
      ...(jdExtraction.operational_signals || []),
      ...(jdExtraction.leadership_signals || []),
      ...(jdExtraction.relationship_signals || []),
    );
  }
  if (!jdSignals.length) return skills;
  const jdLower = jdSignals.map(s => s.toLowerCase());
  const scored = skills.map(skill => {
    const skillLower = skill.toLowerCase();
    let score = 0;
    for (const sig of jdLower) {
      if (skillLower.includes(sig) || sig.includes(skillLower)) score += 3;
      const skillWords = skillLower.split(/\s+/);
      const sigWords = sig.split(/\s+/);
      for (const sw of skillWords) {
        if (sw.length > 3 && sigWords.some(w => w.includes(sw) || sw.includes(w))) score += 1;
      }
    }
    return { skill, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.skill);
}

function assembleStructureFromSignalData(directorResult: any, originalResume: string) {
  const report = directorResult;
  const header = extractHeaderFromResume(originalResume);

  let experience: any[] = [];
  let summary = "";
  let coreCompetencies: string[] = [];
  let skills: string[] = [];
  let certifications: string[] = [];
  let education: any[] = [];
  let independentProjects: any[] = [];
  let signalKeywords: string[] = [];

  const textToParse = report.export_builder?.final_resume_text || originalResume;
  if (textToParse) {
    const parsed = parseResumeTextIntoSections(textToParse);
    experience = parsed.experience;
    summary = parsed.summary;
    education = parsed.education;
    skills = parsed.skills;
    certifications = parsed.certifications;
    independentProjects = parsed.independentProjects;
  }

  // Core competencies: use actual skills parsed from the resume
  if (skills.length > 0) {
    coreCompetencies = skills.slice(0, 12);
  }
  if (coreCompetencies.length === 0 && report.export_builder?.core_competencies?.length) {
    coreCompetencies = report.export_builder.core_competencies;
  }

  // NEVER use dimension_scores keys as competencies

  coreCompetencies = reorderCompetencies(coreCompetencies, report);
  skills = reorderCompetencies(skills, report);

  // Signal keywords
  if (report.gap_analyzer?.rewrite_targets?.length) {
    const types = report.gap_analyzer.rewrite_targets
      .map((t: any) => t.upgrade_type)
      .filter(Boolean) as string[];
    signalKeywords = [...new Set(types)].map((t) =>
      t.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
    );
  }

  // Merge rewritten bullets into experience
  if (report.gap_analyzer?.rewrite_targets?.length && experience.length > 0) {
    const rewrites = report.gap_analyzer.rewrite_targets;
    for (const rw of rewrites) {
      if (!rw.version_a && !rw.rewritten_bullet) continue;
      const rewrittenText = rw.version_a || rw.rewritten_bullet || "";
      const originalRef = (rw.bullet_reference || "").toLowerCase().slice(0, 60);

      for (const exp of experience) {
        for (let bi = 0; bi < exp.bullets.length; bi++) {
          if (exp.bullets[bi].toLowerCase().slice(0, 60) === originalRef) {
            exp.bullets[bi] = rewrittenText;
            break;
          }
        }
      }
    }
  }

  return {
    header,
    summary,
    core_competencies: coreCompetencies,
    experience,
    independent_projects: independentProjects,
    skills,
    certifications,
    education,
    signal_keywords: signalKeywords,
  };
}

// ─── Signal Conversion Extraction ───
// Extracts transferable signal mappings from the director/alignment result
// so the resume generation prompts can apply signal conversion framing.

function extractSignalConversions(directorResult: any): string {
  const conversions: string[] = [];

  // 1. From hiring_pipeline_simulation signal_conversion_insight
  const pipeline = directorResult?.hiring_pipeline_simulation ||
    directorResult?.signal_model?.risk_projection?.stages ||
    directorResult?.signal_model?.hiring_pipeline_simulation || [];
  for (const stage of pipeline) {
    if (stage?.signal_conversion_insight &&
        !stage.signal_conversion_insight.toLowerCase().includes("no directly transferable signal")) {
      conversions.push(`• ${stage.stage}: ${stage.signal_conversion_insight}${stage.reposition_strategy ? ` → Strategy: ${stage.reposition_strategy}` : ""}`);
    }
  }

  // 2. From transferable_signal_detection
  const transferable = directorResult?.transferable_signal_detection ||
    directorResult?.signal_model?.transferable_signal_detection;
  if (transferable?.detected_capability) {
    conversions.push(`• Transferable capability: ${transferable.detected_capability} — ${transferable.why_it_transfers || ""}`);
    if (transferable.elevation_opportunity) {
      conversions.push(`  → Elevation: ${transferable.elevation_opportunity}`);
    }
  }

  // 3. From gap_strategy perception_gaps (titan-position)
  const perceptionGaps = directorResult?.gap_strategy?.perception_gaps || [];
  for (const gap of perceptionGaps.slice(0, 3)) {
    if (typeof gap === "string" && gap.length > 10) {
      conversions.push(`• Perception gap (not capability gap): ${gap}`);
    }
  }

  // 4. From repositioning_matrix matching_experience
  const matrix = directorResult?.repositioning_matrix || [];
  for (const entry of matrix.slice(0, 3)) {
    if (entry?.matching_experience && entry?.role_native_language) {
      conversions.push(`• Convert "${entry.matching_experience}" → "${entry.role_native_language}"`);
    }
  }

  if (conversions.length === 0) return "";
  return `\nSIGNAL CONVERSION CONTEXT (CRITICAL — apply these mappings in every rewrite):
These are transferable signals already present in the candidate's experience that map to the target role.
Frame these as CAPABILITIES the candidate already has, expressed in role-aligned language.
Do NOT treat these as gaps — treat them as perception issues to fix through language choices.
${conversions.join("\n")}`;
}

// ─── Phase 2: Focused sectional API calls with JD context ───

async function generateSummary(
  originalSummary: string,
  directorResult: any,
  originalResume: string,
  apiKey: string,
  requestId: string,
  rawJd?: string,
): Promise<string> {
  const jdSignals = extractJDSignals(directorResult);
  const jdSource = rawJd || jdSignals;
  const jdModel = rawJd ? buildSignalJdModel(rawJd) : null;
  const topPhrases = jdModel ? [...jdModel.bigrams.slice(0, 6), ...jdModel.trigrams.slice(0, 4)] : [];

  const signalConversionBlock = extractSignalConversions(directorResult);

  const context = [
    `Original summary: ${originalSummary}`,
    jdSource ? `\nTARGET JD SIGNAL CONTEXT:\n${jdSource}` : "",
    topPhrases.length > 0 ? `\nTOP JD PHRASES TO INCORPORATE:\n${topPhrases.map(p => `• ${p}`).join("\n")}` : "",
    signalConversionBlock,
    directorResult.director_signal_tier ? `Signal tier: ${directorResult.director_signal_tier.tier}` : "",
    `\nFirst 2000 chars of resume:\n${originalResume.slice(0, 2000)}`,
  ].filter(Boolean).join("\n");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        temperature: 0.3,
        system: `Rewrite this professional summary to align with the target role's hiring criteria and maximize JD keyword mirroring.

SIGNAL CONVERSION PRIORITY:
- If SIGNAL CONVERSION CONTEXT is provided, the summary MUST incorporate at least one converted capability.
- Frame existing experience using role-aligned language from the conversion mappings.
- The candidate should read as someone who already does this work — just in a different environment.
- Example: If "workflow management → order coordination" is a conversion, the summary should reference coordination/tracking capability, not generic "workflow" language.

RULES:
- Write 3-4 sentences, max 60 words total. Active voice only.
- Every sentence must reference verifiable experience from the original resume.
- Incorporate the target role's exact language and key phrases naturally throughout — this is critical for JD mirroring scoring.
- If TOP JD PHRASES are provided, weave 2-3 of them naturally into the summary where semantically valid.
- ZERO fabrication: do not invent experience, metrics, or capabilities not present in the original.

SENTENCE VARIATION (CRITICAL — prevents robotic uniformity):
- The first sentence must be a direct identity statement anchored to the candidate's strongest signal pillar (e.g., "Operations coordinator with 6+ years managing cross-functional workflows.").
- The second sentence must use a DIFFERENT structure — describe a specific capability or scope, not another identity claim.
- The third sentence (if needed) should reference a concrete outcome, tool, or domain from the resume.
- NEVER start two sentences with the same word or pattern. Vary openers: use a noun phrase, then a verb phrase, then a prepositional or qualifying phrase.
- NEVER open with: "Demonstrates", "Possesses", "Reflecting", "Highly accomplished", "Dedicated experience", "Experienced in", "Skilled in", "Proven track record".
- Do NOT use the pattern "Adjective noun with X years..." more than once.

TONE:
- Write like an experienced operator, not a marketing copywriter. No abstract claims, no "passionate about," no presentation language. State facts and capabilities plainly.

DOMAIN PRESERVATION: NEVER insert industry, sector, or company-type language from the JD (e.g., "manufacturing," "distribution," "healthcare," "logistics") unless that exact language already appears in the candidate's original resume. JD vocabulary may only describe HOW the candidate works — never WHERE they worked or WHAT industry they were in.

COMMERCIAL FUNCTION PRESERVATION: NEVER insert commercial, sales-support, quoting, pricing, prospecting, revenue-growth, product-spec, or manufacturing-function language from the JD unless the candidate's original resume explicitly demonstrates that function. If the original resume shows support/operations/coordination work, describe it as support/operations/coordination — do not reframe it as commercial or sales activity.

BANNED VERBS: NEVER use: leveraged, spearheaded, championed, pioneered, mobilized, orchestrated.

Return ONLY the summary text, no JSON, no quotes, no labels.`,
        messages: [{ role: "user", content: context }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    if (!response.ok) {
      console.error(`[assemble] [${requestId}] Summary API error: ${response.status}`);
      return originalSummary;
    }
    const data = await response.json();
    return data.content?.[0]?.text?.trim() || originalSummary;
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.error(`[assemble] [${requestId}] Summary generation failed: ${err.message}`);
    return originalSummary;
  }
}

const SIGNAL_STOP_WORDS = new Set([
  "the","and","for","with","that","this","from","your","you","our","are","was","were","have","has","had","will","can","must","should","into","onto","through","across","over","under","about","within","between","using","use","used","their","they","them","job","role","position","candidate","required","preferred","responsibilities","requirements","experience","ability","skills","skill","work","working","team","teams","customer","customers","service","services","business",
]);

const BANNED_SIGNAL_VERBS = new Set([
  "leveraged","spearheaded","championed","pioneered","mobilized","orchestrated",
]);

// Domain / industry / company-type nouns that must NEVER be injected into
// bullets or summaries unless they already appear in the candidate's original
// resume.  Injecting these fabricates WHERE the candidate worked.
const DOMAIN_INDUSTRY_TERMS = new Set([
  "manufacturing","distribution","warehouse","warehousing","logistics",
  "pharmaceutical","healthcare","hospitality","automotive","aerospace",
  "telecommunications","insurance","banking","fintech","biotech",
  "agriculture","mining","construction","real estate","retail",
  "e-commerce","ecommerce","saas","energy","oil","gas","chemical",
  "textile","food service","foodservice","transportation","shipping",
  "freight","supply chain","procurement","wholesale","fulfillment",
  "factory","plant operations","assembly line","production floor",
  "clinical","medical","patient care","nursing","pharmacy",
  "patient","patient-focused","patient scheduling","patient accounts",
  "ehr","electronic health records","health records","hipaa",
  "medical billing","medical office","credentialing","licensing",
  "prior authorization","insurance verification","cpt","icd-10",
  "epic","cerner","clinic","hospital","physician","dental",
  "hotel","restaurant","food and beverage","catering",
  "dealership","showroom","sales floor",
  "call center","contact center","help desk",
  "law firm","legal practice","law office",
  "accounting firm","cpa firm",
  "staffing agency","recruitment agency","temp agency",
  "nonprofit","non-profit","ngo",
  "government","federal","municipal","public sector",
  "military","defense","armed forces",
  "startup","venture","incubator",
  "distribution company","manufacturing company","sales support",
  "warehouse environment","manufacturing environment",
  "distribution center","fulfillment center",
  "production line","shop floor","lean manufacturing",
  "osha","safety standards",
]);

// Commercial / sales-support / revenue-growth / quoting / pricing phrases
// that must NOT be injected unless the candidate's resume explicitly contains them.
// These are distinct from domain/industry terms — they describe commercial FUNCTIONS
// the candidate may not have performed.
const COMMERCIAL_FUNCTION_TERMS = new Set([
  "pricing","pricing and availability","pricing information","pricing strategy",
  "pricing ownership","price quotes","price negotiation",
  "quoting","quoting ownership","quote generation","quote preparation","quotation",
  "prospecting","cold calling","lead generation","lead qualification",
  "sales development","business development","new business",
  "revenue growth","revenue generation","revenue targets","revenue goals",
  "sales volume","sales targets","sales goals","sales pipeline",
  "sales cycle","sales forecasting","sales strategy","sales planning",
  "sales support ownership","formal sales support",
  "upselling","cross-selling","upsell","cross-sell",
  "account acquisition","client acquisition","customer acquisition",
  "account growth","assigned account growth","grow accounts",
  "territory management","territory planning","territory development",
  "product specifications","product spec","product knowledge","product expertise",
  "product demonstrations","product demo","product presentation",
  "developing ongoing relationships","developing relationships to increase",
  "increase sales volume","increase sales","grow revenue","grow sales",
  "increasing sales volume","increasing revenue",
  "close deals","closing deals","deal closing","deal negotiation",
  "commission","quota attainment","quota achievement",
  "rfp","rfq","request for proposal","request for quote",
  "bid preparation","bid management","proposal writing",
  "market development","market expansion","market penetration",
  "competitive analysis","competitive intelligence","competitive positioning",
  "vendor evaluation","supplier evaluation",
  "purchase orders","purchasing","procurement strategy",
  "inventory management","inventory control","stock management",
  "inventory planning","inventory planning ownership",
  "bill of materials","bom","material requirements",
  "erp","mrp","material planning",
  // Additional commercial function phrases that overstate support roles
  "revenue-generating","revenue generating","profit margin",
  "sales-driven","sales driven","sales enablement",
  "demand generation","demand planning","demand forecasting",
  "order fulfillment ownership","shipping coordination ownership",
  "supply planning","material sourcing",
]);

// Pre-sorted longest-first for efficient domain fabrication stripping
const SORTED_ALL_BLOCKED_TERMS = [...DOMAIN_INDUSTRY_TERMS, ...COMMERCIAL_FUNCTION_TERMS].sort((a, b) => b.length - a.length);

// Pre-compiled regex patterns for domain + commercial terms
const DOMAIN_TERM_COMPILED = SORTED_ALL_BLOCKED_TERMS.map(term => ({
  term,
  rx: new RegExp(
    `(?:^|[\\s,;:(]|-)${escapeRegExp(term).replace(/\s+/g, "[\\s-]+")}(?:[-]\\w+)?(?=[\\s,;:.)!?]|$)`,
    "gi"
  ),
}));

/**
 * Returns true when `candidate` contains a domain / industry term that does
 * NOT appear anywhere in the candidate's original resume.  Injecting such a
 * term would fabricate the candidate's work environment.
 */
function isDomainFabrication(candidate: string, originalResumeText: string): boolean {
  const resumeLower = originalResumeText.toLowerCase();
  const candidateLower = candidate.toLowerCase();

  // Check domain/industry terms
  for (const term of DOMAIN_INDUSTRY_TERMS) {
    if (candidateLower.includes(term) && !resumeLower.includes(term)) {
      return true;
    }
  }
  // Check commercial/sales-support function terms
  for (const term of COMMERCIAL_FUNCTION_TERMS) {
    if (candidateLower.includes(term) && !resumeLower.includes(term)) {
      return true;
    }
  }
  return false;
}

/**
 * Strip domain-fabricated language from an AI-generated bullet.
 * This catches cases where the AI model itself injected industry/domain
 * terms despite prompt instructions — including hyphenated compounds
 * like "patient-focused" and phrases like "patient record management".
 */
function stripDomainFabricationFromBullet(bullet: string, originalResumeText: string): string {
  const resumeLower = originalResumeText.toLowerCase();
  const bulletLower = bullet.toLowerCase();
  let cleaned = bullet;

  // Use pre-compiled regexes with fast includes() gate
  for (const { term, rx } of DOMAIN_TERM_COMPILED) {
    if (resumeLower.includes(term)) continue; // Term exists in resume — not fabrication
    // Fast gate: skip regex if term root isn't even in the bullet
    const checkWord = term.includes(" ") ? term.split(" ")[0] : term;
    if (!bulletLower.includes(checkWord)) continue;

    rx.lastIndex = 0; // Reset stateful regex
    const beforeLen = cleaned.length;
    cleaned = cleaned.replace(rx, (match) => {
      const leadChar = match.match(/^[\s,;:(.-]/)?.[0] || "";
      return leadChar;
    });
    if (cleaned.length !== beforeLen) {
      cleaned = cleaned.replace(/\s{2,}/g, " ").replace(/,\s*,/g, ",").replace(/\s+,/g, ",").replace(/,\s*\./g, ".").trim();
    }
  }

  // Remove garbled injection artifacts
  cleaned = cleaned
    .replace(/,?\s*driving\s+(?:and\s+)?(?:including\s+)?(?:\w{0,3}\s*)*outcomes\b\.?/gi, "")
    .replace(/,?\s*aligned\s+with\s+(?:\w{0,3}\s*)*priorities\b\.?/gi, "")
    .replace(/,?\s*supporting\s+(?:\w{0,3}\s*)*objectives\b\.?/gi, "")
    .replace(/\b(in|at|for|within|across|of|the|a|an)\s+(in|at|for|within|across|of|the|a|an)\b/gi, "$1")
    .replace(/\b(and|or)\s+(and|or)\b/gi, "$1")
    .replace(/(\w+ing)\s+and\s+(\w+s\b)/gi, (match, verb, noun) => {
      if (/^[a-z]+ing$/i.test(verb) && !/^[a-z]+ing$/i.test(noun)) return `${verb} ${noun}`;
      return match;
    })
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,/g, ",")
    .replace(/\s+\./g, ".")
    .replace(/,\s*$/, "")
    .trim();

  if (cleaned.length > 0 && !/[.!?]$/.test(cleaned)) {
    cleaned += ".";
  }

  return cleaned;
}

const STRONG_SIGNAL_VERBS = [
  "led","drove","owned","architected","directed","launched","built","scaled","implemented","executed","transformed","governed","delivered","established","redesigned","devised","instituted","restructured","consolidated","accelerated","elevated","oversaw","administered","standardized","created","developed","designed","automated","negotiated","facilitated","optimized","revamped","formulated","engineered","deployed","maintained","resolved","streamlined","trained","mentored","supervised",
] as const;

const PARTIAL_SIGNAL_VERBS = [
  "managed","coordinated","responsible for","handled","worked on","contributed to","involved in","engaged","tracked","monitored","reviewed","prepared","processed","compiled","organized","planned","conducted","performed","served",
] as const;

const PASSIVE_SIGNAL_PHRASES = [
  "helped","assisted","supported","participated in","was involved","tasked with",
] as const;

const OUTCOME_SIGNAL_TERMS = [
  "increased","reduced","improved","grew","saved","delivered","achieved","exceeded","decreased","boosted","lowered","raised","generated","optimized","reducing","improving","streamlined","standardizing","minimized","eliminated","enhancing","resulting in","leading to","which led to","driving","enabling",
] as const;

const SIGNAL_SCOPE_RX = /(?:\$\s?\d[\d,.]*\s?[kmb]?(?:illion)?|\b\d+(?:\.\d+)?\s?%|\b\d+[x×]|\b\d+\+?\s?(?:team|teams|people|members|staff|engineers|reports|employees|headcount|users|customers|clients|accounts|projects|locations|regions|departments|stakeholders|hours|days|weeks|months|years|sites|offices|vendors|partners|units)|\bcross[- ]?functional\b|\bend[- ]?to[- ]?end\b|\benterprise[- ]?wide\b|\bglobal\b|\bregional\b|\bmulti[- ]?site\b|\bhigh[- ]?volume\b|\bportfolio\b|\bprogram\b|\bp&l\b|\bbudget\b|\brevenue\b|\bgovernance\b)/gi;

const SIGNAL_SEMANTIC_CLUSTERS = [
  ["escalation", "escalation handling", "issue resolution", "complaint", "dispute", "dispute resolution", "conflict resolution", "grievance", "case management", "issue triage", "customer issue", "problem resolution", "incident management", "service recovery"],
  ["sla", "service level", "service performance", "performance accountability", "service standard", "quality assurance", "case throughput", "response target", "response time", "turnaround time", "service metric", "service delivery"],
  ["complaint routing", "case management", "ticket management", "issue workflow", "case routing", "intake", "intake workflow", "customer issue workflow", "queue management", "triage", "work order"],
  ["cross-functional", "cross functional", "department collaboration", "interdepartmental", "multi-team", "cross-team", "collaborative", "stakeholder liaison", "team coordination", "department coordination", "department leadership", "inter-department"],
  ["process improvement", "process documentation", "operational efficiency", "workflow optimization", "continuous improvement", "process standardization", "lean", "six sigma", "operational improvement", "operational optimization", "efficiency improvement", "process redesign", "process engineering"],
  ["customer service", "customer support", "client service", "client support", "customer experience", "customer success", "customer relations", "client relations", "customer satisfaction", "customer retention", "customer engagement", "customer care", "service excellence"],
  ["leadership", "management", "supervision", "team lead", "team management", "people management", "staff management", "direct reports", "team oversight", "crew management", "shift management"],
  ["training", "coaching", "mentoring", "onboarding", "development", "upskilling", "staff development", "employee development", "performance coaching"],
  ["reporting", "analytics", "dashboards", "metrics", "kpi", "data analysis", "performance tracking", "performance monitoring", "trend analysis", "root cause analysis"],
  ["scheduling", "workforce planning", "capacity planning", "resource allocation", "staffing", "labor scheduling", "shift scheduling", "headcount planning"],
  ["vendor management", "supplier management", "third-party management", "partner management", "vendor relations", "contract management", "outsourcing"],
  ["budget", "cost management", "p&l", "financial oversight", "cost reduction", "expense management", "cost control", "budget accountability"],
  ["compliance", "regulatory", "audit", "policy", "governance", "risk management", "quality control", "standard operating procedure", "sop"],
  ["stakeholder", "executive", "senior leadership", "c-suite", "board", "sponsor", "executive reporting", "leadership briefing"],
  ["retail", "store operations", "floor management", "merchandising", "point of sale", "inventory", "store performance", "retail supervision"],
  ["operations", "operational", "ops", "logistics", "supply chain", "fulfillment", "distribution", "warehouse", "order management"],
] as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSignalText(text: string): string {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function tokenizeSignalText(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+(?:[+#/&-][a-z0-9]+)*/g) || [];
}

function stemSignalToken(word: string): string {
  return word
    .replace(/ies$/, "i")
    .replace(/ied$/, "i")
    .replace(/(ing|tion|ment|ness|ence|ance|ity|ous|ive|ful|less|able|ible|ated|ting|sion)$/, "")
    .replace(/s$/, "")
    .replace(/ed$/, "");
}

function countSignalPhraseHits(text: string, phrases: readonly string[]): number {
  return phrases.reduce((sum, phrase) => {
    const escaped = escapeRegExp(phrase).replace(/\s+/g, "\\s+");
    const rx = new RegExp(`\\b${escaped}\\b`, "gi");
    return sum + ((text.match(rx) || []).length);
  }, 0);
}

function densityPer100Words(hits: number, tokenCount: number): number {
  const units = Math.max(tokenCount / 100, 1);
  return hits / units;
}

function buildSignalJdModel(jdText: string) {
  const normalized = normalizeSignalText(jdText.toLowerCase());
  const tokens = tokenizeSignalText(normalized).filter((token) => token.length >= 4 && !SIGNAL_STOP_WORDS.has(token));
  const tokenFreq = new Map<string, number>();
  for (const token of tokens) {
    tokenFreq.set(token, (tokenFreq.get(token) || 0) + 1);
  }

  const keywords = [...tokenFreq.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return b[0].length - a[0].length;
    })
    .slice(0, 15)
    .map(([token]) => token);

  const stemmedKeywords = [...new Set(keywords.map(stemSignalToken))].filter((token) => token.length >= 3);

  const sentences = normalized.split(/[\n.;:!?]+/).map((segment) => segment.trim()).filter(Boolean);
  const bigramFreq = new Map<string, number>();
  const trigramFreq = new Map<string, number>();
  for (const sentence of sentences) {
    const sentenceTokens = tokenizeSignalText(sentence).filter((token) => token.length >= 3 && !SIGNAL_STOP_WORDS.has(token));
    for (let i = 0; i < sentenceTokens.length - 1; i++) {
      const bigram = `${sentenceTokens[i]} ${sentenceTokens[i + 1]}`;
      bigramFreq.set(bigram, (bigramFreq.get(bigram) || 0) + 1);
    }
    for (let i = 0; i < sentenceTokens.length - 2; i++) {
      const trigram = `${sentenceTokens[i]} ${sentenceTokens[i + 1]} ${sentenceTokens[i + 2]}`;
      trigramFreq.set(trigram, (trigramFreq.get(trigram) || 0) + 1);
    }
  }

  const bigrams = [...bigramFreq.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return b[0].length - a[0].length;
    })
    .slice(0, 12)
    .map(([bigram]) => bigram);

  const trigrams = [...trigramFreq.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return b[0].length - a[0].length;
    })
    .slice(0, 8)
    .map(([trigram]) => trigram);

  const clusterTerms = SIGNAL_SEMANTIC_CLUSTERS.map((cluster) =>
    [...cluster]
      .filter((term) => new RegExp(`\\b${escapeRegExp(term).replace(/\s+/g, "\\s+")}\\b`, "i").test(normalized))
      .sort((a, b) => b.length - a.length)
  );

  return { keywords, stemmedKeywords, bigrams, trigrams, clusterTerms };
}

interface SignalSnapshot {
  ownershipDensity: number;
  keywordCoverage: number;
  verbLeadRate: number;
  outcomeDensity: number;
  passiveDensity: number;
}

function measureSignalSnapshot(resumeText: string, jdModel: ReturnType<typeof buildSignalJdModel>): SignalSnapshot {
  const normalized = normalizeSignalText(resumeText);
  const tokens = tokenizeSignalText(normalized);
  const tokenSet = new Set(tokens);
  const stemSet = new Set(tokens.map(stemSignalToken).filter((token) => token.length >= 3));
  const lower = normalized.toLowerCase();

  const ownershipStrong = countSignalPhraseHits(lower, STRONG_SIGNAL_VERBS);
  const passiveHits = countSignalPhraseHits(lower, PASSIVE_SIGNAL_PHRASES);
  const outcomeHits = countSignalPhraseHits(lower, OUTCOME_SIGNAL_TERMS);
  const quantifiedHits = (lower.match(/(?:\$\s?\d+[\d,.]*\s?[kmb]?|\b\d+(?:\.\d+)?\s?%|\b\d+[x×]|\b\d+\s?(?:customers|clients|teams|projects|accounts|locations|regions|departments|stakeholders|hours|days|weeks|months|years))\b/gi) || []).length;

  const exactHits = jdModel.keywords.reduce((sum, token) => sum + (tokenSet.has(token) ? 1 : 0), 0);
  const stemHits = jdModel.stemmedKeywords.reduce((sum, token) => sum + (stemSet.has(token) ? 1 : 0), 0);
  const keywordCoverage = Math.max(
    exactHits / Math.max(jdModel.keywords.length, 1),
    (stemHits / Math.max(jdModel.stemmedKeywords.length, 1)) * 0.92,
  );

  const bulletLines = normalized.split(/\n/).map((line) => line.trim()).filter((line) => line.length > 15);
  const allLeadVerbs = [...STRONG_SIGNAL_VERBS, ...PARTIAL_SIGNAL_VERBS];
  const verbLedCount = bulletLines.reduce((count, line) => {
    const lowerLine = line.toLowerCase();
    return count + (allLeadVerbs.some((verb) => lowerLine.startsWith(verb)) ? 1 : 0);
  }, 0);

  return {
    ownershipDensity: densityPer100Words(ownershipStrong, tokens.length),
    keywordCoverage,
    verbLeadRate: bulletLines.length > 0 ? verbLedCount / bulletLines.length : 0,
    outcomeDensity: densityPer100Words(outcomeHits + quantifiedHits, tokens.length),
    passiveDensity: densityPer100Words(passiveHits, tokens.length),
  };
}

function countImprovedDimensions(originalText: string, finalText: string, jdModel: ReturnType<typeof buildSignalJdModel>) {
  const originalSignals = measureSignalSnapshot(originalText, jdModel);
  const finalSignals = measureSignalSnapshot(finalText, jdModel);

  const flags = {
    ownership: finalSignals.ownershipDensity - originalSignals.ownershipDensity > 0.03,
    keywords: finalSignals.keywordCoverage - originalSignals.keywordCoverage > 0.03,
    verbLead: finalSignals.verbLeadRate - originalSignals.verbLeadRate > 0.03,
    outcome: finalSignals.outcomeDensity - originalSignals.outcomeDensity > 0.02,
    passive: originalSignals.passiveDensity - finalSignals.passiveDensity > 0.01,
  };

  return {
    originalSignals,
    finalSignals,
    flags,
    improvementCount: Object.values(flags).filter(Boolean).length,
  };
}

function structuredResumeToText(resume: any): string {
  const lines: string[] = [];
  if (resume.summary) lines.push("SUMMARY", resume.summary);
  if (Array.isArray(resume.experience) && resume.experience.length > 0) {
    lines.push("EXPERIENCE");
    for (const exp of resume.experience) {
      const header = [exp.title, exp.company, exp.dates].filter(Boolean).join(" | ");
      if (header) lines.push(header);
      for (const bullet of exp.bullets || []) lines.push(`- ${bullet}`);
    }
  }
  return lines.join("\n");
}

function getLeadWord(text: string): string {
  return text.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") || "";
}

function appendClause(bullet: string, clause: string): string {
  const base = bullet.trim().replace(/[\s,.;:]+$/, "");
  const cleanClause = clause.trim().replace(/^[\s,.;:]+/, "").replace(/[\s,.;:]+$/, "");
  if (!cleanClause) return `${base}.`;
  return `${base}, ${cleanClause}.`;
}

function countKeywordMatchesInBullet(bullet: string, jdModel: ReturnType<typeof buildSignalJdModel>): number {
  const lower = bullet.toLowerCase();
  const tokens = tokenizeSignalText(lower);
  const tokenSet = new Set(tokens);
  const stemSet = new Set(tokens.map(stemSignalToken).filter((token) => token.length >= 3));

  let hits = 0;
  for (const keyword of jdModel.keywords) {
    if (tokenSet.has(keyword) || stemSet.has(stemSignalToken(keyword))) hits += 1;
  }
  for (const bigram of jdModel.bigrams) {
    const rx = new RegExp(`\\b${escapeRegExp(bigram).replace(/\s+/g, "\\s+")}\\b`, "i");
    if (rx.test(lower)) hits += 1;
  }
  // Trigrams intentionally excluded — the deterministic scoring engine
  // (computeJdMirroringScore) does not count trigrams, so they must not
  // satisfy the generator's alignment threshold.
  return hits;
}

function chooseSignalVerb(original: string, bullet: string, usedVerbs: Map<string, number>): string {
  const originalLead = getLeadWord(original);
  if (STRONG_SIGNAL_VERBS.includes(originalLead as typeof STRONG_SIGNAL_VERBS[number])) {
    return originalLead.charAt(0).toUpperCase() + originalLead.slice(1);
  }

  const lower = `${original} ${bullet}`.toLowerCase();
  const candidates: string[] = [];

  if (/team|staff|people|reports|headcount|supervis/i.test(lower)) candidates.push("Directed", "Oversaw", "Supervised");
  if (/launch|rollout|deploy|implement|migration|release/i.test(lower)) candidates.push("Implemented", "Launched", "Deployed");
  if (/design|build|develop|engineer|architect|create|platform|system|application/i.test(lower)) candidates.push("Built", "Developed", "Engineered", "Architected", "Designed", "Created");
  if (/process|workflow|efficien|optimi|streamline|automation|manual/i.test(lower)) candidates.push("Optimized", "Streamlined", "Automated", "Standardized");
  if (/complaint|issue|escalat|case|ticket|resolve|troubleshoot/i.test(lower)) candidates.push("Resolved", "Directed", "Delivered");
  if (/client|customer|stakeholder|partner|cross-functional|cross functional/i.test(lower)) candidates.push("Facilitated", "Coordinated", "Directed");
  if (/train|coach|mentor|onboard/i.test(lower)) candidates.push("Trained", "Mentored");
  if (/compliance|policy|audit|risk|governance/i.test(lower)) candidates.push("Governed", "Established", "Standardized");

  candidates.push("Led", "Owned", "Delivered", "Executed", "Established");

  // Filter out banned verbs
  const safeCandidates = candidates.filter(c => !BANNED_SIGNAL_VERBS.has(c.toLowerCase()));
  if (safeCandidates.length === 0) safeCandidates.push("Led", "Delivered", "Executed");

  let chosen = safeCandidates[0];
  let chosenCount = Number.POSITIVE_INFINITY;
  for (const candidate of safeCandidates) {
    const count = usedVerbs.get(candidate.toLowerCase()) || 0;
    if (count < chosenCount) {
      chosen = candidate;
      chosenCount = count;
    }
  }

  usedVerbs.set(chosen.toLowerCase(), (usedVerbs.get(chosen.toLowerCase()) || 0) + 1);
  return chosen;
}

function stripWeakLead(text: string): string {
  return text
    .trim()
    .replace(/^[-•▪►*]\s*/, "")
    .replace(/^(additionally|further|concurrently),?\s+/i, "")
    .replace(/^(?:responsible\s+for|helped(?:\s+to)?|assisted(?:\s+with|\s+in)?|supported|participated\s+in|was\s+involved\s+in|tasked\s+with|worked\s+on|contributed\s+to|focused\s+on|served\s+as|utilized|leveraged|ensured)\s+/i, "")
    .trim();
}

function eliminatePassiveLanguage(text: string): string {
  return text
    .replace(/\bhelped(?:\s+to)?\b/gi, "drove")
    .replace(/\bassisted(?:\s+with|\s+in)?\b/gi, "executed")
    .replace(/\bsupported\b/gi, "advanced")
    .replace(/\bparticipated in\b/gi, "executed")
    .replace(/\bwas involved in\b/gi, "owned")
    .replace(/\btasked with\b/gi, "owned");
}

function extractOriginalScopeEvidence(original: string): string[] {
  const scopeMatches = original.match(new RegExp(SIGNAL_SCOPE_RX.source, "gi")) || [];
  const normalized = original.toLowerCase();
  const phraseMatches = [
    "cross-functional", "cross functional", "end-to-end", "end to end", "enterprise-wide", "enterprise wide",
    "global", "regional", "multi-site", "multi site", "high-volume", "high volume", "portfolio",
    "program", "p&l", "budget", "revenue", "governance",
  ].filter((phrase) => normalized.includes(phrase));

  return [...new Set([...scopeMatches, ...phraseMatches])].slice(0, 3);
}

function extractEvidenceTail(original: string): string {
  const trimmed = original.trim().replace(/^[-•▪►*]\s*/, "").replace(/\.$/, "");
  const withoutLead = trimmed.replace(/^[A-Z][a-z]+(?:\s+[a-z]+)?\s+/, "").trim();
  const candidate = withoutLead || trimmed;
  const firstClause = candidate.split(/[.;]/)[0]?.trim() || candidate;
  return firstClause.slice(0, 140).replace(/[\s,.;:]+$/, "");
}

function ensureOwnershipLead(original: string, bullet: string, usedVerbs: Map<string, number>): string {
  const leadWord = getLeadWord(bullet);
  if (STRONG_SIGNAL_VERBS.includes(leadWord as typeof STRONG_SIGNAL_VERBS[number])) return bullet;

  const cleaned = stripWeakLead(bullet);

  // After stripping weak leads, check if the remaining text already starts with
  // a strong signal verb — if so, use it directly to avoid double-verb openers
  // like "Resolved execute" or "Directed serve".
  const cleanedLead = getLeadWord(cleaned);
  if (STRONG_SIGNAL_VERBS.includes(cleanedLead as typeof STRONG_SIGNAL_VERBS[number])) {
    return cleaned;
  }

  // Also guard against any verb in our candidate pools (PARTIAL_SIGNAL_VERBS,
  // OUTCOME_SIGNAL_TERMS, and the ACTION_VERB_SET_TITLE used for contamination
  // detection) — these are all action verbs that would cause a double-verb opener
  // if we prepend another verb in front.
  const allKnownVerbs = new Set<string>([
    ...STRONG_SIGNAL_VERBS,
    ...PARTIAL_SIGNAL_VERBS,
    ...OUTCOME_SIGNAL_TERMS,
    ...ACTION_VERB_SET_TITLE,
  ]);

  // Expanded set of common verbs that would cause double-verb openers
  // (e.g., "Directed serve", "Resolved execute", "Oversaw handle")
  const COMMON_VERB_FORMS = new Set([
    "execute","serve","handle","engage","provide","ensure","focus",
    "utilize","leverage","apply","address","assess","allocate",
    "assign","communicate","comply","complete","configure","connect",
    "consult","convert","define","delegate","demonstrate","determine",
    "diagnose","document","draft","enable","enforce","enhance",
    "evaluate","examine","expand","expedite","explore","forecast",
    "formalize","generate","guide","identify","inform","initiate",
    "inspect","integrate","interpret","investigate","issue","liaise",
    "locate","map","market","measure","mediate","mitigate","modify",
    "navigate","notify","obtain","onboard","operate","orchestrate",
    "outline","oversee","own","participate","perform","present",
    "prioritize","program","promote","propose","qualify","recommend",
    "recruit","reduce","refine","register","regulate","reinforce",
    "remediate","remove","report","represent","research","restructure",
    "retain","satisfy","secure","select","simplify","solicit",
    "source","specify","sponsor","stabilize","strengthen","structure",
    "submit","succeed","summarize","sustain","tailor","target",
    "test","transfer","translate","troubleshoot","unify","update",
    "upgrade","validate","verify","volunteer","write",
  ]);

  if (allKnownVerbs.has(cleanedLead) || COMMON_VERB_FORMS.has(cleanedLead)) {
    // Replace the existing (weaker) verb with a strong signal verb
    const afterVerb = cleaned.replace(/^\S+\s*/, "");
    const verb = chooseSignalVerb(original, cleaned, usedVerbs);
    return `${verb} ${afterVerb}`.replace(/\s{2,}/g, " ").trim();
  }

  // Final catch-all: if cleaned lead looks like a verb (ends in common verb
  // suffixes like -ed, -ing, -ate, -ize, -ify), treat as verb and replace
  if (/^[a-z]+(ed|ing|ate|ize|ify|ise)$/i.test(cleanedLead) && cleanedLead.length >= 4) {
    const afterVerb = cleaned.replace(/^\S+\s*/, "");
    const verb = chooseSignalVerb(original, cleaned, usedVerbs);
    return `${verb} ${afterVerb}`.replace(/\s{2,}/g, " ").trim();
  }

  const remainder = cleaned ? cleaned.charAt(0).toLowerCase() + cleaned.slice(1) : extractEvidenceTail(original).toLowerCase();
  const verb = chooseSignalVerb(original, cleaned || original, usedVerbs);
  return `${verb} ${remainder}`.replace(/\s{2,}/g, " ").trim();
}

function buildAllowedKeywordCandidates(text: string, jdModel: ReturnType<typeof buildSignalJdModel>, originalResumeText = ""): string[] {
  const lower = text.toLowerCase();
  const candidates = new Set<string>();

  for (const keyword of jdModel.keywords) {
    if (lower.includes(keyword)) candidates.add(keyword);
  }

  for (const bigram of jdModel.bigrams) {
    const parts = bigram.split(/\s+/);
    if (parts.some((part) => lower.includes(part))) candidates.add(bigram);
  }

  for (const trigram of (jdModel.trigrams || [])) {
    const parts = trigram.split(/\s+/);
    if (parts.filter((part) => lower.includes(part)).length >= 2) candidates.add(trigram);
  }

  SIGNAL_SEMANTIC_CLUSTERS.forEach((cluster, index) => {
    if (!jdModel.clusterTerms[index]?.length) return;
    const clusterMatch = cluster.some((term) => new RegExp(`\\b${escapeRegExp(term).replace(/\s+/g, "\\s+")}\\b`, "i").test(lower));
    if (clusterMatch) candidates.add(jdModel.clusterTerms[index][0]);
  });

  // Filter out candidates that would fabricate the candidate's industry/domain
  const filtered = [...candidates].filter((c) => !isDomainFabrication(c, originalResumeText || text));
  return filtered.sort((a, b) => b.length - a.length);
}

function ensureScopePreserved(original: string, bullet: string): string {
  const evidence = extractOriginalScopeEvidence(original);
  if (!evidence.length) return bullet;

  const lower = bullet.toLowerCase();
  const missing = evidence.filter((item) => !lower.includes(item.toLowerCase()));
  if (!missing.length) return bullet;

  const tail = extractEvidenceTail(original);
  if (tail && !lower.includes(tail.toLowerCase())) {
    return appendClause(bullet, `including ${tail.charAt(0).toLowerCase() + tail.slice(1)}`);
  }

  const snippet = missing.slice(0, 2).join(" and ");
  return appendClause(bullet, `including ${snippet}`);
}

function ensureJdAlignment(original: string, bullet: string, jdModel: ReturnType<typeof buildSignalJdModel>, aggressive = false, originalResumeText = ""): string {
  if (!jdModel.keywords.length && !jdModel.bigrams.length) return bullet;
  const minHits = aggressive ? 3 : 2;
  if (countKeywordMatchesInBullet(bullet, jdModel) >= minHits) return bullet;

  const candidates = buildAllowedKeywordCandidates(`${original} ${bullet}`, jdModel, originalResumeText)
    .filter((candidate) => !bullet.toLowerCase().includes(candidate.toLowerCase()));

  if (!candidates.length) return bullet;

  // Select candidates: deduplicate overlapping phrases, skip raw verbs/short words
  // that produce garbled injection like "aligned with coordinate priorities"
  const selected: string[] = [];
  const usedWords = new Set<string>();
  const SKIP_RAW_VERBS = new Set(["coordinate","manage","track","report","process","support","ensure","maintain","prepare","handle","provide","review","monitor","schedule","operate","oversee","develop","create","build","drive","lead","serve"]);
  for (const c of candidates) {
    if (selected.length >= (aggressive ? 3 : 2)) break;
    // Skip single-word candidates that are just verbs — they produce unreadable injections
    if (!c.includes(" ") && SKIP_RAW_VERBS.has(c.toLowerCase())) continue;
    // Skip candidates that are commercial/sales-function terms not in the source resume
    if (originalResumeText && isDomainFabrication(c, originalResumeText)) continue;
    const words = c.toLowerCase().split(/\s+/);
    const hasOverlap = words.some(w => w.length >= 4 && usedWords.has(w));
    if (hasOverlap) continue;
    selected.push(c);
    words.forEach(w => usedWords.add(w));
  }

  if (!selected.length) return bullet;

  // Use natural phrasing — inject as contextual framing
  if (selected.length === 1) {
    return appendClause(bullet, `aligned with ${selected[0]} priorities`);
  }
  return appendClause(bullet, `aligned with ${selected.join(" and ")} priorities`);
}

function ensureOutcomeFraming(original: string, bullet: string, _aggressive = false): string {
  const lower = bullet.toLowerCase();
  const hasOutcome = OUTCOME_SIGNAL_TERMS.some((term) => new RegExp(`\\b${escapeRegExp(term).replace(/\s+/g, "\\s+")}\\b`, "i").test(lower));
  if (hasOutcome) return bullet;

  // Only carry forward outcome language that already exists in the original bullet.
  // ZERO FABRICATION: never append invented outcome clauses.
  const originalLower = original.toLowerCase();
  const originalHasOutcome = OUTCOME_SIGNAL_TERMS.some((term) => new RegExp(`\\b${escapeRegExp(term).replace(/\s+/g, "\\s+")}\\b`, "i").test(originalLower));
  if (originalHasOutcome) {
    const tail = extractEvidenceTail(original);
    if (tail && !lower.includes(tail.toLowerCase())) {
      return appendClause(bullet, `including ${tail.charAt(0).toLowerCase() + tail.slice(1)}`);
    }
  }

  // If the original has no outcome language, do not fabricate one.
  return bullet;
}

function ensureSubstantiveLength(original: string, bullet: string): string {
  if (bullet.length >= original.length * 0.95) return bullet;
  const tail = extractEvidenceTail(original);
  if (!tail || bullet.toLowerCase().includes(tail.toLowerCase())) return bullet;
  return appendClause(bullet, `including ${tail.charAt(0).toLowerCase() + tail.slice(1)}`);
}

function repairSignalBullet(
  original: string,
  candidate: string,
  jdModel: ReturnType<typeof buildSignalJdModel>,
  usedVerbs: Map<string, number>,
  aggressive = false,
  originalResumeText = "",
): string {
  let bullet = (candidate || original || "").trim();
  if (!bullet) return bullet;

  // Strip domain fabrication FIRST — before any other repairs that might
  // re-inject or anchor around fabricated industry language
  if (originalResumeText) {
    bullet = stripDomainFabricationFromBullet(bullet, originalResumeText);
  }

  bullet = eliminatePassiveLanguage(bullet);
  bullet = ensureOwnershipLead(original, bullet, usedVerbs);
  bullet = ensureSubstantiveLength(original, bullet);
  bullet = ensureScopePreserved(original, bullet);
  bullet = ensureJdAlignment(original, bullet, jdModel, aggressive, originalResumeText);
  bullet = ensureOutcomeFraming(original, bullet, aggressive);

  // Final cleanup: deduplication, fragment removal, sentence integrity
  bullet = cleanBulletArtifacts(bullet);

  if (bullet.length > 0 && /^[a-z]/.test(bullet)) {
    bullet = bullet.charAt(0).toUpperCase() + bullet.slice(1);
  }
  return bullet;
}

/**
 * Post-generation bullet cleanup:
 * 1. Remove repeated phrase segments
 * 2. Remove truncated/incomplete trailing words
 * 3. Enforce sentence boundary integrity
 */
function cleanBulletArtifacts(bullet: string): string {
  if (!bullet || bullet.length < 10) return bullet;

  // ── 1. Remove duplicated sentence fragments ──
  // Catches "managed vendor contracts, managed vendor contracts"
  // and "driving operational outcomes driving operational outcomes"
  // Match any 4+ word sequence that repeats (with optional punctuation between)
  bullet = bullet.replace(
    /\b((?:\w+\s+){3,}\w+)[,;.\s]+\1\b/gi,
    "$1"
  );

  // Catch duplicated 2-3 word phrases: "cost savings and cost savings"
  bullet = bullet.replace(
    /\b((?:\w{4,}\s+){1,2}\w{4,})\b(?:[,\s]+(?:and|or|while|,)\s+)\1\b/gi,
    "$1"
  );

  // ── 2. Remove truncated trailing words ──
  // Detect words that look cut off: end without vowel pattern or are very short
  // fragments after the last period/comma
  // e.g. "...improving translati" → "...improving"
  const trailingFragment = bullet.match(/\s+([a-zA-Z]{2,})\s*$/);
  if (trailingFragment && !/[.!?]$/.test(bullet)) {
    const lastWord = trailingFragment[1].toLowerCase();
    // Check if it looks truncated: no common English ending and no vowel in last 2 chars
    const looksComplete = /(?:ing|tion|ment|ness|ance|ence|ity|ous|ive|ble|ful|less|ly|ed|er|es|al|ry|ty|cy|or|on|an|en|ar|ts|ds|ms|ns|ps|rs|ss|ws|ks|gs|bs|is|us|as|ay|ey|ow|ew|aw)$/i.test(lastWord);
    if (!looksComplete && lastWord.length <= 8) {
      bullet = bullet.slice(0, bullet.length - trailingFragment[0].length);
    }
  }

  // ── 3. Enforce sentence boundary on excessive length ──
  // Target 1-2 lines max per bullet (~200 chars)
  const MAX_BULLET_LENGTH = 200;
  if (bullet.length > MAX_BULLET_LENGTH) {
    // Find last sentence boundary (. ! ?) before the limit
    let cutIdx = -1;
    for (let i = MAX_BULLET_LENGTH; i >= MAX_BULLET_LENGTH * 0.6; i--) {
      if (bullet[i] === "." || bullet[i] === "!" || bullet[i] === "?") {
        cutIdx = i;
        break;
      }
    }
    // Fallback: find last clause boundary (, ; —) before the limit
    if (cutIdx === -1) {
      for (let i = MAX_BULLET_LENGTH; i >= MAX_BULLET_LENGTH * 0.6; i--) {
        if (bullet[i] === "," || bullet[i] === ";" || bullet[i] === "—") {
          cutIdx = i;
          break;
        }
      }
    }
    if (cutIdx > 0) {
      bullet = bullet.slice(0, cutIdx + 1).trim();
    } else {
      // Hard cut at last complete word before limit
      const hardCut = bullet.slice(0, MAX_BULLET_LENGTH);
      const lastSpace = hardCut.lastIndexOf(" ");
      if (lastSpace > MAX_BULLET_LENGTH * 0.6) {
        bullet = hardCut.slice(0, lastSpace).trim();
      }
    }
  }

  // ── 4. General whitespace/punctuation cleanup ──
  bullet = bullet
    .replace(/\s{2,}/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/\s+\./g, ".")
    .replace(/\.\./g, ".")
    .replace(/,\s*$/, "")
    .trim();

  // Ensure ends with period
  if (bullet.length > 0 && !/[.!?]$/.test(bullet)) {
    bullet += ".";
  }

  return bullet;
}

function strengthenFinalExperience(
  experience: any[],
  sourceExperience: any[],
  jdModel: ReturnType<typeof buildSignalJdModel>,
  aggressive = false,
  originalResumeText = "",
): any[] {
  const usedVerbs = new Map<string, number>();

  return experience.map((role: any, roleIndex: number) => {
    const sourceRole = sourceExperience[roleIndex] || role;
    const sourceBullets = Array.isArray(sourceRole?.bullets) && sourceRole.bullets.length > 0
      ? sourceRole.bullets
      : Array.isArray(role?.bullets) ? role.bullets : [];
    const candidateBullets = Array.isArray(role?.bullets) ? role.bullets : [];

    const repairedBullets = sourceBullets.map((originalBullet: string, bulletIndex: number) =>
      repairSignalBullet(originalBullet, candidateBullets[bulletIndex] || originalBullet, jdModel, usedVerbs, aggressive, originalResumeText)
    );

    return {
      ...role,
      bullets: repairedBullets,
    };
  });
}

/**
 * Cross-bullet deduplication: remove repetitive JD-echo tail phrases
 * (e.g., "aligned with X priorities") that appear in multiple bullets.
 * Keeps the first occurrence and strips duplicates.
 */
function deduplicateJdEchoPhrases(experience: any[]): any[] {
  const tailRx = /,?\s*aligned with\s+.+?\s+priorities\.?$/i;
  const seenTails = new Set<string>();
  // Track semantic fingerprints: normalized 4-word sequences to catch cross-role repetition
  const seenFingerprints = new Set<string>();

  return experience.map((role: any) => {
    const bullets = Array.isArray(role.bullets) ? role.bullets.map((b: string) => {
      // 1. Strip duplicate JD-echo tails
      const tailMatch = b.match(tailRx);
      if (tailMatch) {
        const tailKey = tailMatch[0].toLowerCase().replace(/[.,]/g, "").trim();
        if (seenTails.has(tailKey)) {
          let cleaned = b.replace(tailRx, "").trim().replace(/,\s*$/, "").trim();
          if (cleaned.length > 0 && !/[.!?]$/.test(cleaned)) cleaned += ".";
          b = cleaned;
        } else {
          seenTails.add(tailKey);
        }
      }

      // 2. Semantic fingerprint dedup: extract core phrase (skip lead verb, take next 4 content words)
      const words = b.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).filter(w => w.length > 3);
      if (words.length >= 5) {
        const fingerprint = words.slice(1, 5).join(" ");
        if (seenFingerprints.has(fingerprint)) {
          // This bullet is semantically duplicate — strip JD tail to differentiate, or mark for removal
          const stripped = b.replace(tailRx, "").trim().replace(/,\s*$/, "").trim();
          // If after stripping it's still a duplicate core, return empty to filter later
          const strippedWords = stripped.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).filter(w => w.length > 3);
          const strippedFp = strippedWords.slice(1, 5).join(" ");
          if (seenFingerprints.has(strippedFp)) {
            return ""; // Will be filtered by normalizeResult (length > 5 check)
          }
          b = stripped;
          if (b.length > 0 && !/[.!?]$/.test(b)) b += ".";
        }
        seenFingerprints.add(fingerprint);
      }

      return b;
    }) : [];
    return { ...role, bullets };
  });
}

function countRepairOpportunities(sourceExperience: any[], jdModel: ReturnType<typeof buildSignalJdModel>): number {
  let opportunities = 0;

  for (const role of sourceExperience) {
    for (const bullet of role?.bullets || []) {
      const lower = bullet.toLowerCase();
      if (!STRONG_SIGNAL_VERBS.includes(getLeadWord(bullet) as typeof STRONG_SIGNAL_VERBS[number])) opportunities += 1;
      if (PASSIVE_SIGNAL_PHRASES.some((phrase) => lower.includes(phrase))) opportunities += 1;
      if (!OUTCOME_SIGNAL_TERMS.some((term) => new RegExp(`\\b${escapeRegExp(term).replace(/\s+/g, "\\s+")}\\b`, "i").test(lower))) opportunities += 1;
      if (jdModel.keywords.length > 0 && countKeywordMatchesInBullet(bullet, jdModel) === 0 && buildAllowedKeywordCandidates(bullet, jdModel).length > 0) opportunities += 1;
    }
  }

  return opportunities;
}

function enforceFinalSignalDelta(
  assembled: any,
  originalResumeText: string,
  sourceExperience: any[],
  directorResult: any,
  requestId: string,
  rawJd?: string,
) {
  // Prefer raw JD text for phrase extraction; fall back to signal labels
  const jdSource = rawJd?.trim() || extractJDSignals(directorResult);
  const jdModel = buildSignalJdModel(jdSource);

  if (!assembled?.experience?.length || (!jdModel.keywords.length && !jdModel.bigrams.length)) {
    return assembled;
  }

  let finalized = {
    ...assembled,
    experience: strengthenFinalExperience(assembled.experience, sourceExperience, jdModel, false, originalResumeText),
  };

  let delta = countImprovedDimensions(originalResumeText, structuredResumeToText(finalized), jdModel);
  const repairOpportunities = countRepairOpportunities(sourceExperience, jdModel);

  if (delta.improvementCount <= 1 && repairOpportunities >= 2) {
    console.warn(JSON.stringify({
      request_id: requestId,
      post_processing: "signal_delta_insufficient",
      improvement_count: delta.improvementCount,
      repair_opportunities: repairOpportunities,
      action: "aggressive_rework",
    }));

    finalized = {
      ...finalized,
      experience: strengthenFinalExperience(finalized.experience, sourceExperience, jdModel, true, originalResumeText),
    };

    delta = countImprovedDimensions(originalResumeText, structuredResumeToText(finalized), jdModel);
  }

  console.log(JSON.stringify({
    request_id: requestId,
    post_processing: "final_signal_delta_validated",
    improvement_count: delta.improvementCount,
    improved_dimensions: delta.flags,
  }));

  return finalized;
}

async function rewriteExperienceBullets(
  experience: any[],
  directorResult: any,
  apiKey: string,
  requestId: string,
  rawJd?: string,
  originalResumeText = "",
  prebuiltJdModel?: ReturnType<typeof buildSignalJdModel>,
): Promise<any[]> {
  if (experience.length === 0) return experience;

  // Reuse pre-built model if available
  const jdSource = rawJd?.trim() || extractJDSignals(directorResult);
  const jdModel = prebuiltJdModel || buildSignalJdModel(jdSource);

  // Extract top JD phrases for explicit injection instruction
  const topPhrases = [...jdModel.bigrams.slice(0, 8), ...jdModel.trigrams.slice(0, 5)];
  const topKeywords = jdModel.keywords.slice(0, 10);
  const jdPhraseBlock = topPhrases.length > 0
    ? `\nTOP JD PHRASES (incorporate 1-2 per bullet where semantically valid):\n${topPhrases.map(p => `• ${p}`).join("\n")}\n\nTOP JD KEYWORDS (distribute across all bullets):\n${topKeywords.map(k => `• ${k}`).join("\n")}`
    : "";
  const jdSignals = rawJd?.trim() || extractJDSignals(directorResult);
  const signalConversionBlock = extractSignalConversions(directorResult);

  const expText = experience.map((exp: any, i: number) => {
    const header = [exp.title, exp.company, exp.dates].filter(Boolean).join(" | ");
    const bullets = exp.bullets.map((b: string, bi: number) => `  [${bi}] (${b.length} chars) ${b}`).join("\n");
    return `[ROLE ${i}] ${header}\n${bullets}`;
  }).join("\n\n");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        temperature: 0.2,
        system: `You are rewriting final resume bullets for a calibrated resume that must materially improve JD Mirroring score without fabricating experience.

TARGET JD SIGNAL CONTEXT:
${jdSignals}
${jdPhraseBlock}
${signalConversionBlock}

SIGNAL CONVERSION RULES (CRITICAL — apply when SIGNAL CONVERSION CONTEXT is present):
- When a transferable signal mapping is provided (e.g., "escalation handling → issue resolution ownership"), rewrite bullets to express the CONVERTED signal.
- Frame the candidate's existing work using role-aligned language: if workflows map to order coordination, bullets must reflect coordination, tracking, completion.
- If escalation handling maps to issue ownership, bullets must show ownership framing, not passive support.
- If stakeholder communication maps to account support, bullets must reflect relationship continuity and client-facing language.
- The candidate should read as: "already does this role — just in a different environment."
- ZERO FABRICATION still applies: only reframe what genuinely exists. Do not invent new scope or responsibilities.

SIGNAL CONVERSION VERB HARDENING (NON-NEGOTIABLE):
- When converting a transferable signal, ALWAYS upgrade to ownership-level verbs. Soft/passive verbs are BANNED in converted bullets:
  • "supported" → "executed" or "managed"
  • "assisted" → "coordinated" or "directed"
  • "helped manage" → "managed"
  • "helped with" → "handled" or "owned"
  • "participated in" → "contributed to" or "drove"
  • "was responsible for" → "managed" or "oversaw"
  • "involved in" → "executed" or "led"
- Emphasize PROCESS OWNERSHIP verbs: managed, coordinated, executed, resolved, tracked, routed, completed, maintained, delivered, owned (only if scope justifies).
- NEVER use these soft verbs in a converted-signal bullet: supported, assisted, helped, aided, contributed (alone), facilitated (unless genuinely orchestrating).
- The verb must signal that the candidate PERFORMED the work, not that they were adjacent to it.
- This upgrade is ONLY a language change — do NOT inflate scope. "Assisted with scheduling for 3 accounts" becomes "Coordinated scheduling across 3 accounts" — the scope (3 accounts) stays identical.

CRITICAL JD MIRRORING RULES:
- Each bullet MUST incorporate 1-2 JD phrases (from the TOP JD PHRASES list above) where semantically valid.
- Replace generic phrasing with JD-aligned vocabulary for verbs, objects, and outcomes.
- The top JD keywords must appear multiple times across all bullets — distributed naturally, not stuffed.
- Prioritize JD vocabulary over generic resume language in every rewrite decision.

DOMAIN PRESERVATION (NON-NEGOTIABLE):
- NEVER insert industry, sector, or company-type language from the JD into bullets unless that exact language already appears in the candidate's original bullet.
- JD vocabulary may only describe HOW the candidate worked — NEVER WHERE they worked or WHAT industry they were in.

COMMERCIAL FUNCTION PRESERVATION (NON-NEGOTIABLE):
- NEVER insert commercial, sales-support, quoting, pricing, prospecting, revenue-growth, product-spec, or manufacturing-function phrases from the JD unless the candidate's original bullet explicitly demonstrates that function.
- If the original bullet describes support, operations, coordination, documentation, or administrative work, rewrite it as better support/operations/coordination language — do NOT reframe it as commercial, sales, or revenue-generating activity.
- Prefer neutral framing: "account support," "issue resolution," "systems coordination," "documentation accuracy," "workflow support."

VERB RULES:
- Every bullet must begin with exactly ONE strong action verb. Never stack two verbs.
- If the bullet already begins with an action verb, replace it with a stronger one — do not prepend a second verb.

BULLET RHYTHM & VARIATION (CRITICAL — prevents robotic uniformity):
- NOT every bullet should follow the same "Verb + object + context" pattern. Mix these structures:
  • ACTION-LED: "Managed vendor contracts across three regions." (most common — ~60% of bullets)
  • CONTEXT-LED: "Across 12 client accounts, maintained SLA compliance above 98%." (~20% of bullets)
  • OUTCOME-LED: "Reduced ticket backlog by 35% through revised escalation routing." (~20% of bullets)
- Vary bullet LENGTH naturally within each role:
  • Include 1-2 SHORT bullets (8-15 words) — punchy, single-fact statements
  • Include 2-3 MEDIUM bullets (15-22 words) — standard action-context-result
  • Allow at most 1 LONGER bullet (22-30 words) per role — only for complex, high-value accomplishments
- NEVER write all bullets at the same word count. The length variation must be visible.
- Within a single role, no two consecutive bullets should start with the same verb.
- Across the entire resume, no verb should lead more than 3 bullets total.

DEDUPLICATION (CRITICAL):
- Before finalizing, scan ALL bullets across ALL roles for semantic duplicates.
- If two bullets describe the same responsibility in different roles (e.g., "Managed vendor relationships" appears in Role 1 and Role 3), keep only the stronger version and replace the weaker one with a different, factual responsibility from that role.
- Never repeat the same JD-echo phrase (e.g., "aligned with X priorities") in more than one bullet across the entire resume.

BULLET STRUCTURE:
- Each bullet must express ONE core idea. Do not chain multiple accomplishments with "and" or commas.
- Target 15-25 words per bullet. Never exceed 30 words.
- Remove all filler phrases: "in order to," "with a focus on," "in an effort to," "as part of," "as needed," "on a daily basis."
- Remove all softeners: "effectively," "successfully," "efficiently," "proactively," "strategically," "consistently."
- Do NOT try to sound impressive. Write like an experienced operator describing their work plainly.

TONE (NON-NEGOTIABLE):
- Use grounded, operator-level language appropriate for technical support, operations, and systems roles.
- No abstract claims, no presentation language, no consulting-speak.
- Wrong: "Strategically orchestrated cross-functional alignment initiatives to drive operational excellence across enterprise stakeholders."
- Right: "Coordinated system migrations across three departments, resolving 40+ configuration issues."

NON-NEGOTIABLE RULES:
1. Rewrite EVERY bullet. Preserve company names, titles, dates, tools, metrics, team sizes, dollar amounts exactly.
2. ZERO FABRICATION: do not invent metrics, leadership, scope, responsibilities, tools, or results.
3. Every bullet must remain ATS-safe, export-safe plain text.

OUTPUT RULES:
- Keep the SAME number of roles in the SAME order.
- Keep the SAME number of bullets per role in the SAME order.
- No placeholders. No brackets. No markdown.

Return ONLY valid JSON array:
[{"company":"","title":"","dates":"","bullets":["..."]}]`,
        messages: [{ role: "user", content: expText }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    if (!response.ok) {
      console.error(`[assemble] [${requestId}] Experience API error: ${response.status}`);
      return experience; // Skip post-processing — caller handles it
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text || "";
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return experience.map((role: any, roleIndex: number) => {
      const aiRole = Array.isArray(parsed) ? parsed[roleIndex] || {} : {};
      const aiBullets = Array.isArray(aiRole?.bullets) ? aiRole.bullets : [];
      return {
        company: role.company !== undefined && role.company !== null ? role.company : (aiRole?.company || ""),
        title: role.title !== undefined && role.title !== null ? role.title : (aiRole?.title || ""),
        dates: role.dates !== undefined && role.dates !== null ? role.dates : (aiRole?.dates || ""),
        bullets: (role.bullets || []).map((originalBullet: string, bulletIndex: number) => {
          let aiBullet = aiBullets[bulletIndex] || originalBullet;
          if (originalResumeText) {
            aiBullet = stripDomainFabricationFromBullet(aiBullet, originalResumeText);
          }
          return aiBullet;
        }),
      };
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.error(`[assemble] [${requestId}] Experience rewrite failed: ${err.message}`);
    return experience; // Skip post-processing — caller handles it
  }
}

// ─── Main handler ───

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ── Authentication & Usage Enforcement ──
  const authHeader = req.headers.get("Authorization");
  let authenticatedUserId: string | null = null;

  const adminSupabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  if (authHeader?.startsWith("Bearer ")) {
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabaseAuth.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (user) authenticatedUserId = user.id;
  }

  if (!authenticatedUserId) {
    // Enforce daily limit for unauthenticated users via IP
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("cf-connecting-ip")
      || "unknown";
    const today = new Date().toISOString().slice(0, 10);

    const { data: usageRows } = await adminSupabase
      .from("usage_tracking")
      .select("alignment_count")
      .eq("ip_address", clientIp)
      .eq("usage_date", today)
      .is("user_id", null)
      .limit(1);

    const currentCount = usageRows?.[0]?.alignment_count ?? 0;
    if (currentCount >= 3) {
      return new Response(
        JSON.stringify({ status: "error", error_code: "USAGE_LIMIT_REACHED", message: "Daily limit reached. Sign up to continue." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Upsert usage count
    if (usageRows && usageRows.length > 0) {
      await adminSupabase
        .from("usage_tracking")
        .update({ alignment_count: currentCount + 1, updated_at: new Date().toISOString() })
        .eq("ip_address", clientIp)
        .eq("usage_date", today)
        .is("user_id", null);
    } else {
      await adminSupabase
        .from("usage_tracking")
        .insert({ ip_address: clientIp, usage_date: today, alignment_count: 1, user_id: null });
    }
  }

  const request_id = crypto.randomUUID();

  try {
    let body;
    let currentStep = "input_received";
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ status: "error", request_id, error_code: "BAD_REQUEST", message: "Invalid request body.", debug: { step: "input_received", details: "Could not parse JSON body" } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[assemble] [${request_id}] Input received: resume=${!!body.originalResume}, director=${!!body.directorResult}, alignment=${!!body.alignmentResult}, jd=${!!body.jd}`);

    const { directorResult, originalResume, alignmentResult, jd } = body;

    // Allow assembly with just alignment result (no director/positioning report required)
    const signalContext = directorResult || alignmentResult || null;

    if (!originalResume && !signalContext) {
      return new Response(
        JSON.stringify({ status: "error", request_id, error_code: "MISSING_INPUT", message: "Resume text or alignment data is required.", debug: { step: "input_received", details: "Neither originalResume nor signalContext provided" } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ status: "error", request_id, error_code: "CONFIG_ERROR", message: "AI gateway not configured.", debug: { step: "input_received", details: "ANTHROPIC_API_KEY not set" } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Phase 1: Instant structure from existing signal data ──
    currentStep = "parsing_roles";
    console.log(`[assemble] [${request_id}] Phase 1: Building structure`);
    let structure;
    try {
      structure = assembleStructureFromSignalData(signalContext || {}, originalResume || "");
    } catch (err: any) {
      console.error(`[assemble] [${request_id}] Phase 1 failed:`, err.message);
      return new Response(
        JSON.stringify({ status: "error", request_id, error_code: "PHASE1_ERROR", message: "Failed to parse resume structure.", debug: { step: "parsing_roles", details: err.message } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    console.log(`[assemble] [${request_id}] Phase 1 complete: ${structure.experience.length} roles, summary ${structure.summary.length} chars, ${structure.core_competencies.length} competencies`);

    // ── Build JD model ONCE for reuse across all phases ──
    const rawJdText = typeof jd === "string" ? jd.trim() : undefined;
    const jdSource = rawJdText || extractJDSignals(signalContext || {});
    const jdModel = buildSignalJdModel(jdSource);

    // ── Phase 2: PARALLEL focused API calls ──
    currentStep = "bullet_generation";
    console.log(`[assemble] [${request_id}] Phase 2: Rewriting summary + experience (parallel)`);
    let rewrittenSummary: string;
    let rewrittenExperience: any[];
    try {
      [rewrittenSummary, rewrittenExperience] = await Promise.all([
        generateSummary(
          structure.summary, signalContext || {}, originalResume || "", ANTHROPIC_API_KEY, request_id, rawJdText
        ),
        rewriteExperienceBullets(
          structure.experience, signalContext || {}, ANTHROPIC_API_KEY, request_id, rawJdText, originalResume || "", jdModel
        ),
      ]);
    } catch (err: any) {
      console.error(`[assemble] [${request_id}] Phase 2 failed:`, err.message);
      return new Response(
        JSON.stringify({ status: "error", request_id, error_code: "PHASE2_ERROR", message: "AI rewrite failed.", debug: { step: "bullet_generation", details: err.message } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    console.log(`[assemble] [${request_id}] Phase 2 complete`);

    // ── Lightweight post-processing (CPU-safe) ──
    currentStep = "cleanup_stage";
    console.log(`[assemble] [${request_id}] Cleanup stage`);
    const cleanedSummary = originalResume
      ? stripDomainFabricationFromBullet(rewrittenSummary, originalResume)
      : rewrittenSummary;

    // ── Cross-bullet deduplication: remove repetitive JD-echo tails ──
    const dedupedExperience = deduplicateJdEchoPhrases(rewrittenExperience);

    currentStep = "final_assembly";
    console.log(`[assemble] [${request_id}] Final assembly`);
    const result = normalizeResult({
      ...structure,
      summary: cleanedSummary,
      experience: dedupedExperience,
    });

    console.log(`[assemble] [${request_id}] Assembly complete`);
    return new Response(
      JSON.stringify({ status: "ok", request_id, ...result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err) {
    console.error(`[assemble] [${request_id}] Unhandled error:`, err);
    return new Response(
      JSON.stringify({
        status: "error",
        request_id,
        error_code: "INTERNAL_ERROR",
        message: "An internal error occurred. Please try again.",
        debug: { step: currentStep || "unknown" },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// Post-process: remove placeholders, enforce bullet caps, strip filler
function cleanBullet(bullet: string): string {
  let b = bullet
    .replace(/\[Insert\s+[^\]]*\]/gi, "")
    .replace(/\[[^\]]{1,60}\]/g, "")        // strip any remaining bracketed placeholders
    // Strip filler phrases
    .replace(/\b(in order to|with a focus on|in an effort to|as part of|as needed|on a daily basis|in a timely manner|at all times|going forward)\b/gi, "")
    // Strip softener adverbs
    .replace(/\b(effectively|successfully|efficiently|proactively|strategically|consistently|seamlessly|diligently|meticulously)\s+/gi, "")
    .replace(/\s{2,}/g, " ")                 // collapse double+ spaces
    .replace(/,\s*,+/g, ",")                // collapse double+ commas
    .replace(/\.\s*,/g, ".")                // fix ". ," -> "."
    .replace(/,\s*\./g, ".")                // fix ", ." -> "."
    .replace(/\s+\./g, ".")                 // fix " ." -> "."
    .replace(/\s+,/g, ",")                  // fix " ," -> ","
    .replace(/—\s*,/g, "—")                // fix "— ," -> "—"
    .replace(/,\s*—/g, " —")              // fix ", —" -> " —"
    .replace(/—\s*\./g, ".")               // fix "— ." -> "."
    .replace(/^\s*[,.\-—]+\s*/g, "")        // strip leading punctuation artifacts
    .replace(/\s*[,\-—]+\s*$/g, "")         // strip trailing comma/dash artifacts
    .replace(/\s{2,}/g, " ")                 // final double-space pass
    .trim();

  // Split multi-clause bullets: if bullet has 2+ "and" conjunctions, keep only up to the second clause
  const andCount = (b.match(/\band\b/gi) || []).length;
  if (andCount >= 2 && b.length > 120) {
    // Find the second "and" and truncate there
    let idx = 0;
    let found = 0;
    const lowerB = b.toLowerCase();
    while (idx < lowerB.length) {
      const pos = lowerB.indexOf(" and ", idx);
      if (pos === -1) break;
      found++;
      if (found === 2) {
        b = b.slice(0, pos).trim();
        break;
      }
      idx = pos + 5;
    }
  }

  // Hard length cap at 200 chars — truncate at last clean boundary
  if (b.length > 200) {
    let cutIdx = -1;
    for (let i = 200; i >= 120; i--) {
      if (b[i] === "." || b[i] === "," || b[i] === ";" || b[i] === " ") {
        cutIdx = i;
        break;
      }
    }
    if (cutIdx > 0) {
      b = b.slice(0, cutIdx).trim().replace(/[,;\s]+$/, "");
    } else {
      b = b.slice(0, 200).trim();
    }
  }

  // Ensure ends with period if non-empty
  if (b.length > 0 && !/[.!?]$/.test(b)) b += ".";
  return b;
}

function normalizeResult(assembled: any) {
  const contactRx = /[\w.+-]+@[\w.-]+\.\w{2,}|(?:\(\d{3}\)[\s.-]?\d{3}[\s.-]?\d{4}|\d{3}[-.\s]\d{3}[-.\s]\d{4})/;

  const experience = Array.isArray(assembled.experience)
    ? assembled.experience
        .filter((e: any) => {
          // Reject experience entries where company/title is contact info
          const combined = `${e.company || ""} ${e.title || ""}`.trim();
          if (contactRx.test(combined) && combined.replace(contactRx, "").trim().length < 5) return false;
          if (/^[\d()+\-.\s]+$/.test((e.company || "").trim())) return false;
          return true;
        })
        .map((e: any, idx: number) => {
          let bullets = Array.isArray(e.bullets) ? e.bullets.map(cleanBullet).filter((b: string) => b.length > 5) : [];
          const maxBullets = idx === 0 ? 4 : 3;
          if (bullets.length > maxBullets) bullets = bullets.slice(0, maxBullets);
          return {
            company: e.company || "",
            title: e.title || "",
            dates: e.dates || "",
            bullets,
          };
        })
    : [];

  // Clean name: reject placeholders
  let cleanName = assembled.header?.name || "";
  if (/^full\s+name$/i.test(cleanName.trim())) cleanName = "";
  if (/^(EXPERIENCE|EDUCATION|SKILLS|SUMMARY|PROFILE|CONTACT|CERTIFICATIONS?)\s*$/i.test(cleanName.trim())) cleanName = "";

  // Clean education: reject contaminated entries
  const education = Array.isArray(assembled.education)
    ? assembled.education
        .map((e: any) => ({
          institution: e.institution || "",
          degree: e.degree || "",
          year: e.year || "",
        }))
        .filter((e: any) => {
          const inst = e.institution.trim();
          const deg = e.degree.trim();
          if (!inst && !deg) return false;
          // Reject entries where institution/degree is a section header
          if (/^(EXPERIENCE|SKILLS|SUMMARY|PROFILE|CONTACT|CERTIFICATIONS?)\s*$/i.test(inst)) return false;
          if (/^(EXPERIENCE|SKILLS|SUMMARY|PROFILE|CONTACT|CERTIFICATIONS?)\s*$/i.test(deg)) return false;
          // Reject contact info in education
          if (contactRx.test(inst) || contactRx.test(deg)) return false;
          // Reject action-verb-led entries (experience bullets)
          const firstWordInst = inst.split(/[\s,]/)[0]?.toLowerCase().replace(/[^a-z]/g, "") || "";
          const firstWordDeg = deg.split(/[\s,]/)[0]?.toLowerCase().replace(/[^a-z]/g, "") || "";
          if (EDU_REJECT_VERBS.has(firstWordInst) || EDU_REJECT_VERBS.has(firstWordDeg)) return false;
          return true;
        })
    : [];

  return {
    header: {
      name: cleanName,
      title: assembled.header?.title || "",
      email: assembled.header?.email || "",
      phone: assembled.header?.phone || "",
      linkedin: assembled.header?.linkedin || "",
      location: assembled.header?.location || "",
    },
    summary: assembled.summary || "",
    core_competencies: Array.isArray(assembled.core_competencies) ? assembled.core_competencies : [],
    experience,
    independent_projects: Array.isArray(assembled.independent_projects)
      ? assembled.independent_projects.map((p: any) => {
          // Enforce concise project descriptions — max 150 chars
          let desc = (p.description || "").trim();
          if (desc.length > 150) {
            const cutIdx = desc.lastIndexOf(".", 150);
            desc = cutIdx > 80 ? desc.slice(0, cutIdx + 1) : desc.slice(0, 150).trim().replace(/[,;\s]+$/, "") + ".";
          }
          let bullets = Array.isArray(p.bullets) ? p.bullets.map(cleanBullet).filter((b: string) => b.length > 5) : [];
          // Max 3 tight bullets per project
          if (bullets.length > 3) bullets = bullets.slice(0, 3);
          return { name: p.name || "", description: desc, bullets };
        })
      : [],
    skills: Array.isArray(assembled.skills) ? assembled.skills : [],
    certifications: Array.isArray(assembled.certifications) ? assembled.certifications : [],
    education,
    signal_keywords: Array.isArray(assembled.signal_keywords) ? assembled.signal_keywords : [],
  };
}
