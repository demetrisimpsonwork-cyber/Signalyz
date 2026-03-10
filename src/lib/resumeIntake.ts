/**
 * Resumix Resume Intake v2
 * Format-agnostic ingestion & extraction — never fails due to formatting.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExtractedContact {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  links?: string[];
}

export interface ExtractedExperience {
  company: string;
  role_title: string;
  location?: string;
  start_date: string;
  end_date: string;
  responsibilities: string[];
  is_independent: boolean;
}

export interface ExtractionConfidence {
  overall: number;
  experience: number;
  education: number;
  skills: number;
}

export interface ResumeIntakeResult {
  status: "ok" | "warning" | "error";
  request_id: string;
  normalized_text_stats: { chars: number; lines: number };
  sections: {
    contact: ExtractedContact;
    summary: string;
    experience: ExtractedExperience[];
    education: string[];
    skills: string[];
    certifications: string[];
  };
  extraction_confidence: ExtractionConfidence;
  warnings: string[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const FANCY_BULLETS = /[•●◦▪■·›»–—]/g;
const ACTION_VERBS = new Set([
  "led","managed","owned","built","created","developed","designed","implemented",
  "improved","executed","coordinated","supported","resolved","reduced","increased",
  "streamlined","analyzed","communicated","partnered","trained","automated",
  "documented","delivered","oversaw","directed","established","facilitated",
  "negotiated","optimized","spearheaded","launched","maintained","monitored",
  "organized","planned","produced","provided","reported","supervised","tracked",
]);

const DATE_PATTERN = /(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*)?(?:\d{1,2}\/)?(\d{4})\s*[-–—to]+\s*(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*)?(?:\d{1,2}\/)?(present|current|\d{4})/i;
const YEAR_ONLY = /\b(20\d{2}|19\d{2})\b/;
const COMPANY_SUFFIXES = /\b(inc|llc|corp|ltd|co|solutions|technologies|group|partners|consulting|associates|services|global|systems)\b/i;
const ROLE_TITLES = /\b(specialist|manager|analyst|coordinator|engineer|developer|director|lead|supervisor|associate|consultant|administrator|architect|designer|officer|president|vice\s+president|vp|intern|assistant|head\s+of)\b/i;
const LOCATION_PATTERN = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,?\s+[A-Z]{2}(?:\s+\d{5})?$/;
const EMAIL_PATTERN = /[\w.+-]+@[\w.-]+\.\w{2,}/;
const PHONE_PATTERN = /(?:\(\d{3}\)[\s.-]?\d{3}[\s.-]?\d{4}|\d{3}[-.\s]\d{3}[-.\s]\d{4}|\b\d{10}\b)/;
const ADDRESS_PATTERN = /\d{1,5}\s+[\w\s]+(?:street|st|avenue|ave|boulevard|blvd|road|rd|drive|dr|lane|ln|court|ct|way|circle|cir)\b/i;
const EDUCATION_KEYWORDS = /\b(university|college|bachelor|master|b\.?s\.?|b\.?a\.?|m\.?s\.?|m\.?a\.?|m\.?b\.?a\.?|ph\.?d|associate|diploma|gpa|degree|school)\b/i;

// Action verbs that indicate bullet fragments, not location cities
const ACTION_VERB_SET = new Set([
  "communicate","communicated","manage","managed","lead","led","develop","developed",
  "create","created","build","built","improve","improved","direct","directed",
  "establish","established","implement","implemented","execute","executed",
  "organize","organized","analyze","analyzed","design","designed","maintain",
  "maintained","deliver","delivered","coordinate","coordinated","support","supported",
  "reduce","reduced","increase","increased","streamline","streamlined","automate",
  "automated","facilitate","facilitated","negotiate","negotiated","spearhead",
  "spearheaded","launch","launched","oversee","oversaw","supervise","supervised",
  "train","trained","partner","partnered","resolve","resolved","provide","provided",
  "report","reported","document","documented","monitor","monitored","track","tracked",
  "plan","planned","produce","produced","optimize","optimized",
]);

/**
 * Validates that a "City, ST" string is actually a location, not a bullet fragment.
 */
function isValidLocationString(text: string): boolean {
  const match = text.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),?\s+([A-Z]{2})(?:\s+\d{5})?$/);
  if (!match) return false;
  const cityWords = match[1].toLowerCase().split(/\s+/);
  for (const w of cityWords) {
    if (ACTION_VERB_SET.has(w)) return false;
  }
  // Also reject common resume keywords as "city" names
  if (/\b(benefits|resources|operations|marketing|finance|technology|information|administration|management|services|solutions)\b/i.test(match[1])) {
    return false;
  }
  return true;
}

/**
 * Check if a string is primarily a phone number or email (not a company name).
 */
function isPhoneOrEmail(text: string): boolean {
  const trimmed = text.trim();
  if (EMAIL_PATTERN.test(trimmed) && trimmed.replace(EMAIL_PATTERN, "").replace(/[\s|,;•·\-–—]/g, "").length < 5) return true;
  if (PHONE_PATTERN.test(trimmed) && trimmed.replace(PHONE_PATTERN, "").replace(/[\s|,;•·\-–—]/g, "").length < 5) return true;
  return false;
}
const LINKEDIN_MARKER = /dates?\s+employed|company\s+name/i;

// ─── Contact Line Detection ──────────────────────────────────────────────────

function isContactInfoLine(line: string): boolean {
  if (!line || line.length > 120) return false;
  const trimmed = line.trim();
  // Pure email line
  if (EMAIL_PATTERN.test(trimmed) && trimmed.replace(EMAIL_PATTERN, "").replace(/[|,;•·\-–—\s]/g, "").length < 5) return true;
  // Pure phone line
  if (PHONE_PATTERN.test(trimmed) && trimmed.replace(PHONE_PATTERN, "").replace(/[|,;•·\-–—\s]/g, "").length < 5) return true;
  // Pure address line
  if (ADDRESS_PATTERN.test(trimmed) && trimmed.length < 80) return true;
  // LinkedIn/GitHub URL line
  if (/linkedin\.com|github\.com/i.test(trimmed) && trimmed.length < 80) return true;
  // Multi-contact line (email + phone on same line)
  if (EMAIL_PATTERN.test(trimmed) && PHONE_PATTERN.test(trimmed)) return true;
  // Line that is just a phone number with optional label
  if (/^(?:phone|tel|mobile|cell)?[:\s]*(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\s*$/i.test(trimmed)) return true;
  return false;
}

// ─── STEP A: Raw Text Normalization ──────────────────────────────────────────

export function normalizeRawText(text: string): string {
  let t = text;

  // Strip invisible chars
  t = t.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\u200B\uFEFF]/g, "");

  // Normalize quotes
  t = t.replace(/[\u2018\u2019\u201A]/g, "'").replace(/[\u201C\u201D\u201E]/g, '"');

  // Convert fancy bullets to "-"
  t = t.replace(FANCY_BULLETS, "-");

  // De-hyphenate wrapped words: "calibra-\n tion" -> "calibration"
  t = t.replace(/(\w)-\s*\n\s*(\w)/g, "$1$2");

  // Join broken lines: if line ends without punctuation and next starts with lowercase
  const lines = t.split("\n");
  const joined: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1];
    if (
      next &&
      line.length > 0 &&
      !/[.!?:;,)\\]}\-]$/.test(line.trimEnd()) &&
      /^[a-z]/.test(next.trimStart()) &&
      line.trim().length < 120
    ) {
      joined.push(line.trimEnd() + " " + next.trimStart());
      i++; // skip next
    } else {
      joined.push(line);
    }
  }
  t = joined.join("\n");

  // Collapse repeated whitespace (preserve newlines)
  t = t.replace(/[^\S\n]+/g, " ");

  // Normalize to max 2 consecutive newlines
  t = t.replace(/\n{3,}/g, "\n\n");

  // Trim lines
  t = t
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();

  return t;
}

// ─── STEP B & C: Document Segmentation & Classification ──────────────────────

type SectionType = "contact" | "summary" | "experience" | "projects" | "education" | "skills" | "certifications" | "other";

interface Segment {
  type: SectionType;
  lines: string[];
  confidence: number;
}

const SECTION_HEADER_MAP: [RegExp, SectionType][] = [
  [/^(professional\s+summary|summary|profile|objective)/i, "summary"],
  [/^(core\s+competencies|skills|technical\s+skills|areas?\s+of\s+expertise|proficiencies)/i, "skills"],
  [/^(certifications?|licenses?|credentials?)/i, "certifications"],
  [/^(education|academic|qualifications?)/i, "education"],
  [/^(independent\s+projects?|personal\s+projects?|side\s+projects?|projects?)/i, "projects"],
  [/^(experience|professional\s+experience|work\s+experience|work\s+history|employment)/i, "experience"],
];

function classifyLine(line: string): SectionType | null {
  for (const [rx, type] of SECTION_HEADER_MAP) {
    if (rx.test(line)) return type;
  }
  return null;
}

function scoreSectionType(lines: string[]): SectionType {
  let expScore = 0, eduScore = 0, skillScore = 0, summaryScore = 0;

  for (const line of lines) {
    if (DATE_PATTERN.test(line)) expScore += 3;
    if (COMPANY_SUFFIXES.test(line)) expScore += 2;
    if (ROLE_TITLES.test(line)) expScore += 2;
    if (EDUCATION_KEYWORDS.test(line)) eduScore += 3;
    // Skills: comma-heavy short lines
    const commas = (line.match(/,/g) || []).length;
    if (commas >= 3 && line.length < 200) skillScore += 3;
    // Summary: long prose without dates
    if (line.length > 120 && !DATE_PATTERN.test(line)) summaryScore += 2;
  }

  const scores: [SectionType, number][] = [
    ["experience", expScore],
    ["education", eduScore],
    ["skills", skillScore],
    ["summary", summaryScore],
  ];
  scores.sort((a, b) => b[1] - a[1]);
  if (scores[0][1] === 0) return "other";
  return scores[0][0];
}

function segmentDocument(text: string): Segment[] {
  const lines = text.split("\n");
  const segments: Segment[] = [];
  let currentType: SectionType = "other";
  let currentLines: string[] = [];
  let headerDetected = false;

  // Extract contact from top — scan until first section header
  const contactLines: string[] = [];
  let contentStart = 0;
  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Stop at first section header or date pattern
    const headerType = classifyLine(line);
    if (headerType || DATE_PATTERN.test(line)) break;
    
    const isEmail = EMAIL_PATTERN.test(line);
    const isPhone = PHONE_PATTERN.test(line);
    const isLocation = LOCATION_PATTERN.test(line);
    const isAddress = ADDRESS_PATTERN.test(line);
    const isLink = /^https?:\/\//.test(line) || /linkedin\.com|github\.com/i.test(line);
    
    if (
      isEmail || isPhone || isLocation || isAddress || isLink ||
      (i < 3 && line.length < 60 && !COMPANY_SUFFIXES.test(line) && !ROLE_TITLES.test(line))
    ) {
      contactLines.push(line);
    }
    contentStart = i + 1;
  }

  if (contactLines.length > 0) {
    segments.push({ type: "contact", lines: contactLines, confidence: 0.8 });
  }

  // Main segmentation
  for (let i = contentStart; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const headerType = classifyLine(line);
    if (headerType) {
      // Flush current
      if (currentLines.length > 0) {
        const inferredType = headerDetected ? currentType : scoreSectionType(currentLines);
        segments.push({ type: inferredType, lines: [...currentLines], confidence: headerDetected ? 0.9 : 0.6 });
      }
      currentType = headerType;
      currentLines = [];
      headerDetected = true;
      continue;
    }

    // Check if this line starts a new experience block (date pattern in non-bullet line)
    if (!headerDetected && DATE_PATTERN.test(line) && !/^-/.test(line)) {
      if (currentLines.length > 0) {
        const inferredType = scoreSectionType(currentLines);
        segments.push({ type: inferredType, lines: [...currentLines], confidence: 0.5 });
      }
      currentType = "experience";
      currentLines = [line];
      headerDetected = false;
      continue;
    }

    currentLines.push(line);
  }

  if (currentLines.length > 0) {
    const inferredType = headerDetected ? currentType : scoreSectionType(currentLines);
    segments.push({ type: inferredType, lines: [...currentLines], confidence: headerDetected ? 0.9 : 0.5 });
  }

  return segments;
}

// ─── STEP D: Experience Extraction ───────────────────────────────────────────

function startsWithVerb(line: string): boolean {
  const firstWord = line.replace(/^-\s*/, "").split(/\s/)[0]?.toLowerCase();
  return ACTION_VERBS.has(firstWord || "");
}

function isResponsibilityLine(line: string): boolean {
  if (/^-\s/.test(line)) return true;
  if (line.length >= 80) return true;
  if (startsWithVerb(line)) return true;
  return false;
}

function extractExperienceBlocks(lines: string[], isProjects: boolean): ExtractedExperience[] {
  // Pre-filter: remove contact-info lines that leaked into experience segments
  lines = lines.filter((l) => !isContactInfoLine(l));
  
  // Also filter out CamelCase header artifacts (e.g. "DIRECTOROFHUMANRESOURCES")
  lines = lines.filter((l) => {
    const trimmed = l.trim();
    // All-caps single "word" >15 chars with no spaces is likely a broken header artifact
    if (/^[A-Z]{15,}$/.test(trimmed)) return false;
    return true;
  });

  const blocks: ExtractedExperience[] = [];
  let current: ExtractedExperience | null = null;

  // Column collapse detection: if many lines have large gaps, reflow
  const tabLines = lines.filter((l) => /\t|\s{4,}/.test(l));
  if (tabLines.length > lines.length * 0.4) {
    // Reflow: split on large gaps and flatten
    const reflowed: string[] = [];
    for (const l of lines) {
      const parts = l.split(/\t|\s{4,}/).map((s) => s.trim()).filter(Boolean);
      reflowed.push(...parts);
    }
    lines = reflowed;
  }

  // LinkedIn detection
  const isLinkedIn = lines.some((l) => LINKEDIN_MARKER.test(l));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/^-\s*/, "").trim();
    if (!line) continue;

    // Skip lines that are purely contact info even after pre-filter
    if (isContactInfoLine(lines[i])) continue;

    const hasDate = DATE_PATTERN.test(line);
    const hasCompany = COMPANY_SUFFIXES.test(line);
    const hasTitle = ROLE_TITLES.test(line);
    const isBullet = /^-\s/.test(lines[i]);

    // Detect role header
    if ((hasDate || (hasCompany && hasTitle) || (isLinkedIn && hasTitle)) && !isBullet) {
      if (current) blocks.push(current);

      let company = "";
      let role_title = "";
      let start_date = "";
      let end_date = "";
      let location = "";

      const dateMatch = line.match(DATE_PATTERN);
      if (dateMatch) {
        start_date = dateMatch[1] || "";
        end_date = dateMatch[2] || "";
      }

      const withoutDate = line.replace(DATE_PATTERN, "").replace(/[()]/g, "").trim().replace(/[\s|—–\-]+$/, "").trim();
      const parts = withoutDate.split(/\s*[|—–,]\s*/);

      if (parts.length >= 2) {
        // Detect which is company vs title
        if (ROLE_TITLES.test(parts[0]) && !ROLE_TITLES.test(parts[1])) {
          role_title = parts[0].trim();
          company = parts[1].trim();
        } else if (COMPANY_SUFFIXES.test(parts[0]) && !COMPANY_SUFFIXES.test(parts[1])) {
          company = parts[0].trim();
          role_title = parts[1].trim();
        } else {
          // Role/company swapping heuristic: if line has title keywords first
          role_title = parts[0].trim();
          company = parts[1].trim();
        }
      if (parts.length >= 3 && LOCATION_PATTERN.test(parts[2]?.trim()) && isValidLocationString(parts[2].trim())) {
          location = parts[2].trim();
        }
      } else {
        role_title = withoutDate;
      }

      // Validate company isn't actually contact info or a bullet fragment
      if (company && (isContactInfoLine(company) || isPhoneOrEmail(company))) {
        company = "";
      }
      // Validate role_title isn't contact info
      if (role_title && (isContactInfoLine(role_title) || isPhoneOrEmail(role_title))) {
        role_title = "";
      }

      // Check next line for company if only title detected
      if (role_title && !company && i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (COMPANY_SUFFIXES.test(nextLine) && !DATE_PATTERN.test(nextLine) && !/^-/.test(nextLine) && !isContactInfoLine(nextLine)) {
          company = nextLine;
          i++;
        }
      }

      current = {
        company,
        role_title,
        location,
        start_date,
        end_date,
        responsibilities: [],
        is_independent: isProjects,
      };
      continue;
    }

    // Responsibility line
    if (current) {
      if (isResponsibilityLine(lines[i])) {
        current.responsibilities.push(line);
      } else if (line.length > 15) {
        current.responsibilities.push(line);
      }
    } else if (isResponsibilityLine(lines[i]) && line.length > 15) {
      // No header yet, create implicit block
      current = {
        company: "",
        role_title: "",
        location: "",
        start_date: "",
        end_date: "",
        responsibilities: [line],
        is_independent: isProjects,
      };
    }
  }

  if (current) blocks.push(current);
  return blocks;
}

// ─── STEP E: Bullet Synthesis ────────────────────────────────────────────────

function synthesizeBullets(responsibilities: string[]): string[] {
  const result: string[] = [];
  for (const r of responsibilities) {
    // If already bullet-length, keep as-is
    if (r.length < 200) {
      result.push(r);
      continue;
    }
    // Split long paragraphs on semicolons or sentence boundaries
    const parts = r.split(/;\s*|(?<=\.)\s+(?=[A-Z])/);
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.length > 10) result.push(trimmed);
    }
  }
  return result;
}

// ─── STEP F: Quality Guards ──────────────────────────────────────────────────

function computeConfidence(result: ResumeIntakeResult): ExtractionConfidence {
  const exp = result.sections.experience;
  const edu = result.sections.education;
  const skills = result.sections.skills;

  let expConf = 0;
  if (exp.length > 0) {
    const withDates = exp.filter((e) => e.start_date || e.end_date).length;
    const withCompany = exp.filter((e) => e.company).length;
    const withBullets = exp.filter((e) => e.responsibilities.length >= 2).length;
    expConf = Math.min(1, (withDates * 0.3 + withCompany * 0.3 + withBullets * 0.4) / Math.max(exp.length, 1));
  }

  const eduConf = edu.length > 0 ? 0.8 : 0;
  const skillConf = skills.length > 0 ? 0.8 : 0;
  const overall = expConf * 0.6 + eduConf * 0.2 + skillConf * 0.2;

  return { overall, experience: expConf, education: eduConf, skills: skillConf };
}

// ─── Repair Mode ─────────────────────────────────────────────────────────────

function repairPass(text: string, existing: ExtractedExperience[]): ExtractedExperience[] {
  if (existing.length > 0 && existing.some((e) => e.responsibilities.length > 0)) {
    return existing;
  }

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const repaired: ExtractedExperience[] = [];
  let currentBlock: ExtractedExperience | null = null;

  for (const line of lines) {
    // Detect by capitalization + title words
    const isHeader =
      (ROLE_TITLES.test(line) || COMPANY_SUFFIXES.test(line)) &&
      line.length < 100 &&
      !/^-/.test(line);

    if (isHeader || YEAR_ONLY.test(line)) {
      if (currentBlock && currentBlock.responsibilities.length > 0) {
        repaired.push(currentBlock);
      }
      currentBlock = {
        company: COMPANY_SUFFIXES.test(line) ? line : "",
        role_title: ROLE_TITLES.test(line) ? line : "",
        location: "",
        start_date: "",
        end_date: "",
        responsibilities: [],
        is_independent: false,
      };
      const yearMatch = line.match(YEAR_ONLY);
      if (yearMatch) currentBlock.start_date = yearMatch[1];
      continue;
    }

    if (currentBlock && line.length > 15) {
      currentBlock.responsibilities.push(line.replace(/^-\s*/, ""));
    }
  }

  if (currentBlock && currentBlock.responsibilities.length > 0) {
    repaired.push(currentBlock);
  }

  return repaired.length > existing.length ? repaired : existing;
}

// ─── Main Pipeline ───────────────────────────────────────────────────────────

export function parseResumeIntake(rawText: string): ResumeIntakeResult {
  const requestId = crypto.randomUUID();
  const warnings: string[] = [];

  // Empty check
  if (!rawText || rawText.replace(/[^a-zA-Z]/g, "").length < 10) {
    return {
      status: "error",
      request_id: requestId,
      normalized_text_stats: { chars: 0, lines: 0 },
      sections: { contact: {}, summary: "", experience: [], education: [], skills: [], certifications: [] },
      extraction_confidence: { overall: 0, experience: 0, education: 0, skills: 0 },
      warnings: ["Input contains no meaningful text."],
    };
  }

  // Step A: Normalize
  const normalized = normalizeRawText(rawText);
  const lineCount = normalized.split("\n").filter(Boolean).length;

  // Too short warning (but don't error)
  if (normalized.length < 200) {
    warnings.push("Paste more of your work history for a stronger calibration.");
  }

  // Step B & C: Segment & classify
  const segments = segmentDocument(normalized);

  // Step D: Extract from segments
  const contact: ExtractedContact = {};
  let summary = "";
  let experience: ExtractedExperience[] = [];
  const education: string[] = [];
  const skills: string[] = [];
  const certifications: string[] = [];

  for (const seg of segments) {
    switch (seg.type) {
      case "contact": {
        for (const line of seg.lines) {
          const emailMatch = line.match(EMAIL_PATTERN);
          if (emailMatch && !contact.email) contact.email = emailMatch[0];
          const phoneMatch = line.match(PHONE_PATTERN);
          if (phoneMatch && !contact.phone) contact.phone = phoneMatch[0];
          if (LOCATION_PATTERN.test(line) && isValidLocationString(line) && !contact.location) contact.location = line;
          if (/linkedin\.com|github\.com/i.test(line)) {
            (contact.links ??= []).push(line);
          }
          // Name: must look like a real person name — not a section header, verb phrase, or contact pattern
          if (
            !contact.name &&
            looksLikePersonName(line)
          ) {
            // Strip trailing professional title if appended (e.g. "Jane Doe — Director of HR")
            let cleanName = line
              .replace(/\s*[-–—|,]\s*(director|manager|specialist|analyst|coordinator|engineer|developer|lead|supervisor|consultant|administrator|officer|president|vp|vice\s+president|head\s+of)\b.*/i, "")
              .trim();
            if (cleanName.length >= 2) {
              contact.name = cleanName;
            }
          }
        }
        break;
      }
      case "summary":
        summary = seg.lines.join(" ").trim();
        break;
      case "experience":
        experience.push(...extractExperienceBlocks(seg.lines, false));
        break;
      case "projects":
        experience.push(...extractExperienceBlocks(seg.lines, true));
        break;
      case "education": {
        // Filter education lines: only keep lines with education keywords,
        // year references, or short descriptive lines — reject experience bullets
        // and CamelCase artifacts
        for (const line of seg.lines) {
          const trimmed = line.trim();
          // Skip CamelCase artifacts (e.g. "DIRECTOROFHUMANRESOURCES")
          if (/^[A-Z]{15,}$/.test(trimmed)) continue;
          // Skip contact info lines
          if (isContactInfoLine(trimmed)) continue;
          // Skip lines that look like experience bullets (start with action verb + long)
          if (startsWithVerb(trimmed) && trimmed.length > 60) continue;
          // Skip lines with role titles but no education keywords
          if (ROLE_TITLES.test(trimmed) && !EDUCATION_KEYWORDS.test(trimmed)) continue;
          // Keep lines with education keywords, year references, or short descriptive content
          if (
            EDUCATION_KEYWORDS.test(trimmed) ||
            YEAR_ONLY.test(trimmed) ||
            trimmed.length < 80 ||
            /\b(magna|summa|cum\s+laude|dean|honor|scholarship|thesis|minor|major|concentration)\b/i.test(trimmed)
          ) {
            education.push(trimmed);
          }
        }
        break;
      }
      case "skills": {
        // Split comma-separated
        for (const line of seg.lines) {
          const items = line.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
          skills.push(...items);
        }
        break;
      }
      case "certifications":
        certifications.push(...seg.lines);
        break;
      default:
        // Try to recover experience from "other" segments
        if (seg.lines.some((l) => DATE_PATTERN.test(l) || startsWithVerb(l))) {
          experience.push(...extractExperienceBlocks(seg.lines, false));
        }
        break;
    }
  }

  // Step E: Synthesize bullets
  for (const exp of experience) {
    exp.responsibilities = synthesizeBullets(exp.responsibilities);
  }

  // Build preliminary result
  const result: ResumeIntakeResult = {
    status: "ok",
    request_id: requestId,
    normalized_text_stats: { chars: normalized.length, lines: lineCount },
    sections: { contact, summary, experience, education, skills, certifications },
    extraction_confidence: { overall: 0, experience: 0, education: 0, skills: 0 },
    warnings,
  };

  // Step F: Compute confidence
  result.extraction_confidence = computeConfidence(result);

  // Validate experience
  const totalBullets = experience.reduce((sum, e) => sum + e.responsibilities.length, 0);
  const sentenceStyleCount = experience
    .flatMap((e) => e.responsibilities)
    .filter((r) => r.length >= 80 || startsWithVerb(r)).length;
  const hasStructuredBlock = experience.some(
    (e) => (e.start_date || e.end_date) && e.company && e.role_title
  );

  const experienceValid = totalBullets >= 3 || sentenceStyleCount >= 3 || hasStructuredBlock;

  if (!experienceValid) {
    result.status = "warning";
    warnings.push("Paste more of your work history for a stronger calibration.");
  }

  // Repair mode
  if (result.extraction_confidence.overall < 0.55 || result.extraction_confidence.experience < 0.55) {
    const repaired = repairPass(normalized, experience);
    if (repaired.length > experience.length || repaired.reduce((s, e) => s + e.responsibilities.length, 0) > totalBullets) {
      result.sections.experience = repaired;
      result.extraction_confidence = computeConfidence(result);
      warnings.push("Repair Mode enabled");
    }
    if (result.extraction_confidence.overall < 0.55) {
      result.status = "warning";
      warnings.push("Low confidence extraction: formatting appears nonstandard. Paste your last 2 job entries (company, title, dates, and 3-5 lines each).");
    }
  }

  return result;
}

// ─── Quality Meter Helper ────────────────────────────────────────────────────

export type PasteQuality = "strong" | "good" | "usable" | "needs_more";

export function getPasteQuality(result: ResumeIntakeResult): PasteQuality {
  if (result.status === "error") return "needs_more";
  const charCount = result.normalized_text_stats?.chars ?? 0;

  if (charCount >= 800) return "strong";
  if (charCount >= 300) return "good";
  if (charCount > 0) return "usable";
  return "needs_more";
}
