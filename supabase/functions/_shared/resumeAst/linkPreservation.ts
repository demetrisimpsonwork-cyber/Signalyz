import { parseResumeAst } from "./parser.ts";
import { extractStructuredLinks, isImportantLinkType, isValidLink } from "./linkExtraction.ts";
import type { AstLinkType, LinkEntry, ResumeLinkPreservationReport } from "./types.ts";

export interface CalibratedResumeLinkShape {
  header?: {
    name?: string;
    title?: string;
    email?: string;
    phone?: string;
    linkedin?: string;
    github?: string;
    website?: string;
    location?: string;
  };
}

const BLOCKED_LOG = /resume_text|@|\.com|phone:|mailto:|https?:\/\//i;

function linksFromCalibratedResume(resume: CalibratedResumeLinkShape): LinkEntry[] {
  const header = resume.header ?? {};
  const candidates: Array<{ type: AstLinkType; value: string }> = [];
  if (header.email) candidates.push({ type: "email", value: header.email });
  if (header.phone) candidates.push({ type: "phone", value: header.phone });
  if (header.linkedin) candidates.push({ type: "linkedin", value: header.linkedin });
  if (header.github) candidates.push({ type: "github", value: header.github });
  if (header.website) candidates.push({ type: "portfolio", value: header.website });

  return extractStructuredLinks(
    candidates.map((c) => c.value).join(" | "),
    { sourceSections: ["generated_header"] },
  );
}

function linkKey(link: Pick<LinkEntry, "type" | "normalizedValue">): string {
  return `${link.type}:${link.normalizedValue}`;
}

function missingImportantLinks(source: LinkEntry[], generated: LinkEntry[]): LinkEntry[] {
  const generatedKeys = new Set(generated.map(linkKey));
  return source.filter(
    (link) =>
      isImportantLinkType(link.type) &&
      link.valid &&
      !generatedKeys.has(linkKey(link)),
  );
}

function countDuplicateLinks(links: LinkEntry[]): number {
  const seen = new Set<string>();
  let dupes = 0;
  for (const link of links) {
    const key = linkKey(link);
    if (seen.has(key)) dupes += 1;
    seen.add(key);
  }
  return dupes;
}

function applyLinkToHeader(
  header: NonNullable<CalibratedResumeLinkShape["header"]>,
  link: LinkEntry,
): boolean {
  const value = link.value.trim();
  if (!value) return false;

  switch (link.type) {
    case "email":
      if (header.email?.trim() && isValidLink("email", header.email)) return false;
      header.email = value;
      return true;
    case "phone":
      if (header.phone?.trim() && isValidLink("phone", header.phone)) return false;
      header.phone = value;
      return true;
    case "linkedin":
      if (header.linkedin?.trim() && isValidLink("linkedin", header.linkedin)) return false;
      header.linkedin = value;
      return true;
    case "github":
      if (header.github?.trim() && isValidLink("github", header.github)) return false;
      header.github = value;
      return true;
    case "portfolio":
    case "website":
      if (header.website?.trim() && isValidLink(link.type, header.website)) return false;
      header.website = value;
      return true;
    default:
      return false;
  }
}

export interface LinkPreservationResult<T extends CalibratedResumeLinkShape> {
  resume: T;
  report: ResumeLinkPreservationReport;
  restored: boolean;
}

/** Restore source links dropped during assembly. Never invents links. */
export function applyLinkPreservationGuard<T extends CalibratedResumeLinkShape>(input: {
  sourceResumeText: string;
  resume: T;
  requestId?: string;
}): LinkPreservationResult<T> {
  const started = performance.now();
  const sourceAst = parseResumeAst(input.sourceResumeText).ast;
  const sourceLinks = dedupeByKey([
    ...sourceAst.links,
    ...extractStructuredLinks(input.sourceResumeText, { sourceSections: ["source_scan"] }),
  ]).filter((l) => l.valid);

  const generatedBefore = linksFromCalibratedResume(input.resume);
  const resume = structuredClone(input.resume);
  resume.header ??= {};

  const toRestore = missingImportantLinks(sourceLinks, generatedBefore);
  const restoredTypes: AstLinkType[] = [];
  let restoredCount = 0;

  for (const link of toRestore) {
    if (applyLinkToHeader(resume.header!, link)) {
      restoredCount += 1;
      restoredTypes.push(link.type);
    }
  }

  const generatedAfter = linksFromCalibratedResume(resume);

  const report: ResumeLinkPreservationReport = {
    event: "resume_link_preservation_report",
    request_id: input.requestId,
    source_link_count: sourceLinks.length,
    generated_link_count_before: generatedBefore.length,
    generated_link_count_after: generatedAfter.length,
    restored_link_count: restoredCount,
    link_types_restored: [...new Set(restoredTypes)],
    duplicate_link_count: countDuplicateLinks(generatedAfter),
    broken_link_count: 0,
    preservation_ok: missingImportantLinks(sourceLinks, generatedAfter).length === 0,
    run_time_ms: Math.round(performance.now() - started),
  };

  assertLinkPreservationReportSafe(report);
  return { resume, report, restored: restoredCount > 0 };
}

function dedupeByKey(links: LinkEntry[]): LinkEntry[] {
  const map = new Map<string, LinkEntry>();
  for (const link of links) {
    const key = linkKey(link);
    if (!map.has(key)) map.set(key, link);
  }
  return [...map.values()];
}

export function assertLinkPreservationReportSafe(report: ResumeLinkPreservationReport): void {
  const serialized = JSON.stringify(report);
  if (serialized.length > 1500) {
    throw new Error("resume_link_preservation_report: payload too large");
  }
  if (BLOCKED_LOG.test(serialized)) {
    throw new Error("resume_link_preservation_report: blocked content");
  }
}

export function logLinkPreservationReport(report: ResumeLinkPreservationReport): void {
  assertLinkPreservationReportSafe(report);
  console.log(JSON.stringify(report));
}
