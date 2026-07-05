import type { DetectorContext, QaIssue } from "./types.ts";
import { extractBulletsFromLines } from "./types.ts";

/** Detect broken headings, spaced letters, missing structure, duplicates. */
export function detectFormattingIssues(ctx: DetectorContext): QaIssue[] {
  const issues: QaIssue[] = [];
  const text = ctx.generatedResumeText;
  const lines = text.split(/\r?\n/);

  if (hasSpacedLetters(text)) {
    issues.push({
      code: "formatting_spaced_letters",
      severity: "critical",
      message: "Broken formatting: excessive spaced letters detected (resume may be unusable).",
      evidence: lines.find((l) => /(?:[A-Z]\s){3,}[A-Z]/.test(l)) ?? text.slice(0, 120),
      suggestedFix: "Fix headings and remove character-by-character spacing.",
    });
  }

  if (!hasDateStructure(text)) {
    issues.push({
      code: "formatting_missing_dates",
      severity: "medium",
      message: "Formatting warning: generated resume is missing recognizable role/company/date structure.",
      suggestedFix: "Use consistent `Title | Company | YYYY – YYYY` lines for each role.",
    });
  }

  const bullets = extractBulletsFromLines(text);
  const emptyBullets = bullets.filter((b) => b.trim().length < 8);
  if (emptyBullets.length > 0) {
    issues.push({
      code: "formatting_empty_bullets",
      severity: "medium",
      message: "Formatting warning: one or more bullets are too short or empty.",
      evidence: emptyBullets[0],
    });
  }

  const dupes = findDuplicateLines(bullets);
  if (dupes.length > 0) {
    issues.push({
      code: "formatting_duplicate_bullets",
      severity: "medium",
      message: "Formatting warning: duplicate bullets detected.",
      evidence: dupes[0],
    });
  }

  const duplicateSections = findDuplicateSectionHeaders(lines);
  if (duplicateSections.length > 0) {
    issues.push({
      code: "formatting_duplicate_sections",
      severity: "medium",
      message: "Formatting warning: duplicate section headers detected.",
      evidence: duplicateSections[0],
    });
  }

  if (hadLinks(ctx.sourceResumeText) && !hadLinks(text)) {
    issues.push({
      code: "formatting_missing_links",
      severity: "low",
      message: "Formatting note: source resume had links but generated resume does not.",
      suggestedFix: "Restore GitHub/LinkedIn/portfolio links from the source resume.",
    });
  }

  const shoutLines = lines.filter((l) => l.trim().length > 12 && l.trim() === l.trim().toUpperCase());
  if (shoutLines.length >= 3) {
    issues.push({
      code: "formatting_inconsistent_casing",
      severity: "low",
      message: "Formatting note: excessive ALL CAPS lines.",
      evidence: shoutLines[0],
    });
  }

  return issues;
}

function hasSpacedLetters(text: string): boolean {
  return /(?:[A-Z]\s){4,}[A-Za-z]/.test(text) || /\b[A-Z](?:\s[A-Z]){3,}\b/.test(text);
}

function hasDateStructure(text: string): boolean {
  return /\b(19|20)\d{2}\s*[–\-—]\s*(Present|(19|20)\d{2})\b/i.test(text) ||
    /\|\s*(19|20)\d{2}/.test(text);
}

function hadLinks(text: string): boolean {
  return /\bhttps?:\/\/|github\.com|linkedin\.com/i.test(text);
}

function findDuplicateLines(lines: string[]): string[] {
  const seen = new Map<string, number>();
  const dupes: string[] = [];
  for (const line of lines) {
    const key = line.toLowerCase().trim();
    if (!key) continue;
    seen.set(key, (seen.get(key) ?? 0) + 1);
    if (seen.get(key) === 2) dupes.push(line);
  }
  return dupes;
}

function findDuplicateSectionHeaders(lines: string[]): string[] {
  const headers = lines.filter((l) => /^(experience|education|skills|summary)\b/i.test(l.trim()));
  return findDuplicateLines(headers);
}
