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
const ML = 18;      // left margin
const MR = 18;
const MT = 22;       // top margin
const MB = 18;       // bottom margin
const CONTENT_W = PAGE_W - ML - MR;

/**
 * Export the calibrated resume as a well-formatted PDF using jsPDF.
 * Mirrors the DOCX export's structure & hierarchy.
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
      options?: { bold?: boolean; italic?: boolean; color?: string; align?: "left" | "center"; maxWidth?: number; lineHeight?: number },
    ): number {
      const { bold = false, italic = false, color = "#1a1a2e", align = "left", maxWidth = CONTENT_W, lineHeight = 1.35 } = options || {};
      const style = bold && italic ? "bolditalic" : bold ? "bold" : italic ? "italic" : "normal";
      doc.setFont("helvetica", style);
      doc.setFontSize(fontSize);
      doc.setTextColor(color);
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
      return y;
    }

    function drawSectionHeader(title: string) {
      ensureSpace(10);
      y += 4;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor("#374151");
      doc.text(title.toUpperCase(), ML, y);
      y += 1.5;
      doc.setDrawColor("#999999");
      doc.setLineWidth(0.15);
      doc.line(ML, y, PAGE_W - MR, y);
      y += 4;
    }

    function drawBullet(text: string) {
      const bulletIndent = ML + 3;
      const textIndent = ML + 7;
      const bulletMaxW = CONTENT_W - 7;
      const fontSize = 10;
      const lh = (fontSize * 1.32 * 25.4) / 72;
      const lines = doc.splitTextToSize(text, bulletMaxW) as string[];

      // Check if entire bullet fits; if not, page break first
      const totalH = lines.length * lh;
      ensureSpace(totalH + 1);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(fontSize);
      doc.setTextColor("#1a1a2e");
      doc.text("•", bulletIndent, y);
      for (const line of lines) {
        doc.text(line, textIndent, y);
        y += lh;
      }
    }

    /* ── Header ── */
    drawWrapped(resume.header.name || "Name", ML, 14, { bold: true, align: "center" });
    if (resume.header.title) {
      drawWrapped(resume.header.title, ML, 11, { align: "center", color: "#555555" });
    }
    const contactParts = [resume.header.location, resume.header.email, resume.header.phone, resume.header.linkedin].filter(Boolean);
    if (contactParts.length) {
      drawWrapped(contactParts.join("  |  "), ML, 9.5, { align: "center", color: "#666666" });
    }
    // HR
    y += 1;
    doc.setDrawColor("#CCCCCC");
    doc.setLineWidth(0.15);
    doc.line(ML, y, PAGE_W - MR, y);
    y += 4;

    /* ── Professional Summary ── */
    if (resume.summary) {
      drawSectionHeader("Professional Summary");
      drawWrapped(resume.summary, ML, 10, { lineHeight: 1.38 });
      y += 2;
    }

    /* ── Core Competencies ── */
    const competencies = [...(resume.core_competencies || []), ...(resume.skills || [])].filter((v, i, a) => a.indexOf(v) === i);
    if (competencies.length) {
      drawSectionHeader("Core Competencies");
      drawWrapped(competencies.join("  •  "), ML, 10);
      y += 2;
    }

    /* ── Professional Experience ── */
    if (resume.experience.length) {
      drawSectionHeader("Experience");
      for (const exp of resume.experience) {
        // Estimate total height for the entire role block (title + company + all bullets)
        // so it stays together on one page
        const bulletLines = exp.bullets.reduce((sum, b) => {
          const lines = doc.splitTextToSize(b, CONTENT_W - 7) as string[];
          return sum + lines.length;
        }, 0);
        const roleBlockH = 4.5 + (exp.company ? 4 : 0) + bulletLines * ((10 * 1.32 * 25.4) / 72) + 2;
        ensureSpace(Math.min(roleBlockH, PAGE_H - MT - MB)); // cap at page height for very long blocks
        // Title + dates
        doc.setFont("helvetica", "italic");
        doc.setFontSize(10.5);
        doc.setTextColor("#1a1a2e");
        const titleText = exp.title || "";
        doc.text(titleText, ML, y);
        if (exp.dates) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9.5);
          doc.setTextColor("#666666");
          doc.text(exp.dates, PAGE_W - MR, y, { align: "right" });
        }
        y += 4.5;
        // Company
        if (exp.company) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10.5);
          doc.setTextColor("#374151");
          doc.text(exp.company, ML, y);
          y += 4;
        }
        // Bullets
        for (const b of exp.bullets) {
          drawBullet(b);
        }
        y += 2;
      }
    }

    /* ── Independent Projects (explicit page-break handling) ── */
    if (resume.independent_projects?.length) {
      // Estimate minimum space: header + first project name + one bullet ≈ 20 mm
      // If not enough room, start a new page so the section isn't truncated
      ensureSpace(24);
      drawSectionHeader("Independent Projects");
      for (const proj of resume.independent_projects) {
        // Ensure project name + at least first bullet fit together
        ensureSpace(16);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        doc.setTextColor("#1a1a2e");
        doc.text(proj.name, ML, y);
        y += 4;
        if (proj.description?.trim()) {
          drawWrapped(`— ${proj.description.trim()}`, ML, 10, { color: "#666666" });
        }
        for (const b of proj.bullets) {
          drawBullet(b);
        }
        y += 2;
      }
    }

    /* ── Certifications ── */
    const cleanedCerts = (resume.certifications || []).map(cleanCert);
    if (cleanedCerts.length) {
      drawSectionHeader("Certifications");
      for (const cert of cleanedCerts) {
        drawBullet(cert);
      }
      y += 2;
    }

    /* ── Education ── */
    if (resume.education?.length) {
      drawSectionHeader("Education");
      for (const edu of resume.education) {
        const line = [edu.degree, edu.institution, edu.year].filter(Boolean).join(" — ");
        drawWrapped(line, ML, 10);
        y += 1;
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
