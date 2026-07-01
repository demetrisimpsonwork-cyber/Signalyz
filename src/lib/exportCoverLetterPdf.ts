import jsPDF from "jspdf";
import { toast } from "sonner";

/* ── A4 constants (matching calibrated resume PDF conventions) ── */
const PAGE_W = 210;
const PAGE_H = 297;
const ML = 22;
const MR = 22;
const MT = 28;
const MB = 24;
const CONTENT_W = PAGE_W - ML - MR;

interface CoverLetterPdfInput {
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  date: string;
  addressee: string;
  salutation: string;
  bodyParagraphs: string[];
}

/**
 * Export a cover letter as a clean, professional PDF using jsPDF.
 * Matches the existing calibrated-resume PDF styling conventions.
 */
export function exportCoverLetterPdf(input: CoverLetterPdfInput) {
  try {
    toast.info("Generating PDF…");

    const doc = new jsPDF({ unit: "mm", format: "a4" });
    let y = MT;

    function ensureSpace(needed: number) {
      if (y + needed > PAGE_H - MB) {
        doc.addPage();
        y = MT;
      }
    }

    function drawText(
      text: string,
      fontSize: number,
      opts?: { bold?: boolean; color?: string; lineHeight?: number; maxWidth?: number },
    ): void {
      const { bold = false, color = "#1a1a2e", lineHeight = 1.45, maxWidth = CONTENT_W } = opts || {};
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(fontSize);
      doc.setTextColor(color);
      const lines = doc.splitTextToSize(text, maxWidth) as string[];
      const lh = (fontSize * lineHeight * 25.4) / 72;
      for (const line of lines) {
        ensureSpace(lh);
        doc.text(line, ML, y);
        y += lh;
      }
    }

    /* ── Header: name + contact ── */
    if (input.contactName) {
      drawText(input.contactName, 13, { bold: true });
    }
    const contactLine = [input.contactEmail, input.contactPhone].filter(Boolean).join("  |  ");
    if (contactLine) {
      drawText(contactLine, 9.5, { color: "#666666" });
    }

    y += 5;

    /* ── Date ── */
    drawText(input.date, 10, { color: "#555555" });
    y += 2;

    /* ── Addressee (optional) + salutation ── */
    if (input.addressee && input.addressee.trim()) {
      drawText(input.addressee, 10);
      y += 3;
    }
    drawText(input.salutation, 10);
    y += 4;

    /* ── Body paragraphs ── */
    for (let i = 0; i < input.bodyParagraphs.length; i++) {
      const para = input.bodyParagraphs[i];
      if (!para.trim()) continue;
      drawText(para, 10, { lineHeight: 1.5 });
      if (i < input.bodyParagraphs.length - 1) {
        y += 3;
      }
    }

    y += 6;

    /* ── Closing ── */
    drawText("Sincerely,", 10);
    y += 4;
    if (input.contactName) {
      drawText(input.contactName, 10, { bold: true });
    }

    /* ── Save ── */
    doc.save("Cover_Letter.pdf");
    toast.success("PDF exported");
  } catch (err) {
    console.error("Cover letter PDF export error:", err);
    toast.error("Failed to export PDF. Please try again.");
  }
}
