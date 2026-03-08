// assemble-calibrated-resume v3.0 — robust resume parser
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
  let remainder = trimmed.replace(DATE_RX, "").replace(/\b(19|20)\d{2}\b/, "").replace(/[|—–,·]\s*$/, "").replace(/^\s*[|—–,·]\s*/, "").trim();

  let title = remainder;
  let company = "";

  if (remainder.includes("|")) {
    const parts = remainder.split("|").map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      // Heuristic: part with company suffix is company
      const compIdx = parts.findIndex(p => COMPANY_SUFFIXES.test(p));
      if (compIdx >= 0) {
        company = parts[compIdx];
        title = parts.filter((_, i) => i !== compIdx).join(" | ");
      } else {
        company = parts[0];
        title = parts.slice(1).join(" | ");
      }
    }
  } else if (remainder.includes("—") || remainder.includes("–")) {
    const sep = remainder.includes("—") ? "—" : "–";
    const parts = remainder.split(sep).map(s => s.trim());
    if (COMPANY_SUFFIXES.test(parts[1] || "")) {
      title = parts[0]; company = parts[1];
    } else if (COMPANY_SUFFIXES.test(parts[0] || "")) {
      company = parts[0]; title = parts[1] || "";
    } else {
      title = parts[0]; company = parts[1] || "";
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
        if (nextLine && !DATE_RX.test(nextLine) && !BULLET_RX.test(nextLine) && nextLine.length < 60 && !isJobEntryHeader(nextLine)) {
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
        title = parts[0];
        company = parts.slice(1).join(" | ");
      } else if (titleCompany.includes("—") || titleCompany.includes("–")) {
        const sep = titleCompany.includes("—") ? "—" : "–";
        const parts = titleCompany.split(sep).map(s => s.trim());
        if (COMPANY_SUFFIXES.test(parts[1] || "")) {
          title = parts[0]; company = parts[1];
        } else if (COMPANY_SUFFIXES.test(parts[0] || "")) {
          company = parts[0]; title = parts[1] || "";
        } else {
          title = parts[0]; company = parts[1] || "";
        }
      }

      currentRole = { title, company, dates, bullets: [] };

      if (!company && i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (nextLine && !DATE_RX.test(nextLine) && !BULLET_RX.test(nextLine) && nextLine.length < 60 && !isJobEntryHeader(nextLine)) {
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
        const titlePart = nextLine.replace(DATE_RX, "").trim().replace(/[|—–,·]\s*$/, "").trim();
        currentRole = { title: titlePart || line, company: titlePart ? line : "", dates, bullets: [] };
        i++;
        continue;
      }
    }

    // Plain text within a role — treat as bullet if long enough
    if (currentRole && line.length > 20) {
      pendingText.push(line);
      continue;
    }

    // Short text that might be a company name for current role
    if (currentRole && !currentRole.company && isShortLine && line.length < 60) {
      currentRole.company = line;
      continue;
    }
  }

  commitRole();
  return roles;
}

function parseEducationBlock(lines: string[]): Array<{ institution: string; degree: string; year: string }> {
  const entries: Array<{ institution: string; degree: string; year: string }> = [];
  let currentEntry: { institution: string; degree: string; year: string } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const yearMatch = trimmed.match(/\b(19|20)\d{2}\b/);

    // If line has a degree keyword, start new entry
    if (/\b(bachelor|master|associate|doctor|phd|mba|bs|ba|ms|ma|bba|bsc|msc|diploma|certificate|ged|high\s+school)\b/i.test(trimmed)) {
      if (currentEntry) entries.push(currentEntry);
      currentEntry = {
        degree: trimmed.replace(/\b(19|20)\d{2}\b/g, "").replace(/[|—–,·]\s*$/, "").trim(),
        institution: "",
        year: yearMatch ? yearMatch[0] : "",
      };
    } else if (currentEntry && !currentEntry.institution) {
      currentEntry.institution = trimmed.replace(/\b(19|20)\d{2}\b/g, "").trim();
      if (!currentEntry.year && yearMatch) currentEntry.year = yearMatch[0];
    } else {
      if (currentEntry) entries.push(currentEntry);
      currentEntry = { institution: trimmed, degree: "", year: yearMatch ? yearMatch[0] : "" };
    }
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

  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = lines[i];
    if (!header.email) { const m = line.match(emailRx); if (m) header.email = m[0]; }
    if (!header.phone) { const m = line.match(phoneRx); if (m) header.phone = m[0]; }
    if (!header.linkedin) { const m = line.match(linkedinRx); if (m) header.linkedin = m[0]; }
    if (!header.location && locationRx.test(line)) header.location = line;
    // Name: first line that's short, not an email/phone, not a section header
    if (i === 0 && line.length < 50 && !emailRx.test(line) && !phoneRx.test(line) && !detectSectionHeader(line)) {
      header.name = line;
    }
  }

  // If location not found by pattern, check for "City, ST" embedded in contact lines
  if (!header.location) {
    for (let i = 0; i < Math.min(lines.length, 8); i++) {
      const m = lines[i].match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,\s*[A-Z]{2})/);
      if (m) { header.location = m[1]; break; }
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
      .filter(Boolean);
    signalKeywords = [...new Set(types)].map((t: string) =>
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

// ─── Phase 2: Focused sectional API calls with JD context ───

async function generateSummary(
  originalSummary: string,
  directorResult: any,
  originalResume: string,
  apiKey: string,
  requestId: string,
): Promise<string> {
  const jdSignals = extractJDSignals(directorResult);

  const context = [
    `Original summary: ${originalSummary}`,
    jdSignals ? `\nTARGET JD SIGNAL CONTEXT:\n${jdSignals}` : "",
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
        temperature: 0,
        system: `Rewrite this professional summary to align with the target role's hiring criteria.

RULES:
- Open with the candidate's strongest transferable identity signal that directly addresses the target role's primary hiring criteria
- Use 2-4 sentences of active voice only
- NEVER open with "Demonstrates", "Possesses", "Reflecting", "Highly accomplished", or "Dedicated experience"
- Start with a direct declarative identity statement (e.g., "Client experience operations professional with 7+ years...")
- Every sentence must reference verifiable experience from the original resume
- Incorporate the target role's language architecture naturally — not keyword stuffing
- ZERO fabrication: do not invent experience, metrics, or capabilities not present in the original

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

async function rewriteExperienceBullets(
  experience: any[],
  directorResult: any,
  apiKey: string,
  requestId: string,
): Promise<any[]> {
  if (experience.length === 0) return experience;

  const jdSignals = extractJDSignals(directorResult);

  const expText = experience.map((exp: any, i: number) => {
    const header = [exp.title, exp.company, exp.dates].filter(Boolean).join(" | ");
    const bullets = exp.bullets.map((b: string, bi: number) => `  [${bi}] ${b}`).join("\n");
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
        temperature: 0,
        system: `You are rewriting resume experience bullets to align with a target job description.

TARGET JD SIGNAL CONTEXT:
${jdSignals}

INSTRUCTIONS:
1. For each role, identify the 2-3 bullets with the strongest transferable signal to the target JD
2. Rewrite ONLY those high-signal bullets using the JD's language architecture — genuine reframing of actual work performed, not keyword stuffing
3. Keep remaining bullets as-is (minor polish OK but no substantive changes)
4. Preserve company names, titles, and dates EXACTLY as provided
5. ZERO FABRICATION: Do not invent metrics, titles, responsibilities, or experience not present in the original
6. Elevate ownership language and add outcome framing where the underlying work genuinely supports it

BULLET LENGTH RULES (CRITICAL):
- Each bullet MUST be a single clean sentence — maximum 40 words
- If the original bullet is long, extract the SINGLE strongest signal and rewrite THAT signal only
- Do NOT concatenate the original text with the rewrite — produce ONE clean sentence
- NEVER include placeholders like "[Insert %]", "[Insert amount]", "[Insert metric]" — if a metric is unknown, write the bullet without it
- Cap bullets: 3 per role for older roles, 4 for the most recent/current role, never more than 4

Return ONLY valid JSON array:
[{"company":"","title":"","dates":"","bullets":["..."]}]

Keep ALL roles. Preserve exact order.`,
        messages: [{ role: "user", content: expText }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    if (!response.ok) {
      console.error(`[assemble] [${requestId}] Experience API error: ${response.status}`);
      return experience;
    }
    const data = await response.json();
    const raw = data.content?.[0]?.text || "";
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : experience;
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.error(`[assemble] [${requestId}] Experience rewrite failed: ${err.message}`);
    return experience;
  }
}

// ─── Main handler ───

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const request_id = crypto.randomUUID();

  try {
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ status: "error", request_id, error_code: "BAD_REQUEST", message: "Invalid request body." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { directorResult, originalResume, alignmentResult } = body;

    // Allow assembly with just alignment result (no director/positioning report required)
    const signalContext = directorResult || alignmentResult || null;

    if (!originalResume && !signalContext) {
      return new Response(
        JSON.stringify({ status: "error", request_id, error_code: "MISSING_INPUT", message: "Resume text or alignment data is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ status: "error", request_id, error_code: "CONFIG_ERROR", message: "AI gateway not configured." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Phase 1: Instant structure from existing signal data ──
    console.log(`[assemble] [${request_id}] Phase 1: Building structure`);
    let structure;
    try {
      structure = assembleStructureFromSignalData(signalContext || {}, originalResume || "");
    } catch (err: any) {
      console.error(`[assemble] [${request_id}] Phase 1 failed:`, err.message);
      return new Response(
        JSON.stringify({ status: "error", request_id, error_code: "PHASE1_ERROR", message: "Failed to assemble resume structure." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    console.log(`[assemble] [${request_id}] Phase 1 complete: ${structure.experience.length} roles, summary ${structure.summary.length} chars, ${structure.core_competencies.length} competencies`);

    // ── Phase 2: Sequential focused API calls ──
    console.log(`[assemble] [${request_id}] Phase 2a: Rewriting summary`);
    const rewrittenSummary = await generateSummary(
      structure.summary, signalContext || {}, originalResume || "", ANTHROPIC_API_KEY, request_id
    );

    console.log(`[assemble] [${request_id}] Phase 2b: Rewriting experience bullets`);
    const rewrittenExperience = await rewriteExperienceBullets(
      structure.experience, signalContext || {}, ANTHROPIC_API_KEY, request_id
    );

    // ── Merge results ──
    const result = normalizeResult({
      ...structure,
      summary: rewrittenSummary,
      experience: rewrittenExperience,
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
        message: err instanceof Error ? err.message : "Unknown error",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// Post-process: remove placeholders and enforce bullet caps
function cleanBullet(bullet: string): string {
  return bullet
    .replace(/\[Insert\s+[^\]]*\]/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,/g, ",")
    .replace(/\s+\./g, ".")
    .trim();
}

function normalizeResult(assembled: any) {
  const experience = Array.isArray(assembled.experience)
    ? assembled.experience.map((e: any, idx: number) => {
        let bullets = Array.isArray(e.bullets) ? e.bullets.map(cleanBullet).filter((b: string) => b.length > 5) : [];
        // Cap bullets: 4 for first/current role, 3 for older roles
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

  return {
    header: {
      name: assembled.header?.name || "",
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
      ? assembled.independent_projects.map((p: any) => ({
          name: p.name || "",
          description: p.description || "",
          bullets: Array.isArray(p.bullets) ? p.bullets.map(cleanBullet).filter((b: string) => b.length > 5) : [],
        }))
      : [],
    skills: Array.isArray(assembled.skills) ? assembled.skills : [],
    certifications: Array.isArray(assembled.certifications) ? assembled.certifications : [],
    education: Array.isArray(assembled.education)
      ? assembled.education.map((e: any) => ({
          institution: e.institution || "",
          degree: e.degree || "",
          year: e.year || "",
        }))
      : [],
    signal_keywords: Array.isArray(assembled.signal_keywords) ? assembled.signal_keywords : [],
  };
}
