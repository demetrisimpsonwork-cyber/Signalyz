import type { ExportResumeModel } from "@/lib/resumeExportModel";
import { RESUME_SECTION_LABELS } from "@/lib/resumeExportModel";

const LINK_SIGNAL_RE = /@|linkedin|github|http|www\./i;

export function buildExportValidationContextFromModel(model: ExportResumeModel): {
  expectedSectionLabels: string[];
  expectedLinkCount: number;
  expectedBulletCount: number;
} {
  const expectedSectionLabels: string[] = [];
  if (model.summary) expectedSectionLabels.push(RESUME_SECTION_LABELS.summary);
  if (model.competencies.length > 0) expectedSectionLabels.push(RESUME_SECTION_LABELS.competencies);
  if (model.experience.length > 0) expectedSectionLabels.push(RESUME_SECTION_LABELS.experience);
  if (model.projects.length > 0) expectedSectionLabels.push(RESUME_SECTION_LABELS.projects);
  if (model.certifications.length > 0) expectedSectionLabels.push(RESUME_SECTION_LABELS.certifications);
  if (model.education.length > 0) expectedSectionLabels.push(RESUME_SECTION_LABELS.education);

  const expectedLinkCount = model.header.contactParts.filter((part) => LINK_SIGNAL_RE.test(part)).length;

  const expectedBulletCount =
    model.experience.reduce((sum, exp) => sum + exp.bullets.length, 0) +
    model.projects.reduce((sum, proj) => sum + proj.bullets.length, 0) +
    model.certifications.length;

  return { expectedSectionLabels, expectedLinkCount, expectedBulletCount };
}
