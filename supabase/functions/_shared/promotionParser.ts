/**
 * Same-employer / promotion normalization for parsed resume experience.
 *
 * This is a PURE post-processor that runs after the main experience parser.
 * It does NOT re-parse raw text — it only repairs role grouping so that a
 * candidate with multiple titles under one employer is represented as separate,
 * correctly-attributed roles:
 *
 *   1. Bled promotion headers (a dated title that got swept into the previous
 *      role's bullets) are split back out into their own role.
 *   2. Promotion rows that lost their employer name inherit it from the
 *      employer they sit under (company-first / employer-span formats).
 *   3. An "employer header" pseudo-role (an employer line that the parser
 *      mistook for a title because it carried a date range) is collapsed into
 *      the employer of the roles beneath it.
 *
 * Guarantees:
 *   - Chronology / order is preserved exactly (roles are never reordered).
 *   - Bullets are never merged across roles.
 *   - Inheritance only fills BLANK employer fields — an explicit employer is
 *     never overwritten (protects fabrication guards).
 *
 * Dependency-free so it runs under both Deno (edge) and Node (tests).
 */

export interface ParsedRole {
  title: string;
  company: string;
  dates: string;
  bullets: string[];
}

// Role-title vocabulary, incl. military ranks and government grades.
const ROLE_TITLE_RX =
  /\b(chief|ceo|cto|coo|cfo|cmo|ciso|vp|vice\s+president|president|director|head\s+of|manager|lead|principal|senior|staff|associate|analyst|engineer|developer|architect|designer|scientist|coordinator|specialist|administrator|consultant|supervisor|officer|representative|technician|controller|accountant|attorney|counsel|strategist|recruiter|planner|buyer|examiner|inspector|dispatcher|foreman|superintendent|partner|founder|owner|intern|sergeant|lieutenant|captain|major|colonel|corporal|private|airman|seaman|ensign|commander|petty\s+officer|warrant\s+officer|gs[-\s]?\d{1,2})\b/i;

// Strong, noun-like titles used as a secondary signal.
const STRONG_TITLE_RX =
  /\b(manager|engineer|developer|architect|analyst|specialist|coordinator|supervisor|associate|consultant|officer|president|director|administrator|representative|technician|controller|accountant|attorney|strategist|recruiter|examiner|inspector|dispatcher|superintendent|sergeant|lieutenant|captain|colonel|corporal|commander|gs[-\s]?\d{1,2})\b/i;

// Employer-like suffixes, incl. military branches and government bodies.
const COMPANY_SUFFIXES =
  /\b(inc|llc|l\.l\.c|corp|corporation|ltd|co|company|solutions|technologies|tech|group|partners|consulting|associates|services|global|systems|labs|holdings|industries|enterprises|university|college|institute|department|agency|bureau|administration|army|navy|marines|air\s+force|coast\s+guard|national\s+guard)\b/i;

// Date RANGE only (start–end). A single stray year is intentionally NOT enough
// to treat a bullet as a promotion header — this avoids false splits.
const DATE_RANGE_RX =
  /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*)?\d{4}\s*(?:[-–—]|to)\s*(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*)?(?:present|current|\d{4})/i;

const ACTION_VERBS = new Set([
  "led", "managed", "owned", "built", "created", "developed", "designed",
  "implemented", "improved", "executed", "coordinated", "supported", "resolved",
  "reduced", "increased", "streamlined", "analyzed", "communicated", "partnered",
  "trained", "automated", "documented", "delivered", "oversaw", "directed",
  "established", "facilitated", "negotiated", "optimized", "spearheaded",
  "launched", "maintained", "monitored", "organized", "planned", "produced",
  "provided", "reported", "supervised", "tracked", "promoted", "achieved",
  "drove", "grew", "handled", "processed", "completed", "earned", "received",
]);

function wordCount(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

function isActionVerbLed(text: string): boolean {
  const first = text.trim().split(/[\s,]/)[0]?.toLowerCase().replace(/[^a-z]/g, "") || "";
  return ACTION_VERBS.has(first);
}

/** Split a date range off a header-ish string, returning the residual title. */
export function extractDateRange(text: string): { dates: string; rest: string } {
  const m = text.match(DATE_RANGE_RX);
  if (!m) return { dates: "", rest: text.trim() };
  const dates = m[0].trim();
  let rest = text.replace(m[0], " ");
  rest = rest.replace(/[()|·]/g, " ").replace(/\s{2,}/g, " ").trim();
  rest = rest.replace(/^[\s|,·–—-]+|[\s|,·–—-]+$/g, "").trim();
  return { dates, rest };
}

/** True if a string reads like a job title (not an employer, not a bullet). */
export function looksLikeRoleTitle(title: string): boolean {
  const t = (title || "").trim();
  if (!t) return false;
  if (isActionVerbLed(t)) return false;
  if (wordCount(t) > 9) return false;
  return ROLE_TITLE_RX.test(t);
}

/** True if a bullet is actually a dated promotion header that bled into bullets. */
function isPromotionHeaderBullet(text: string): boolean {
  const t = (text || "").trim();
  if (!t || t.length > 70) return false;
  if (isActionVerbLed(t)) return false;
  if (!DATE_RANGE_RX.test(t)) return false; // must carry a date RANGE
  const { rest } = extractDateRange(t);
  if (!rest || rest.length < 2) return false;
  if (wordCount(rest) > 7) return false;
  // Residual must look like a title (role keyword) and not a sentence.
  if (/[.!?]$/.test(t)) return false;
  return ROLE_TITLE_RX.test(rest) || STRONG_TITLE_RX.test(rest);
}

/**
 * Split a single role into multiple roles when dated promotion headers were
 * swept into its bullets. Bullets following each header belong to that header.
 */
export function splitBledPromotionHeaders(role: ParsedRole): ParsedRole[] {
  const out: ParsedRole[] = [];
  let cur: ParsedRole = {
    title: role.title,
    company: role.company,
    dates: role.dates,
    bullets: [],
  };

  for (const b of role.bullets) {
    if (isPromotionHeaderBullet(b)) {
      if (cur.title || cur.bullets.length > 0) out.push(cur);
      const { dates, rest } = extractDateRange(b);
      cur = {
        title: rest,
        company: role.company, // same employer
        dates,
        bullets: [],
      };
    } else {
      cur.bullets.push(b);
    }
  }
  if (cur.title || cur.bullets.length > 0) out.push(cur);
  return out.length > 0 ? out : [role];
}

/**
 * Normalize same-employer promotions across a parsed experience list.
 * See file header for the full contract.
 */
export function normalizeEmployerPromotions(roles: ParsedRole[]): ParsedRole[] {
  if (!Array.isArray(roles) || roles.length === 0) return roles;

  // 1. Re-split any bled promotion headers.
  const flat: ParsedRole[] = [];
  for (const r of roles) {
    flat.push(...splitBledPromotionHeaders(r));
  }

  // 2. Collapse employer-header pseudo-roles and inherit the employer downward.
  const out: ParsedRole[] = [];
  let currentEmployer = "";

  for (let i = 0; i < flat.length; i++) {
    const r = flat[i];
    const next = flat[i + 1];

    const isEmployerHeader =
      r.bullets.length === 0 &&
      !r.company &&
      !!r.title &&
      !looksLikeRoleTitle(r.title) &&
      (COMPANY_SUFFIXES.test(r.title) ||
        (!!next && looksLikeRoleTitle(next.title) && !next.company));

    if (isEmployerHeader) {
      currentEmployer = r.title.trim();
      continue; // drop the pseudo-role; its employer flows to the rows below
    }

    if (r.company) {
      currentEmployer = r.company;
      out.push(r);
      continue;
    }

    // Blank employer: inherit ONLY when this row reads like a promotion title.
    if (currentEmployer && looksLikeRoleTitle(r.title)) {
      out.push({ ...r, company: currentEmployer });
    } else {
      out.push(r);
    }
  }

  return out;
}
