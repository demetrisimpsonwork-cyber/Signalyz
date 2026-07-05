import {
  buildResumeFingerprintPayload,
  fingerprintBullet,
  fingerprintResume,
  fingerprintSection,
} from "./fingerprint.ts";
import { normalizeResumeText } from "./normalizer.ts";
import {
  collapseWhitespace,
  EDU_LINE_RX,
  EMAIL_RX,
  extractAiSignals,
  extractLeadershipSignals,
  extractMetrics,
  extractOwnershipSignals,
  extractTechnologies,
  isBulletLine,
  isSectionHeader,
  PHONE_RX,
  ROLE_LINE_RX,
  splitSkillTokens,
  stripBulletPrefix,
  URL_RX,
} from "./textUtils.ts";
import {
  RESUME_AST_PARSE_VERSION,
  type AstBullet,
  type AstConfidence,
  type BulletSource,
  type CertificationEntry,
  type CustomSection,
  type EducationEntry,
  type ExperienceEntry,
  type LinkEntry,
  type ParseResumeAstResult,
  type ProjectEntry,
  type ResumeAst,
  type ResumeHeader,
  type SkillEntry,
  type ValidationDiagnostic,
} from "./types.ts";

let bulletCounter = 0;

/** Parse existing plain-text resume into canonical AST. Does not generate new content. */
export function parseResumeAst(rawText: string): ParseResumeAstResult {
  const started = performance.now();
  bulletCounter = 0;

  const text = normalizeResumeText(rawText);
  const lines = text.split("\n");
  const diagnostics: ValidationDiagnostic[] = [];

  const headerLines: string[] = [];
  let cursor = 0;

  while (cursor < lines.length) {
    const line = lines[cursor]?.trim() ?? "";
    if (!line) {
      cursor++;
      continue;
    }
    if (isSectionHeader(line)) break;
    headerLines.push(line);
    cursor++;
  }

  const header = parseHeader(headerLines);
  const links = extractLinks(headerLines.join("\n"));

  const ast: ResumeAst = {
    metadata: {
      parseVersion: RESUME_AST_PARSE_VERSION,
      sourceFormat: "plain_text",
      lineCount: lines.length,
    },
    header,
    professionalSummary: { text: "", bullets: [] },
    experience: [],
    projects: [],
    education: [],
    skills: [],
    certifications: [],
    links,
    awards: [],
    customSections: [],
    bullets: [],
  };

  let currentSection = "";
  let buffer: string[] = [];

  const flushBuffer = () => {
    if (!currentSection || buffer.length === 0) return;
    ingestSection(ast, currentSection, buffer, diagnostics);
    buffer = [];
  };

  for (; cursor < lines.length; cursor++) {
    const line = lines[cursor]?.trim() ?? "";
    if (!line) continue;

    const section = isSectionHeader(line);
    if (section) {
      flushBuffer();
      currentSection = section;
      continue;
    }

    if (!currentSection) {
      currentSection = "Custom";
      ast.customSections.push({
        id: nextId("custom"),
        title: "Preamble",
        kind: "custom",
        lines: [],
        bullets: [],
      });
    }

    buffer.push(line);
  }
  flushBuffer();

  ast.bullets = collectAllBullets(ast);
  attachFingerprints(ast);

  const parseTimeMs = Math.round(performance.now() - started);
  return { ast, diagnostics, parseTimeMs };
}

function parseHeader(lines: string[]): ResumeHeader {
  const header: ResumeHeader = { rawLines: [...lines] };
  if (lines.length === 0) return header;

  header.name = lines[0];
  if (lines.length > 1 && !EMAIL_RX.test(lines[0]) && !URL_RX.test(lines[0])) {
    const second = lines[1];
    if (!isSectionHeader(second) && !ROLE_LINE_RX.test(second)) {
      header.title = second;
    }
  }

  const contactBlob = lines.slice(1).join(" | ");
  const email = contactBlob.match(EMAIL_RX);
  if (email) header.email = email[0];
  const phone = contactBlob.match(PHONE_RX);
  if (phone) header.phone = phone[0];
  const locationMatch = contactBlob.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2})\b/);
  if (locationMatch) header.location = locationMatch[1];

  return header;
}

function extractLinks(text: string): LinkEntry[] {
  const urls = text.match(new RegExp(URL_RX.source, "gi")) ?? [];
  return [...new Set(urls)].map((url, index) => ({
    id: nextId(`link-${index}`),
    label: url.includes("github") ? "github" : url.includes("linkedin") ? "linkedin" : "link",
    url: url.trim(),
    valid: /^https?:\/\//i.test(url) || /^(github|linkedin)\.com\//i.test(url),
  }));
}

function ingestSection(
  ast: ResumeAst,
  section: string,
  lines: string[],
  diagnostics: ValidationDiagnostic[],
) {
  switch (section) {
    case "Professional Summary":
      ast.professionalSummary = parseSummary(lines);
      break;
    case "Experience":
      ast.experience.push(...parseExperience(lines, diagnostics));
      break;
    case "Projects":
      ast.projects.push(...parseProjects(lines));
      break;
    case "Education":
      ast.education.push(...parseEducation(lines));
      break;
    case "Skills":
      ast.skills.push(...parseSkills(lines));
      break;
    case "Certifications":
      ast.certifications.push(...parseCertifications(lines));
      break;
    case "Awards":
      ast.awards.push(
        ...lines.map((line, i) => ({
          id: nextId(`award-${i}`),
          title: line,
        })),
      );
      break;
    default:
      ast.customSections.push({
        id: nextId("custom"),
        title: section,
        kind: "custom",
        lines: lines.filter((l) => !isBulletLine(l)),
        bullets: lines.filter(isBulletLine).map((l, i) =>
          makeBullet(l, "custom", section, undefined, undefined, confidenceForLine(l)),
        ),
      });
  }
}

function parseSummary(lines: string[]): ResumeAst["professionalSummary"] {
  const bullets: AstBullet[] = [];
  const prose: string[] = [];
  for (const line of lines) {
    if (isBulletLine(line)) {
      bullets.push(makeBullet(line, "summary", "Professional Summary", undefined, undefined, confidenceForLine(line)));
    } else {
      prose.push(line);
    }
  }
  return { text: prose.join(" "), bullets };
}

function parseExperience(lines: string[], diagnostics: ValidationDiagnostic[]): ExperienceEntry[] {
  const entries: ExperienceEntry[] = [];
  let current: ExperienceEntry | null = null;

  for (const line of lines) {
    const roleMatch = line.match(ROLE_LINE_RX);
    if (roleMatch) {
      if (current) entries.push(current);
      current = {
        id: nextId("exp"),
        title: roleMatch[1].trim(),
        company: roleMatch[2].trim(),
        dates: roleMatch[3].trim(),
        bullets: [],
      };
      continue;
    }

    if (!current) {
      diagnostics.push({
        code: "experience.unanchored_line",
        severity: "warning",
        message: "Experience line is not attached to a role header.",
        section: "Experience",
      });
      current = {
        id: nextId("exp"),
        title: "",
        company: "",
        dates: "",
        bullets: [],
      };
      const bulletLine = isBulletLine(line) ? line : `- ${line}`;
      current.bullets.push(
        makeBullet(bulletLine, "experience", "Experience", undefined, undefined, "low"),
      );
      continue;
    }

    if (isBulletLine(line)) {
      current.bullets.push(
        makeBullet(line, "experience", "Experience", current.title, current.company, confidenceForLine(line)),
      );
    }
  }

  if (current) entries.push(current);
  return entries;
}

function parseProjects(lines: string[]): ProjectEntry[] {
  const entries: ProjectEntry[] = [];
  let current: ProjectEntry | null = null;

  for (const line of lines) {
    if (!isBulletLine(line) && !ROLE_LINE_RX.test(line)) {
      if (current) entries.push(current);
      current = {
        id: nextId("proj"),
        name: line,
        bullets: [],
      };
      continue;
    }

    if (!current) {
      current = { id: nextId("proj"), name: "Project", bullets: [] };
    }

    if (isBulletLine(line)) {
      current.bullets.push(makeBullet(line, "project", "Projects", undefined, current.name, confidenceForLine(line)));
    } else {
      const roleMatch = line.match(ROLE_LINE_RX);
      if (roleMatch) current.dates = roleMatch[3].trim();
    }
  }

  if (current) entries.push(current);
  return entries;
}

function parseEducation(lines: string[]): EducationEntry[] {
  const entries: EducationEntry[] = [];

  for (const line of lines) {
    const eduMatch = line.match(EDU_LINE_RX);
    if (eduMatch) {
      entries.push({
        id: nextId("edu"),
        degree: eduMatch[1].trim(),
        institution: eduMatch[2].trim(),
        year: eduMatch[3]?.trim(),
        bullets: [],
      });
      continue;
    }

    if (isBulletLine(line) && entries.length > 0) {
      const last = entries[entries.length - 1]!;
      last.bullets.push(
        makeBullet(line, "education", "Education", undefined, last.institution, confidenceForLine(line)),
      );
    } else if (!isBulletLine(line)) {
      entries.push({
        id: nextId("edu"),
        institution: line,
        bullets: [],
      });
    }
  }

  return entries;
}

function parseSkills(lines: string[]): SkillEntry[] {
  const skills: SkillEntry[] = [];
  for (const line of lines) {
    for (const token of splitSkillTokens(line)) {
      skills.push({ id: nextId("skill"), name: token });
    }
  }
  return skills;
}

function parseCertifications(lines: string[]): CertificationEntry[] {
  return lines.map((line, index) => {
    const parts = line.split("|").map((p) => p.trim());
    return {
      id: nextId(`cert-${index}`),
      name: parts[0] ?? line,
      issuer: parts[1],
      year: parts[2],
    };
  });
}

function makeBullet(
  line: string,
  source: BulletSource,
  section: string,
  role?: string,
  company?: string,
  confidence: AstConfidence = "medium",
): AstBullet {
  const text = stripBulletPrefix(line);
  const bullet: AstBullet = {
    id: nextId("bullet"),
    source,
    role,
    company,
    section,
    text,
    metrics: extractMetrics(text),
    technologies: extractTechnologies(text),
    ownershipSignals: extractOwnershipSignals(text),
    aiSignals: extractAiSignals(text),
    leadershipSignals: extractLeadershipSignals(text),
    confidence,
  };
  bullet.fingerprint = fingerprintBullet(text, { role, company, section });
  return bullet;
}

function confidenceForLine(line: string): AstConfidence {
  const text = stripBulletPrefix(line);
  if (text.length >= 40) return "high";
  if (text.length >= 15) return "medium";
  return "low";
}

function collectAllBullets(ast: ResumeAst): AstBullet[] {
  return [
    ...ast.professionalSummary.bullets,
    ...ast.experience.flatMap((e) => e.bullets),
    ...ast.projects.flatMap((p) => p.bullets),
    ...ast.education.flatMap((e) => e.bullets),
    ...ast.customSections.flatMap((s) => s.bullets),
  ];
}

function attachFingerprints(ast: ResumeAst): void {
  ast.professionalSummary.fingerprint = fingerprintSection(
    "professional_summary",
    ast.professionalSummary.text + ast.professionalSummary.bullets.map((b) => b.text).join("|"),
  );

  for (const exp of ast.experience) {
    exp.fingerprint = fingerprintSection(
      "experience",
      `${exp.title}|${exp.company}|${exp.dates}|${exp.bullets.map((b) => b.text).join("|")}`,
    );
  }

  for (const proj of ast.projects) {
    proj.fingerprint = fingerprintSection(
      "projects",
      `${proj.name}|${proj.bullets.map((b) => b.text).join("|")}`,
    );
  }

  for (const edu of ast.education) {
    edu.fingerprint = fingerprintSection(
      "education",
      `${edu.degree ?? ""}|${edu.institution}|${edu.year ?? ""}`,
    );
  }

  for (const sec of ast.customSections) {
    sec.fingerprint = fingerprintSection("custom", `${sec.title}|${sec.lines.join("|")}`);
  }

  ast.metadata.fingerprint = fingerprintResume(buildResumeFingerprintPayload(ast));
}

function nextId(prefix: string): string {
  bulletCounter += 1;
  return `${prefix}_${bulletCounter}`;
}

/** Extract all substantive text from AST for zero-loss checks. */
export function extractAstTextCorpus(ast: ResumeAst): string {
  const chunks: string[] = [];
  chunks.push(...ast.header.rawLines);
  if (ast.professionalSummary.text) chunks.push(ast.professionalSummary.text);
  for (const b of ast.bullets) chunks.push(b.text);
  for (const s of ast.skills) chunks.push(s.name);
  for (const c of ast.certifications) chunks.push(c.name);
  for (const a of ast.awards) chunks.push(a.title);
  for (const e of ast.education) {
    if (e.degree) chunks.push(e.degree);
    chunks.push(e.institution);
    if (e.year) chunks.push(e.year);
  }
  for (const exp of ast.experience) {
    chunks.push(exp.title, exp.company, exp.dates);
  }
  for (const proj of ast.projects) {
    chunks.push(proj.name);
    if (proj.description) chunks.push(proj.description);
    if (proj.dates) chunks.push(proj.dates);
  }
  for (const cert of ast.certifications) {
    chunks.push(cert.name);
    if (cert.issuer) chunks.push(cert.issuer);
    if (cert.year) chunks.push(cert.year);
  }
  for (const award of ast.awards) {
    chunks.push(award.title);
    if (award.issuer) chunks.push(award.issuer);
    if (award.year) chunks.push(award.year);
  }
  for (const sec of ast.customSections) {
    chunks.push(...sec.lines);
  }
  return chunks.map((c) => collapseWhitespace(c).toLowerCase()).filter(Boolean).join(" ");
}

export function extractSourceTextCorpus(rawText: string): string {
  const normalized = normalizeResumeText(rawText);
  return normalized
    .replace(/^[-•●○◦▪▸►–—*]\s+/gm, "")
    .replace(/^\d+[.)]\s+/gm, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
