import { parseResumeIntake } from "@/lib/resumeIntake";
import { chunkText } from "./chunkText";
import type { DocumentChunkMetadata, TextChunk } from "./types";

export type ResumeSectionKind =
  | "summary"
  | "experience"
  | "skills"
  | "education"
  | "certifications"
  | "raw";

const MAX_SECTION_CHARS = 1000;

function formatExperienceBlock(
  roleTitle: string,
  company: string,
  location: string | undefined,
  startDate: string,
  endDate: string,
  responsibilities: string[],
): string {
  const header = [roleTitle, company, location].filter(Boolean).join(" | ");
  const dates = [startDate, endDate].filter(Boolean).join(" – ");
  const bullets = responsibilities.map((item) => `- ${item}`).join("\n");
  return [header, dates, bullets].filter(Boolean).join("\n");
}

function splitOversizedSection(
  content: string,
  metadata: DocumentChunkMetadata,
  startIndex: number,
): TextChunk[] {
  if (content.length <= MAX_SECTION_CHARS) {
    return [{ index: startIndex, content, metadata }];
  }

  return chunkText(content, { maxChunkSize: MAX_SECTION_CHARS, chunkOverlap: 100 }).map(
    (chunk, offset) => ({
      index: startIndex + offset,
      content: chunk.content,
      metadata: {
        ...metadata,
        section_part: offset,
      },
    }),
  );
}

/**
 * Chunks a resume into logical sections using the intake parser.
 * Falls back to paragraph chunking when structured sections are unavailable.
 */
export function chunkResumeSections(rawText: string): TextChunk[] {
  const normalized = rawText.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const parsed = parseResumeIntake(normalized);
  const structured: TextChunk[] = [];
  let index = 0;

  const append = (content: string, metadata: DocumentChunkMetadata) => {
    const parts = splitOversizedSection(content, metadata, index);
    structured.push(...parts);
    index += parts.length;
  };

  if (parsed.sections.summary.trim()) {
    append(parsed.sections.summary.trim(), { section: "summary" });
  }

  parsed.sections.experience.forEach((experience, sectionIndex) => {
    append(
      formatExperienceBlock(
        experience.role_title,
        experience.company,
        experience.location,
        experience.start_date,
        experience.end_date,
        experience.responsibilities,
      ),
      {
        section: "experience",
        section_index: sectionIndex,
        company: experience.company,
        role_title: experience.role_title,
      },
    );
  });

  if (parsed.sections.skills.length > 0) {
    append(`Skills: ${parsed.sections.skills.join(", ")}`, { section: "skills" });
  }

  if (parsed.sections.education.length > 0) {
    append(
      `Education:\n${parsed.sections.education.map((item) => `- ${item}`).join("\n")}`,
      { section: "education" },
    );
  }

  if (parsed.sections.certifications.length > 0) {
    append(
      `Certifications:\n${parsed.sections.certifications.map((item) => `- ${item}`).join("\n")}`,
      { section: "certifications" },
    );
  }

  if (structured.length > 0) {
    return structured.map((chunk, chunkIndex) => ({ ...chunk, index: chunkIndex }));
  }

  return chunkText(normalized).map((chunk, chunkIndex) => ({
    ...chunk,
    index: chunkIndex,
    metadata: { section: "raw" as ResumeSectionKind },
  }));
}
