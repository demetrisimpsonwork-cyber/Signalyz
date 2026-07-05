const BULLET_RX = /^[-•●○◦▪▸►–—*]\s*/;
const NUMBERED_BULLET_RX = /^\d+[.)]\s+/;

export const SECTION_ALIASES: Record<string, string> = {
  summary: "Professional Summary",
  "professional summary": "Professional Summary",
  profile: "Professional Summary",
  objective: "Professional Summary",
  about: "Professional Summary",
  experience: "Experience",
  "work experience": "Experience",
  employment: "Experience",
  "professional experience": "Experience",
  career: "Experience",
  projects: "Projects",
  "independent projects": "Projects",
  education: "Education",
  skills: "Skills",
  "technical skills": "Skills",
  "core competencies": "Skills",
  competencies: "Skills",
  technologies: "Skills",
  tools: "Skills",
  certifications: "Certifications",
  certification: "Certifications",
  licenses: "Certifications",
  awards: "Awards",
  honors: "Awards",
  links: "Links",
};

export function normalizeUnicode(text: string): string {
  return text.normalize("NFC");
}

export function collapseWhitespace(text: string): string {
  return normalizeUnicode(text).replace(/\s+/g, " ").trim();
}

export function normalizeBulletSymbol(line: string): string {
  const trimmed = line.trim();
  if (BULLET_RX.test(trimmed)) return `- ${trimmed.replace(BULLET_RX, "").trim()}`;
  if (NUMBERED_BULLET_RX.test(trimmed)) return `- ${trimmed.replace(NUMBERED_BULLET_RX, "").trim()}`;
  return trimmed;
}

export function canonicalSectionName(raw: string): string | null {
  const key = collapseWhitespace(raw).toLowerCase().replace(/[:：]+$/, "");
  return SECTION_ALIASES[key] ?? null;
}

export function isSectionHeader(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 60) return null;
  const direct = canonicalSectionName(trimmed);
  if (direct) return direct;
  const withoutColon = canonicalSectionName(trimmed.replace(/[:：]\s*$/, ""));
  if (withoutColon && trimmed.length < 40) return withoutColon;
  return null;
}

export function isBulletLine(line: string): boolean {
  const trimmed = line.trim();
  return BULLET_RX.test(trimmed) || NUMBERED_BULLET_RX.test(trimmed);
}

export function stripBulletPrefix(line: string): string {
  return normalizeBulletSymbol(line).replace(/^-\s+/, "").trim();
}

export function normalizeHyperlink(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  if (/^(github|linkedin)\.com\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

export function titleCaseSection(name: string): string {
  const canonical = canonicalSectionName(name);
  return canonical ?? name.trim();
}

export function extractMetrics(text: string): string[] {
  return [...new Set(text.match(/\b\d+(?:\.\d+)?%|\$\d[\d,]*|\b\d{2,}\+?\b/g) ?? [])];
}

const TECH_PATTERNS = [
  /\breact\b/i,
  /\btypescript\b/i,
  /\bnode\.?js\b/i,
  /\bpython\b/i,
  /\bpostgresql\b/i,
  /\bpostgres\b/i,
  /\bsupabase\b/i,
  /\baws\b/i,
  /\bazure\b/i,
  /\bgcp\b/i,
  /\bsalesforce\b/i,
  /\boauth\b/i,
  /\bstripe\b/i,
  /\bvercel\b/i,
  /\bcloudflare\b/i,
  /\bci\/?cd\b/i,
  /\brest(?:ful)?\s+apis?\b/i,
  /\bgraphql\b/i,
  /\bkubernetes\b/i,
  /\bdocker\b/i,
  /\bsql\b/i,
  /\bjava\b/i,
  /\bgo\b/i,
  /\brust\b/i,
];

export function extractTechnologies(text: string): string[] {
  const found = new Set<string>();
  for (const rx of TECH_PATTERNS) {
    const m = text.match(rx);
    if (m) found.add(m[0].toLowerCase());
  }
  return [...found];
}

const AI_PATTERNS = [
  /\bllm\b/i,
  /\blarge language model/i,
  /\bmachine learning\b/i,
  /\bdeep learning\b/i,
  /\brag\b/i,
  /\bembeddings?\b/i,
  /\binference\b/i,
  /\btransformer\b/i,
  /\bneural network/i,
  /\bopenai\b/i,
  /\banthropic\b/i,
  /\bagentic\b/i,
  /\bai[-\s]powered\b/i,
  /\bproduction ai\b/i,
];

export function extractAiSignals(text: string): string[] {
  const found = new Set<string>();
  for (const rx of AI_PATTERNS) {
    const m = text.match(rx);
    if (m) found.add(m[0].toLowerCase());
  }
  return [...found];
}

const LEADERSHIP_PATTERNS = [
  /\bled\b/i,
  /\bmanaged\b/i,
  /\bmentored\b/i,
  /\bsupervised\b/i,
  /\bdirected\b/i,
  /\bheaded\b/i,
  /\bcoordinated\b/i,
  /\bteam of\b/i,
];

export function extractLeadershipSignals(text: string): string[] {
  const found = new Set<string>();
  for (const rx of LEADERSHIP_PATTERNS) {
    const m = text.match(rx);
    if (m) found.add(m[0].toLowerCase());
  }
  return found;
}

const OWNERSHIP_PATTERNS = [
  /\bowned\b/i,
  /\bbuilt\b/i,
  /\bdesigned\b/i,
  /\bshipped\b/i,
  /\bimplemented\b/i,
  /\barchitected\b/i,
  /\bdeveloped\b/i,
  /\bcreated\b/i,
  /\bestablished\b/i,
];

export function extractOwnershipSignals(text: string): string[] {
  const found = new Set<string>();
  for (const rx of OWNERSHIP_PATTERNS) {
    const m = text.match(rx);
    if (m) found.add(m[0].toLowerCase());
  }
  return found;
}

export function splitSkillTokens(line: string): string[] {
  return line
    .split(/[,•|►▪·;]/)
    .map((s) => stripBulletPrefix(s))
    .map((s) => collapseWhitespace(s))
    .filter((s) => s.length > 1 && s.length < 80);
}

const EMAIL_RX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_RX = /(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}\b/;
const URL_RX = /\b(?:https?:\/\/|www\.|github\.com\/|linkedin\.com\/)\S+/i;
const ROLE_LINE_RX = /^(.+?)\s*\|\s*(.+?)\s*\|\s*((?:19|20)\d{2}.+)$/i;
const EDU_LINE_RX = /^(.+?)\s*\|\s*(.+?)(?:\s*\|\s*((?:19|20)\d{2}|\d{4}))?$/i;

export { EMAIL_RX, PHONE_RX, URL_RX, ROLE_LINE_RX, EDU_LINE_RX };
