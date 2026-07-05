import {
  collapseWhitespace,
  EMAIL_RX,
  normalizeHyperlink,
  PHONE_RX,
  URL_RX,
} from "./textUtils.ts";
import type { AstConfidence, AstLinkType, LinkEntry } from "./types.ts";

const LINKEDIN_RX = /\blinkedin\.com\/(?:in|pub)\/[\w%-]+/i;
const GITHUB_RX = /\bgithub\.com\/[\w.-]+/i;
const DOMAIN_RX = /\b(?:https?:\/\/)?(?:www\.)?([a-z0-9][-a-z0-9]*\.)+[a-z]{2,}(?:\/\S*)?/i;

const IMPORTANT_LINK_TYPES = new Set<AstLinkType>([
  "email",
  "phone",
  "linkedin",
  "github",
  "portfolio",
  "website",
]);

let linkCounter = 0;

function nextLinkId(prefix: string): string {
  linkCounter += 1;
  return `${prefix}_${linkCounter}`;
}

export function resetLinkExtractionCounter(): void {
  linkCounter = 0;
}

export function isImportantLinkType(type: AstLinkType): boolean {
  return IMPORTANT_LINK_TYPES.has(type);
}

export function normalizeLinkValue(type: AstLinkType, raw: string): string {
  const trimmed = collapseWhitespace(raw);
  if (!trimmed) return "";
  switch (type) {
    case "email":
      return trimmed.toLowerCase();
    case "phone":
      return trimmed.replace(/[^\d+]/g, "");
    case "linkedin":
    case "github":
    case "portfolio":
    case "website":
      return normalizeHyperlink(trimmed).toLowerCase().replace(/\/$/, "");
    default:
      return trimmed.toLowerCase();
  }
}

export function classifyUrl(raw: string): AstLinkType {
  const lower = raw.toLowerCase();
  if (LINKEDIN_RX.test(lower)) return "linkedin";
  if (GITHUB_RX.test(lower)) return "github";
  if (/^mailto:/i.test(lower)) return "email";
  if (/portfolio|behance|dribbble/i.test(lower)) return "portfolio";
  if (/^https?:\/\//i.test(lower) || /^www\./i.test(lower) || DOMAIN_RX.test(lower)) {
    return "portfolio";
  }
  return "website";
}

export function isValidLink(type: AstLinkType, value: string): boolean {
  const normalized = normalizeLinkValue(type, value);
  if (!normalized) return false;
  switch (type) {
    case "email":
      return EMAIL_RX.test(value);
    case "phone":
      return PHONE_RX.test(value) && normalized.replace(/\D/g, "").length >= 10;
    case "linkedin":
      return LINKEDIN_RX.test(value);
    case "github":
      return GITHUB_RX.test(value);
    case "portfolio":
    case "website":
      return /^https?:\/\//i.test(normalizeHyperlink(value)) || DOMAIN_RX.test(value);
    default:
      return value.length >= 4;
  }
}

function makeLink(input: {
  type: AstLinkType;
  value: string;
  sourceSection: string;
  label?: string;
  confidence?: AstConfidence;
}): LinkEntry {
  const value = collapseWhitespace(input.value);
  const normalizedValue = normalizeLinkValue(input.type, value);
  const url =
    input.type === "email" || input.type === "phone"
      ? value
      : normalizeHyperlink(value);
  return {
    id: nextLinkId("link"),
    type: input.type,
    label: input.label ?? input.type,
    value,
    normalizedValue,
    sourceSection: input.sourceSection,
    confidence: input.confidence ?? "high",
    url,
    valid: isValidLink(input.type, value),
  };
}

function dedupeLinks(links: LinkEntry[]): LinkEntry[] {
  const seen = new Set<string>();
  const out: LinkEntry[] = [];
  for (const link of links) {
    const key = `${link.type}:${link.normalizedValue}`;
    if (!link.normalizedValue || seen.has(key)) continue;
    seen.add(key);
    out.push(link);
  }
  return out;
}

/** Extract structured links from resume plain text (header, contact block, inline URLs, Links section). */
export function extractStructuredLinks(
  rawText: string,
  options?: { sourceSections?: string[] },
): LinkEntry[] {
  resetLinkExtractionCounter();
  const text = rawText.trim();
  if (!text) return [];

  const links: LinkEntry[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  let inLinksSection = false;
  for (const line of lines) {
    if (/^links?\s*:?\s*$/i.test(line)) {
      inLinksSection = true;
      continue;
    }
    if (inLinksSection && /^(experience|education|skills|summary|projects)\b/i.test(line)) {
      inLinksSection = false;
    }

    const section = inLinksSection ? "links" : options?.sourceSections?.[0] ?? "header";

    const email = line.match(EMAIL_RX);
    if (email) {
      links.push(
        makeLink({
          type: "email",
          value: email[0],
          sourceSection: section,
          label: "email",
        }),
      );
    }

    const phone = line.match(PHONE_RX);
    if (phone) {
      links.push(
        makeLink({
          type: "phone",
          value: phone[0],
          sourceSection: section,
          label: "phone",
        }),
      );
    }

    const urlMatches = line.match(new RegExp(URL_RX.source, "gi")) ?? [];
    for (const match of urlMatches) {
      const type = classifyUrl(match);
      links.push(
        makeLink({
          type,
          value: match,
          sourceSection: section,
          label: type,
        }),
      );
    }

    if (inLinksSection && line && !EMAIL_RX.test(line) && !URL_RX.test(line) && !PHONE_RX.test(line)) {
      const type = classifyUrl(line);
      if (type === "portfolio" || type === "website") {
        links.push(
          makeLink({
            type,
            value: line,
            sourceSection: "links",
            confidence: "medium",
          }),
        );
      }
    }
  }

  return dedupeLinks(links).filter((l) => l.valid);
}

export function countLinksByType(links: LinkEntry[]): Record<AstLinkType, number> {
  const counts: Record<string, number> = {};
  for (const link of links) {
    counts[link.type] = (counts[link.type] ?? 0) + 1;
  }
  return counts as Record<AstLinkType, number>;
}
