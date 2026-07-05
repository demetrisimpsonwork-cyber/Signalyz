import type { ResumeAst } from "./types.ts";
import {
  canonicalSectionName,
  collapseWhitespace,
  normalizeBulletSymbol,
  normalizeHyperlink,
  normalizeUnicode,
  titleCaseSection,
} from "./textUtils.ts";

/** Normalize AST in place — whitespace, bullets, section names, unicode, links. Does not rewrite content. */
export function normalizeResumeAst(ast: ResumeAst): ResumeAst {
  const clone = structuredClone(ast);

  clone.header.rawLines = clone.header.rawLines.map((l) => collapseWhitespace(normalizeUnicode(l)));
  if (clone.header.name) clone.header.name = collapseWhitespace(clone.header.name);
  if (clone.header.title) clone.header.title = collapseWhitespace(clone.header.title);
  if (clone.header.location) clone.header.location = collapseWhitespace(clone.header.location);

  clone.professionalSummary.text = collapseWhitespace(clone.professionalSummary.text);
  clone.professionalSummary.bullets = clone.professionalSummary.bullets.map(normalizeBulletNode);

  clone.experience = clone.experience.map((exp) => ({
    ...exp,
    title: collapseWhitespace(exp.title),
    company: collapseWhitespace(exp.company),
    dates: collapseWhitespace(exp.dates),
    location: exp.location ? collapseWhitespace(exp.location) : undefined,
    bullets: exp.bullets.map((b) => normalizeBulletNode({ ...b, role: exp.title, company: exp.company })),
  }));

  clone.projects = clone.projects.map((p) => ({
    ...p,
    name: collapseWhitespace(p.name),
    description: p.description ? collapseWhitespace(p.description) : undefined,
    bullets: p.bullets.map((b) => normalizeBulletNode(b)),
  }));

  clone.education = clone.education.map((e) => ({
    ...e,
    degree: e.degree ? collapseWhitespace(e.degree) : undefined,
    institution: collapseWhitespace(e.institution),
    year: e.year ? collapseWhitespace(e.year) : undefined,
    bullets: e.bullets.map(normalizeBulletNode),
  }));

  clone.skills = dedupeSkills(
    clone.skills.map((s) => ({
      ...s,
      name: collapseWhitespace(s.name),
      category: s.category ? titleCaseSection(s.category) : undefined,
    })),
  );

  clone.certifications = clone.certifications.map((c) => ({
    ...c,
    name: collapseWhitespace(c.name),
    issuer: c.issuer ? collapseWhitespace(c.issuer) : undefined,
  }));

  clone.links = clone.links.map((l) => ({
    ...l,
    label: collapseWhitespace(l.label),
    url: normalizeHyperlink(l.url),
    valid: isValidUrl(normalizeHyperlink(l.url)),
  }));

  clone.awards = clone.awards.map((a) => ({
    ...a,
    title: collapseWhitespace(a.title),
    issuer: a.issuer ? collapseWhitespace(a.issuer) : undefined,
  }));

  clone.customSections = clone.customSections.map((sec) => ({
    ...sec,
    title: titleCaseSection(sec.title),
    lines: sec.lines.map((l) => collapseWhitespace(l)),
    bullets: sec.bullets.map(normalizeBulletNode),
  }));

  clone.bullets = [
    ...clone.professionalSummary.bullets,
    ...clone.experience.flatMap((e) => e.bullets),
    ...clone.projects.flatMap((p) => p.bullets),
    ...clone.education.flatMap((e) => e.bullets),
    ...clone.customSections.flatMap((s) => s.bullets),
  ];

  return clone;
}

/** Normalize plain text before parsing. */
export function normalizeResumeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      const uni = normalizeUnicode(line);
      if (isBulletLineRaw(uni)) return normalizeBulletSymbol(uni);
      const section = canonicalSectionName(uni.trim());
      if (section) return section;
      return uni.replace(/[ \t]+/g, " ").trimEnd();
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isBulletLineRaw(line: string): boolean {
  return /^[-•●○◦▪▸►–—*]\s+/.test(line.trim()) || /^\d+[.)]\s+/.test(line.trim());
}

function normalizeBulletNode<T extends { text: string }>(bullet: T): T {
  return { ...bullet, text: collapseWhitespace(bullet.text) };
}

function dedupeSkills<T extends { name: string }>(skills: T[]): T[] {
  const seen = new Set<string>();
  return skills.filter((s) => {
    const key = s.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isValidUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return Boolean(parsed.hostname);
  } catch {
    return false;
  }
}
