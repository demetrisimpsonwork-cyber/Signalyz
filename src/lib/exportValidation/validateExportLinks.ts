import type { ExportValidationContext, ExportValidationDiagnostic } from "./types";

const URL_RE = /https?:\/\/[^\s|]+/gi;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const LINKEDIN_RE = /linkedin\.com\/[^\s|]+/gi;
const GITHUB_RE = /github\.com\/[^\s|]+/gi;

function countMatches(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length;
}

export function validateExportLinks(ctx: ExportValidationContext): {
  diagnostics: ExportValidationDiagnostic[];
  linkCount: number;
  brokenLinkCount: number;
  missingExpectedLinkCount: number;
  duplicateLinkCount: number;
} {
  const diagnostics: ExportValidationDiagnostic[] = [];
  const text = ctx.extractedText;

  const urlCount = countMatches(text, URL_RE);
  const emailCount = countMatches(text, EMAIL_RE);
  const linkedinCount = countMatches(text, LINKEDIN_RE);
  const githubCount = countMatches(text, GITHUB_RE);
  const linkCount = urlCount + emailCount + linkedinCount + githubCount;

  const brokenLinkCount = (text.match(/https?:\/\/\s|mailto:\s|linkedin\.com\s*$/gi) ?? []).length;
  if (brokenLinkCount > 0) {
    diagnostics.push({
      code: "broken_link",
      severity: "error",
      message: "Detected malformed or truncated link patterns in export text.",
    });
  }

  let duplicateLinkCount = 0;
  const seen = new Map<string, number>();
  for (const m of text.matchAll(/(?:https?:\/\/[^\s|]+|linkedin\.com\/[^\s|]+|github\.com\/[^\s|]+)/gi)) {
    const key = m[0].toLowerCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [, n] of seen) {
    if (n > 1) duplicateLinkCount += n - 1;
  }
  if (duplicateLinkCount > 0) {
    diagnostics.push({
      code: "duplicate_link",
      severity: "warning",
      message: "Duplicate contact or profile links detected in export.",
    });
  }

  let missingExpectedLinkCount = 0;
  if (ctx.expectedLinkCount > 0 && linkCount < ctx.expectedLinkCount) {
    missingExpectedLinkCount = ctx.expectedLinkCount - linkCount;
    diagnostics.push({
      code: "missing_expected_link",
      severity: "warning",
      message: `Expected at least ${ctx.expectedLinkCount} link signals; found ${linkCount}.`,
    });
  }

  return { diagnostics, linkCount, brokenLinkCount, missingExpectedLinkCount, duplicateLinkCount };
}
