/**
 * Client-side contact info extraction from raw resume text.
 * Uses regex + heuristics — no API call needed.
 * Returns only high-confidence fields; leaves uncertain fields undefined.
 */

export interface ExtractedContactInfo {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
}

const EMAIL_RX = /[\w.+-]+@[\w.-]+\.\w{2,}/;
const PHONE_RX = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
const LINKEDIN_RX = /linkedin\.com\/in\/[\w-]+/i;
const SECTION_HEADER_RX = /^(professional\s+summary|summary|profile|objective|experience|education|skills|certifications?)/i;

// Valid US state abbreviations for location validation
const US_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
]);

// Words that should never be part of a city name — action verbs and resume keywords
const NON_CITY_WORDS = new Set([
  "communicate","communicated","managed","led","developed","created","built",
  "improved","directed","established","implemented","executed","organized",
  "analyzed","designed","maintained","delivered","coordinated","supported",
  "reduced","increased","streamlined","automated","facilitated","negotiated",
  "spearheaded","launched","oversaw","supervised","trained","partnered",
  "resolved","provided","reported","documented","monitored","tracked",
  "planned","produced","optimized","benefits","resources","operations",
  "marketing","finance","technology","information","administration",
]);

/**
 * Validates that a string is a plausible city/state location,
 * not a bullet fragment like "Communicate Benefits, FL".
 */
export function isValidLocation(line: string): boolean {
  // Must match "City, ST" or "City, State" pattern
  const match = line.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),?\s+([A-Z]{2})(?:\s+\d{5})?$/);
  if (!match) return false;

  const cityPart = match[1];
  const statePart = match[2];

  // State abbreviation must be a real US state
  if (!US_STATES.has(statePart)) return false;

  // City words must not be action verbs or resume keywords
  const cityWords = cityPart.toLowerCase().split(/\s+/);
  for (const word of cityWords) {
    if (NON_CITY_WORDS.has(word)) return false;
  }

  // City name should be short (max ~3 words)
  if (cityWords.length > 3) return false;

  return true;
}

/**
 * Check if a line looks like a person's name (2-4 capitalized words, no verbs/patterns).
 */
function looksLikePersonName(line: string): boolean {
  // Must be short
  if (line.length > 50 || line.length < 3) return false;
  // Must not contain contact patterns
  if (EMAIL_RX.test(line) || PHONE_RX.test(line)) return false;
  if (/linkedin|github|http/i.test(line)) return false;
  // Must not be a section header
  if (SECTION_HEADER_RX.test(line)) return false;
  // Must contain alphabetic characters
  if (!/[a-zA-Z]/.test(line)) return false;
  // Should be 2-4 words, each starting with uppercase (or all caps)
  const words = line.replace(/[.,\-|]/g, " ").trim().split(/\s+/);
  if (words.length < 1 || words.length > 5) return false;
  // At least 2 words should start with uppercase
  const capWords = words.filter(w => /^[A-Z]/.test(w));
  if (capWords.length < 1) return false;
  // No action verbs as first word
  const firstWordLower = words[0]?.toLowerCase();
  if (NON_CITY_WORDS.has(firstWordLower)) return false;
  // Should not match location pattern
  if (isValidLocation(line)) return false;
  // Should not be all-caps long single word (header artifact)
  if (words.length === 1 && /^[A-Z]{8,}$/.test(words[0])) return false;

  return true;
}

export function extractContactFromText(text: string): ExtractedContactInfo {
  if (!text || text.trim().length < 10) return {};

  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const result: ExtractedContactInfo = {};

  // Only scan top ~10 lines for contact info
  const scanLimit = Math.min(lines.length, 10);

  for (let i = 0; i < scanLimit; i++) {
    const line = lines[i];

    // Stop at section headers
    if (SECTION_HEADER_RX.test(line)) break;

    // Email — high confidence
    if (!result.email) {
      const emailMatch = line.match(EMAIL_RX);
      if (emailMatch) result.email = emailMatch[0];
    }

    // Phone — high confidence
    if (!result.phone) {
      const phoneMatch = line.match(PHONE_RX);
      if (phoneMatch) result.phone = phoneMatch[0];
    }

    // LinkedIn — high confidence
    if (!result.linkedin) {
      const linkedinMatch = line.match(LINKEDIN_RX);
      if (linkedinMatch) result.linkedin = linkedinMatch[0];
    }

    // Location — moderate confidence (with validation)
    if (!result.location && isValidLocation(line)) {
      result.location = line;
    }

    // Name — first line that looks like a person name
    if (!result.name && i <= 2 && looksLikePersonName(line)) {
      // Strip professional title suffixes that may be on the same line
      let nameLine = line
        .replace(/\s*[-–—|,]\s*(director|manager|specialist|analyst|coordinator|engineer|developer|lead|supervisor|consultant|administrator|officer|president|vp|vice\s+president|head\s+of)\b.*/i, "")
        .trim();
      // If the entire line was a title, skip it
      if (nameLine.length < 2) continue;
      // Convert ALL-CAPS names to Title Case
      const isAllCaps = nameLine === nameLine.toUpperCase() && /[A-Z]/.test(nameLine);
      result.name = isAllCaps
        ? nameLine.replace(/\b([A-Z]{2,})\b/g, (w) => w.charAt(0) + w.slice(1).toLowerCase())
        : nameLine;
    }
  }

  return result;
}
