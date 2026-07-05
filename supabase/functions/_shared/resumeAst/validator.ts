import type { ResumeAst, ValidationDiagnostic, ValidationResult } from "./types.ts";

const DATE_RANGE_RX = /\b(19|20)\d{2}\s*[–\-—]\s*(Present|(19|20)\d{2})\b/i;

/** Structural validation — diagnostics only, never mutates. */
export function validateResumeAst(ast: ResumeAst): ValidationResult {
  const diagnostics: ValidationDiagnostic[] = [];

  if (!ast.header.name && ast.header.rawLines.length === 0) {
    diagnostics.push({
      code: "header.missing",
      severity: "error",
      message: "Resume header is missing or empty.",
      section: "header",
    });
  }

  const sectionNames: string[] = [];
  if (ast.professionalSummary.text || ast.professionalSummary.bullets.length > 0) {
    sectionNames.push("Professional Summary");
  }
  if (ast.experience.length > 0) sectionNames.push("Experience");
  if (ast.projects.length > 0) sectionNames.push("Projects");
  if (ast.education.length > 0) sectionNames.push("Education");
  if (ast.skills.length > 0) sectionNames.push("Skills");
  if (ast.certifications.length > 0) sectionNames.push("Certifications");
  if (ast.awards.length > 0) sectionNames.push("Awards");
  for (const custom of ast.customSections) sectionNames.push(custom.title);

  const dupSections = findDuplicates(sectionNames);
  for (const section of dupSections) {
    diagnostics.push({
      code: "section.duplicate",
      severity: "warning",
      message: `Duplicate section detected: ${section}`,
      section,
    });
  }

  if (ast.experience.length === 0) {
    diagnostics.push({
      code: "experience.empty",
      severity: "warning",
      message: "No experience entries parsed.",
      section: "Experience",
    });
  }

  for (const exp of ast.experience) {
    if (!exp.title || !exp.company) {
      diagnostics.push({
        code: "experience.malformed_header",
        severity: "warning",
        message: "Experience entry is missing title or company.",
        section: "Experience",
      });
    }
    if (!DATE_RANGE_RX.test(exp.dates) && !/\b(19|20)\d{2}\b/.test(exp.dates)) {
      diagnostics.push({
        code: "chronology.invalid_dates",
        severity: "warning",
        message: `Unrecognized date range: ${exp.dates}`,
        section: "Experience",
      });
    }
    for (const bullet of exp.bullets) {
      if (bullet.text.length < 8) {
        diagnostics.push({
          code: "bullet.malformed",
          severity: "warning",
          message: "Bullet is too short or empty.",
          section: "Experience",
          bulletId: bullet.id,
        });
      }
    }
  }

  for (const bullet of ast.bullets) {
    if (!bullet.text.trim()) {
      diagnostics.push({
        code: "bullet.empty",
        severity: "error",
        message: "Empty bullet detected.",
        section: bullet.section,
        bulletId: bullet.id,
      });
    }
  }

  const skillNames = ast.skills.map((s) => s.name.toLowerCase());
  for (const dup of findDuplicates(skillNames)) {
    diagnostics.push({
      code: "skills.duplicate",
      severity: "warning",
      message: `Duplicate skill: ${dup}`,
      section: "Skills",
    });
  }

  for (const link of ast.links) {
    if (!link.valid) {
      diagnostics.push({
        code: "links.broken",
        severity: "warning",
        message: `Hyperlink may be invalid: ${link.label}`,
        section: "Links",
      });
    }
  }

  const chronologyIssues = validateChronology(ast);
  diagnostics.push(...chronologyIssues);

  const hasError = diagnostics.some((d) => d.severity === "error");
  return { valid: !hasError, diagnostics };
}

function findDuplicates(items: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) dupes.add(item);
    seen.add(key);
  }
  return [...dupes];
}

function validateChronology(ast: ResumeAst): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];
  const ranges: Array<{ label: string; start: number; end: number }> = [];

  for (const exp of ast.experience) {
    const match = exp.dates.match(/\b(19|20)(\d{2})\s*[–\-—]\s*(Present|(19|20)(\d{2}))\b/i);
    if (!match) continue;
    const start = Number(`${match[1]}${match[2]}`);
    const end = match[3]?.toLowerCase() === "present" ? 9999 : Number(`${match[4]}${match[5]}`);
    if (end < start) {
      diagnostics.push({
        code: "chronology.inverted_range",
        severity: "error",
        message: `End date precedes start date for ${exp.title} at ${exp.company}.`,
        section: "Experience",
      });
    }
    ranges.push({ label: `${exp.company}`, start, end });
  }

  const sorted = [...ranges].sort((a, b) => b.start - a.start);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const curr = sorted[i]!;
    if (curr.end > prev.start && curr.start < prev.end) {
      diagnostics.push({
        code: "chronology.overlap",
        severity: "info",
        message: `Overlapping employment dates between ${curr.label} and ${prev.label}.`,
        section: "Experience",
      });
    }
  }

  return diagnostics;
}

export function mergeDiagnostics(...groups: ValidationDiagnostic[][]): ValidationDiagnostic[] {
  const seen = new Set<string>();
  const out: ValidationDiagnostic[] = [];
  for (const group of groups) {
    for (const d of group) {
      const key = `${d.code}:${d.section ?? ""}:${d.bulletId ?? ""}:${d.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(d);
    }
  }
  return out;
}
