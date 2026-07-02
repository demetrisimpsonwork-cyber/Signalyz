import jsPDF from "jspdf";
import { toast } from "sonner";
import type { CalibratedResumeData } from "@/hooks/useResumeAssembly";
import {
  normalizeResumeForExport,
  RESUME_SECTION_LABELS,
  type ExportResumeModel,
} from "@/lib/resumeExportModel";
import type { CalibratedResumeSanitizeOptions } from "@/lib/calibratedResumeSanitizer";

const PAGE_W = 210;
const PAGE_H = 297;
const ML = 20;
const MR = 20;
const MT = 22;
const MB = 20;
const CONTENT_W = PAGE_W - ML - MR;

type JsPdfDoc = InstanceType<typeof jsPDF>;

interface PdfLayoutContext {
  doc: JsPdfDoc;
  y: number;
}

function lineHeightMm(fontSize: number, lineHeight = 1.35): number {
  return (fontSize * lineHeight * 25.4) / 72;
}

function ensureSpace(ctx: PdfLayoutContext, needed: number) {
  if (ctx.y + needed > PAGE_H - MB) {
    ctx.doc.addPage();
    ctx.y = MT;
  }
}

function measureWrappedLines(
  doc: JsPdfDoc,
  text: string,
  fontSize: number,
  maxWidth: number,
): string[] {
  doc.setFontSize(fontSize);
  return doc.splitTextToSize(text, maxWidth) as string[];
}

function drawWrapped(
  ctx: PdfLayoutContext,
  text: string,
  fontSize: number,
  options?: {
    bold?: boolean;
    italic?: boolean;
    color?: string;
    align?: "left" | "center" | "right";
    x?: number;
    maxWidth?: number;
    lineHeight?: number;
    charSpace?: number;
  },
) {
  const {
    bold = false,
    italic = false,
    color = "#1A1A2E",
    align = "left",
    x = ML,
    maxWidth = CONTENT_W,
    lineHeight = 1.35,
    charSpace = 0,
  } = options || {};

  const style = bold && italic ? "bolditalic" : bold ? "bold" : italic ? "italic" : "normal";
  ctx.doc.setFont("helvetica", style);
  ctx.doc.setFontSize(fontSize);
  ctx.doc.setTextColor(color);
  if (charSpace) ctx.doc.setCharSpace(charSpace);

  const lh = lineHeightMm(fontSize, lineHeight);
  const lines = measureWrappedLines(ctx.doc, text, fontSize, maxWidth);

  for (const line of lines) {
    ensureSpace(ctx, lh);
    if (align === "center") {
      ctx.doc.text(line, PAGE_W / 2, ctx.y, { align: "center" });
    } else if (align === "right") {
      ctx.doc.text(line, PAGE_W - MR, ctx.y, { align: "right" });
    } else {
      ctx.doc.text(line, x, ctx.y);
    }
    ctx.y += lh;
  }

  if (charSpace) ctx.doc.setCharSpace(0);
}

function measureBulletHeight(doc: JsPdfDoc, text: string): number {
  const fontSize = 10;
  const lh = lineHeightMm(fontSize);
  const lines = measureWrappedLines(doc, text, fontSize, CONTENT_W - 7);
  return lines.length * lh + 1.5;
}

function drawSectionHeader(ctx: PdfLayoutContext, title: string, minFollowHeight = 0) {
  const headerBlock = 6 + 2 + 4.5 + minFollowHeight;
  ensureSpace(ctx, headerBlock);
  ctx.y += 6;
  ctx.doc.setFont("helvetica", "bold");
  ctx.doc.setFontSize(10.5);
  ctx.doc.setTextColor("#374151");
  ctx.doc.setCharSpace(1.2);
  ctx.doc.text(title.toUpperCase(), ML, ctx.y);
  ctx.doc.setCharSpace(0);
  ctx.y += 2;
  ctx.doc.setDrawColor("#374151");
  ctx.doc.setLineWidth(0.2);
  ctx.doc.line(ML, ctx.y, PAGE_W - MR, ctx.y);
  ctx.y += 4.5;
}

function drawBullet(ctx: PdfLayoutContext, text: string) {
  const bulletIndent = ML + 3;
  const textIndent = ML + 7;
  const fontSize = 10;
  const lh = lineHeightMm(fontSize);
  const lines = measureWrappedLines(ctx.doc, text, fontSize, CONTENT_W - 7);
  const totalH = lines.length * lh + 1.5;
  ensureSpace(ctx, totalH);

  ctx.doc.setFont("helvetica", "normal");
  ctx.doc.setFontSize(fontSize);
  ctx.doc.setTextColor("#1A1A2E");
  ctx.doc.text("•", bulletIndent, ctx.y);
  for (const line of lines) {
    ctx.doc.text(line, textIndent, ctx.y);
    ctx.y += lh;
  }
  ctx.y += 1.5;
}

function drawExperienceRole(
  ctx: PdfLayoutContext,
  exp: ExportResumeModel["experience"][number],
) {
  const titleH = exp.title || exp.dates ? 4.5 : 0;
  const companyH = exp.company ? 4 : 0;
  const firstBulletH = exp.bullets[0] ? measureBulletHeight(ctx.doc, exp.bullets[0]) : 0;
  ensureSpace(ctx, titleH + companyH + firstBulletH);

  if (exp.title || exp.dates) {
    ensureSpace(ctx, 4.5);
    if (exp.title) {
      ctx.doc.setFont("helvetica", "italic");
      ctx.doc.setFontSize(10.5);
      ctx.doc.setTextColor("#1A1A2E");
      ctx.doc.text(exp.title, ML, ctx.y);
    }
    if (exp.dates) {
      ctx.doc.setFont("helvetica", "normal");
      ctx.doc.setFontSize(9.5);
      ctx.doc.setTextColor("#6B7280");
      ctx.doc.text(exp.dates, PAGE_W - MR, ctx.y, { align: "right" });
    }
    ctx.y += 4.5;
  }

  if (exp.company) {
    ensureSpace(ctx, 4);
    ctx.doc.setFont("helvetica", "bold");
    ctx.doc.setFontSize(10);
    ctx.doc.setTextColor("#374151");
    ctx.doc.text(exp.company, ML, ctx.y);
    ctx.y += 4;
  }

  for (const bullet of exp.bullets) {
    drawBullet(ctx, bullet);
  }
  ctx.y += 4;
}

function renderPdfLayout(model: ExportResumeModel, doc: JsPdfDoc): PdfLayoutContext {
  const ctx: PdfLayoutContext = { doc, y: MT };

  drawWrapped(ctx, model.header.name, 18, { bold: true, align: "center", color: "#1A1A2E" });
  ctx.y += 1;

  if (model.header.title) {
    drawWrapped(ctx, model.header.title, 11, { align: "center", color: "#4B5563" });
    ctx.y += 0.5;
  }

  if (model.header.contactLine) {
    drawWrapped(ctx, model.header.contactLine, 9, { align: "center", color: "#6B7280" });
  }

  ctx.y += 2;
  doc.setDrawColor("#D1D5DB");
  doc.setLineWidth(0.3);
  doc.line(ML, ctx.y, PAGE_W - MR, ctx.y);
  ctx.y += 5;

  if (model.summary) {
    const summaryLines = measureWrappedLines(doc, model.summary, 10, CONTENT_W);
    const summaryH = summaryLines.length * lineHeightMm(10, 1.7) + 3;
    drawSectionHeader(ctx, RESUME_SECTION_LABELS.summary, summaryH);
    drawWrapped(ctx, model.summary, 10, { lineHeight: 1.7 });
    ctx.y += 3;
  }

  if (model.competencies.length > 0) {
    const compLines = measureWrappedLines(doc, model.competenciesText, 10, CONTENT_W);
    const compH = compLines.length * lineHeightMm(10, 1.6) + 3;
    drawSectionHeader(ctx, RESUME_SECTION_LABELS.competencies, compH);
    drawWrapped(ctx, model.competenciesText, 10, { color: "#374151", lineHeight: 1.6 });
    ctx.y += 3;
  }

  if (model.experience.length > 0) {
    const firstRoleH =
      4.5 +
      (model.experience[0].company ? 4 : 0) +
      (model.experience[0].bullets[0] ? measureBulletHeight(doc, model.experience[0].bullets[0]) : 0);
    drawSectionHeader(ctx, RESUME_SECTION_LABELS.experience, firstRoleH);
    for (const exp of model.experience) {
      drawExperienceRole(ctx, exp);
    }
  }

  if (model.projects.length > 0) {
    const firstProj = model.projects[0];
    const nameDesc = firstProj.description
      ? `${firstProj.name} — ${firstProj.description}`
      : firstProj.name;
    const nameLines = measureWrappedLines(doc, nameDesc, 10.5, CONTENT_W);
    const firstProjH =
      nameLines.length * lineHeightMm(10.5) +
      (firstProj.bullets[0] ? measureBulletHeight(doc, firstProj.bullets[0]) : 0);
    drawSectionHeader(ctx, RESUME_SECTION_LABELS.projects, firstProjH);

    for (const proj of model.projects) {
      const projBlockH =
        4 +
        (proj.description
          ? measureWrappedLines(doc, proj.description, 10, CONTENT_W).length * lineHeightMm(10)
          : 0) +
        proj.bullets.reduce((sum, b) => sum + measureBulletHeight(doc, b), 0);
      ensureSpace(ctx, projBlockH);

      ensureSpace(ctx, 4);
      ctx.doc.setFont("helvetica", "bold");
      ctx.doc.setFontSize(10.5);
      ctx.doc.setTextColor("#1A1A2E");
      ctx.doc.text(proj.name, ML, ctx.y);
      if (proj.description) {
        const nameW = ctx.doc.getTextWidth(proj.name);
        ctx.doc.setFont("helvetica", "normal");
        ctx.doc.setFontSize(10);
        ctx.doc.setTextColor("#6B7280");
        const descLines = measureWrappedLines(doc, ` — ${proj.description}`, 10, CONTENT_W - nameW);
        if (descLines.length === 1) {
          ctx.doc.text(descLines[0], ML + nameW, ctx.y);
          ctx.y += lineHeightMm(10.5);
        } else {
          ctx.y += lineHeightMm(10.5);
          drawWrapped(ctx, proj.description, 10, { color: "#6B7280" });
        }
      } else {
        ctx.y += 4;
      }

      for (const bullet of proj.bullets) {
        drawBullet(ctx, bullet);
      }
      ctx.y += 3;
    }
  }

  if (model.certifications.length > 0) {
    const firstCertH = model.certifications[0]
      ? measureBulletHeight(doc, model.certifications[0])
      : 0;
    drawSectionHeader(ctx, RESUME_SECTION_LABELS.certifications, firstCertH);
    for (const cert of model.certifications) {
      drawBullet(ctx, cert);
    }
    ctx.y += 3;
  }

  if (model.education.length > 0) {
    const eduH = lineHeightMm(10) + 2;
    drawSectionHeader(ctx, RESUME_SECTION_LABELS.education, eduH);

    for (const edu of model.education) {
      const leftParts = [edu.degree, edu.institution].filter(Boolean).join(" · ");
      ensureSpace(ctx, 4);
      if (leftParts) {
        ctx.doc.setFont("helvetica", "normal");
        ctx.doc.setFontSize(10);
        ctx.doc.setTextColor("#1A1A2E");
        ctx.doc.text(leftParts, ML, ctx.y);
      }
      if (edu.year) {
        ctx.doc.setFont("helvetica", "normal");
        ctx.doc.setFontSize(9.5);
        ctx.doc.setTextColor("#6B7280");
        ctx.doc.text(edu.year, PAGE_W - MR, ctx.y, { align: "right" });
      }
      ctx.y += 4;
    }
  }

  return ctx;
}

/**
 * Export the calibrated resume as a designed PDF using jsPDF.
 */
export async function exportCalibratedPdf(
  resume: CalibratedResumeData,
  sanitizeOptions?: CalibratedResumeSanitizeOptions,
) {
  if (!resume) {
    toast.error("No resume data found. Please assemble your resume first.");
    return;
  }

  try {
    toast.info("Generating PDF…");
    const model = normalizeResumeForExport(resume, sanitizeOptions);
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    renderPdfLayout(model, doc);
    doc.save("Calibrated_Resume.pdf");
    toast.success("PDF exported");
  } catch (err) {
    console.error("PDF export error:", err);
    toast.error("Failed to export PDF. Please try again.");
  }
}
