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
const LOCATION_RX = /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),?\s+([A-Z]{2})(?:\s+\d{5})?$/;
const LINKEDIN_RX = /linkedin\.com\/in\/[\w-]+/i;
const SECTION_HEADER_RX = /^(professional\s+summary|summary|profile|objective|experience|education|skills|certifications?)/i;

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

    // Location — moderate confidence
    if (!result.location) {
      const locMatch = line.match(LOCATION_RX);
      if (locMatch) result.location = line;
    }

    // Name — highest confidence: first line that isn't an email/phone/URL/location
    if (
      !result.name &&
      i <= 1 &&
      line.length < 60 &&
      line.length > 1 &&
      !EMAIL_RX.test(line) &&
      !PHONE_RX.test(line) &&
      !LOCATION_RX.test(line) &&
      !/linkedin|github|http/i.test(line) &&
      /[a-zA-Z]/.test(line)
    ) {
      // Strip professional title suffixes that may be on the same line
      let nameLine = line
        .replace(/\s*[-–—|,]\s*(director|manager|specialist|analyst|coordinator|engineer|developer|lead|supervisor|consultant|administrator|officer|president|vp|vice\s+president|head\s+of)\b.*/i, "")
        .trim();
      // If the entire line was a title, fall back to the raw line
      if (nameLine.length < 2) nameLine = line;
      result.name = nameLine;
    }
  }

  return result;
}
