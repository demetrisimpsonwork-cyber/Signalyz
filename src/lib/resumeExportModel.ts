/**
 * Single normalized resume representation for Preview display bullets and exports.
 * Does not truncate bullet text — preserves full content from the resume model.
 */
import type { CalibratedResumeData } from "@/hooks/useResumeAssembly";
import { bulletToPastTense } from "@/lib/pastTense";
import { polishResumeText } from "@/lib/resumeTextPolish";
import {
  sanitizeCalibratedResume,
  type CalibratedResumeSanitizeOptions,
} from "@/lib/calibratedResumeSanitizer";

/** Section labels — must match ResumeCanvas SectionHeader text */
export const RESUME_SECTION_LABELS = {
  summary: "Professional Summary",
  competencies: "Core Competencies",
  experience: "Experience",
  projects: "Independent Projects",
  certifications: "Certifications",
  education: "Education",
} as const;

export interface ExportExperienceEntry {
  title: string;
  company: string;
  dates: string;
  /** Past-tense display bullets — full text, not truncated */
  bullets: string[];
}

export interface ExportProjectEntry {
  name: string;
  description: string;
  bullets: string[];
}

export interface ExportEducationEntry {
  degree: string;
  institution: string;
  year: string;
}

export interface ExportResumeModel {
  header: {
    name: string;
    title: string;
    /** Preview order: location | email | phone | linkedin */
    contactParts: string[];
    contactLine: string;
  };
  summary: string;
  competencies: string[];
  competenciesText: string;
  experience: ExportExperienceEntry[];
  projects: ExportProjectEntry[];
  certifications: string[];
  education: ExportEducationEntry[];
}

/** Format bullet for preview/export — past tense + grammar polish, no length truncation */
export function formatBulletForDisplay(bullet: string): string {
  if (!bullet?.trim()) return "";
  return polishResumeText(bulletToPastTense(bullet.trim()));
}

/** Clean certification line for export (URLs/markdown stripped) */
export function cleanCertificationText(cert: string): string {
  let clean = cert
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/www\.\S+/gi, "")
    .replace(/<a[^>]*>(.*?)<\/a>/gi, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (/google\s+it\s+support\s+professional\s+certificate/i.test(clean)) {
    clean = "Google IT Support Professional Certificate — Coursera";
  }
  return clean;
}

/**
 * Normalize resume data for export and preview bullet display.
 * Uses core_competencies only (matches canvas — skills array is not shown separately).
 */
export function normalizeResumeForExport(
  resume: CalibratedResumeData,
  sanitizeOptions?: CalibratedResumeSanitizeOptions,
): ExportResumeModel {
  const cleaned = sanitizeOptions
    ? sanitizeCalibratedResume(resume, sanitizeOptions).resume
    : resume;

  const contactParts = [
    cleaned.header.location,
    cleaned.header.email,
    cleaned.header.phone,
    cleaned.header.linkedin,
    cleaned.header.github,
    cleaned.header.website,
  ]
    .map((s) => (s || "").trim())
    .filter(Boolean);

  const competencies = (cleaned.core_competencies || [])
    .map((s) => s.trim())
    .filter(Boolean);

  const experience: ExportExperienceEntry[] = (cleaned.experience || []).map((exp) => ({
    title: (exp.title || "").trim(),
    company: (exp.company || "").trim(),
    dates: (exp.dates || "").trim(),
    bullets: (exp.bullets || [])
      .map((b) => formatBulletForDisplay(b))
      .filter(Boolean),
  }));

  const projects: ExportProjectEntry[] = (cleaned.independent_projects || []).map((proj) => ({
    name: (proj.name || "").trim(),
    description: polishResumeText((proj.description || "").trim()),
    bullets: (proj.bullets || [])
      .map((b) => formatBulletForDisplay(b))
      .filter(Boolean),
  }));

  const certifications = (cleaned.certifications || [])
    .map(cleanCertificationText)
    .filter(Boolean);

  const education: ExportEducationEntry[] = (cleaned.education || []).map((edu) => ({
    degree: (edu.degree || "").trim(),
    institution: (edu.institution || "").trim(),
    year: (edu.year || "").trim(),
  }));

  return {
    header: {
      name: (cleaned.header.name || "").trim() || "Name",
      title: (cleaned.header.title || "").trim(),
      contactParts,
      contactLine: contactParts.join("  |  "),
    },
    summary: polishResumeText((cleaned.summary || "").trim()),
    competencies,
    competenciesText: competencies.join(",  "),
    experience,
    projects,
    certifications,
    education,
  };
}
