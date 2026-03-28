import jsPDF from "jspdf";
import { toast } from "sonner";
import type { CalibratedResumeData } from "@/hooks/useResumeAssembly";

/* ── helpers ── */

function cleanCert(cert: string): string {
  return cert
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/www\.\S+/gi, "")
    .replace(/<a[^>]*>(.*?)<\/a>/gi, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const PAGE_W = 210; // A4 mm
const PAGE_H = 297;
const ML = 20;      // left margin
const MR = 20;
const MT = 22;       // top margin
const MB = 20;       // bottom margin
const CONTENT_W = PAGE_W - ML - MR;

/**
 * Export the calibrated resume as a Pinnacle-standard PDF using jsPDF.
 */
export async function exportCalibratedPdf(resume: CalibratedResumeData) {
  if (!resume) {
    toast.error("No resume data found. Please assemble your resume first.");
    return;
  }

  try {
    toast.info("Generating PDF…");

    const doc = new jsPDF({ unit: "mm", format: "a4" });
    let y = MT;

    /* ── page-break guard ── */
    function ensureSpace(needed: number) {
      if (y + needed > PAGE_H - MB) {
        doc.addPage();
        y = MT;
      }
    }

    /* ── text helpers ── */
    function drawWrapped(
      text: string,
      x: number,
      fontSize: number,
      options?: { bold?: boolean; italic?: boolean; color?: string; align?: "left" | "center"; maxWidth?: number; lineHeight?: number; charSpace?: number },
    ): number {
      const { bold = false, italic = false, color = "#1a1a2e", align = "left", maxWidth = CONTENT_W, lineHeight = 1.35, charSpace = 0 } = options || {};
      const style = bold && italic ? "bolditalic" : bold ? "bold" : italic ? "italic" : "normal";
      doc.setFont("helvetica", style);
      doc.setFontSize(fontSize);
      doc.setTextColor(color);
      if (charSpace) doc.setCharSpace(charSpace);
      const lines = doc.splitTextToSize(text, maxWidth) as string[];
      const lh = (fontSize * lineHeight * 25.4) / 72; // pt → mm
      for (const line of lines) {
        ensureSpace(lh);
        if (align === "center") {
          doc.text(line, PAGE_W / 2, y, { align: "center" });
        } else {
          doc.text(line, x, y);
        }
        y += lh;
      }
      if (charSpace) doc.setCharSpace(0); // reset
      return y;
    }

    function drawSectionHeader(title: string) {
      ensureSpace(12);
      y += 6;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor("#2d2d2d");
      doc.setCharSpace(1.2);
      doc.text(title.toUpperCase(), ML, y);
      doc.setCharSpace(0);
      y += 2;
      doc.setDrawColor("#888888");
      doc.setLineWidth(0.2);
      doc.line(ML, y, PAGE_W - MR, y);
      y += 4.5;
    }

    function drawBullet(text: string) {
      const bulletIndent = ML + 3;
      const textIndent = ML + 7;
      const bulletMaxW = CONTENT_W - 7;
      const fontSize = 10;
      const lh = (fontSize * 1.35 * 25.4) / 72;
      const lines = doc.splitTextToSize(text, bulletMaxW) as string[];

      // Check if entire bullet fits; if not, page break first
      const totalH = lines.length * lh + 1.5; // include inter-bullet spacing
      ensureSpace(totalH);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(fontSize);
      doc.setTextColor("#1a1a2e");
      doc.text("•", bulletIndent, y);
      for (const line of lines) {
        doc.text(line, textIndent, y);
        y += lh;
      }
      y += 1.5; // inter-bullet spacing for visual separation
    }

    /* ── Header ── */
    // Name — largest element, centered, bold
    drawWrapped(resume.header.name || "Name", ML, 18, { bold: true, align: "center", color: "#111111" });
    y += 1;

    // Title if present
    if (resume.header.title) {
      drawWrapped(resume.header.title, ML, 11, { align: "center", color: "#444444" });
      y += 0.5;
    }

    // Contact line — centered, bullet separators
    const contactParts = [resume.header.location, resume.header.email, resume.header.phone, resume.header.linkedin].filter(Boolean);
    if (contactParts.length) {
      drawWrapped(contactParts.join("  •  "), ML, 9, { align: "center", color: "#666666" });
    }

    // Header divider
    y += 2;
    doc.setDrawColor("#BBBBBB");
    doc.setLineWidth(0.3);
    doc.line(ML, y, PAGE_W - MR, y);
    y += 5;

    /* ── Professional Summary ── */
    if (resume.summary) {
      drawSectionHeader("Professional Summary");
      drawWrapped(resume.summary, ML, 10, { lineHeight: 1.4 });
      y += 3;
    }

    /* ── Core Competencies ── */
    const competencies = [...(resume.core_competencies || []), ...(resume.skills || [])].filter((v, i, a) => a.indexOf(v) === i);
    if (competencies.length) {
      drawSectionHeader("Core Competencies");
      drawWrapped(competencies.join("  •  "), ML, 10);
      y += 3;
    }

    /* ── Professional Experience ── */
    if (resume.experience.length) {
      drawSectionHeader("Professional Experience");
      for (const exp of resume.experience) {
        // Estimate total height for the entire role block
        const bulletLines = exp.bullets.reduce((sum, b) => {
          const lines = doc.splitTextToSize(b, CONTENT_W - 7) as string[];
          return sum + lines.length;
        }, 0);
        const roleBlockH = 6 + (exp.company ? 5 : 0) + bulletLines * ((10 * 1.35 * 25.4) / 72) + exp.bullets.length * 1.5 + 4;
        ensureSpace(Math.min(roleBlockH, PAGE_H - MT - MB));

        // Role Title — bold, own line
        if (exp.title) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10.5);
          doc.setTextColor("#111111");
          doc.text(exp.title, ML, y);
          y += 4.5;
        }

        // Company | Location | Dates — second line, lighter
        const metaParts = [exp.company, exp.dates].filter(Boolean);
        if (metaParts.length) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9.5);
          doc.setTextColor("#555555");
          doc.text(metaParts.join("  |  "), ML, y);
          y += 4.5;
        }

        // Bullets
        for (const b of exp.bullets) {
          drawBullet(b);
        }
        y += 4; // spacing between roles
      }
    }

    /* ── Independent Projects ── */
    if (resume.independent_projects?.length) {
      ensureSpace(24);
      drawSectionHeader("Independent Projects");
      for (const proj of resume.independent_projects) {
        ensureSpace(16);
        // Project name — bold
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        doc.setTextColor("#111111");
        doc.text(proj.name, ML, y);
        y += 4;

        // Description — regular weight, constrained width
        if (proj.description?.trim()) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          doc.setTextColor("#555555");
          const descLines = doc.splitTextToSize(proj.description.trim(), 155) as string[];
          const descLh = (10 * 1.35 * 25.4) / 72;
          for (const dl of descLines) {
            ensureSpace(descLh);
            doc.text(dl, ML, y);
            y += descLh;
          }
          y += 1;
        }

        for (const b of proj.bullets) {
          drawBullet(b);
        }
        y += 3;
      }
    }

    /* ── Certifications ── */
    const cleanedCerts = (resume.certifications || []).map(cleanCert);
    if (cleanedCerts.length) {
      drawSectionHeader("Certifications");
      for (const cert of cleanedCerts) {
        drawBullet(cert);
      }
      y += 3;
    }

    /* ── Education ── */
    if (resume.education?.length) {
      drawSectionHeader("Education");
      for (const edu of resume.education) {
        const parts: string[] = [];
        if (edu.degree) parts.push(edu.degree);
        if (edu.institution) parts.push(edu.institution);
        if (edu.year) parts.push(edu.year);
        drawWrapped(parts.join("  —  "), ML, 10);
        y += 2;
      }
    }

    /* ── Save ── */
    doc.save("Calibrated_Resume.pdf");
    toast.success("PDF exported");
  } catch (err) {
    console.error("PDF export error:", err);
    toast.error("Failed to export PDF. Please try again.");
  }
}
