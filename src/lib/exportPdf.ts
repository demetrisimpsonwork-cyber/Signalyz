import jsPDF from "jspdf";
import { toast } from "sonner";
import type { CalibratedResumeData } from "@/hooks/useResumeAssembly";

/**
 * Export the calibrated resume as a clean, formatted PDF document
 * built directly from structured data (mirrors DOCX layout).
 */
export async function exportCalibratedPdf(resume: CalibratedResumeData) {
  if (!resume) {
    toast.error("No resume data found. Please assemble your resume first.");
    return;
  }

  try {
    toast.info("Generating PDF...");
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const marginLeft = 15;
    const marginRight = 15;
    const contentWidth = pageWidth - marginLeft - marginRight;
    let y = 18;

    const bottomMargin = 20;
    const checkPageBreak = (needed: number) => {
      if (y + needed > pageHeight - bottomMargin) {
        pdf.addPage();
        y = 15;
      }
    };

    // ─── Header ───
    pdf.setFont("times", "bold");
    pdf.setFontSize(20);
    pdf.setTextColor(26, 26, 46);
    const name = resume.header.name || "Name";
    pdf.text(name, pageWidth / 2, y, { align: "center" });
    y += 7;

    if (resume.header.title) {
      pdf.setFont("times", "normal");
      pdf.setFontSize(11);
      pdf.setTextColor(75, 85, 99);
      pdf.text(resume.header.title, pageWidth / 2, y, { align: "center" });
      y += 5;
    }

    const contactParts = [
      resume.header.location,
      resume.header.email,
      resume.header.phone,
      resume.header.linkedin,
    ].filter(Boolean);
    if (contactParts.length) {
      pdf.setFontSize(9);
      pdf.setTextColor(107, 114, 128);
      pdf.text(contactParts.join("  |  "), pageWidth / 2, y, { align: "center" });
      y += 4;
    }

    // HR line
    y += 2;
    pdf.setDrawColor(209, 213, 219);
    pdf.setLineWidth(0.3);
    pdf.line(marginLeft, y, pageWidth - marginRight, y);
    y += 6;

    // ─── Section header helper ───
    const drawSectionHeader = (title: string) => {
      checkPageBreak(10);
      pdf.setFont("times", "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(55, 65, 81);
      pdf.text(title.toUpperCase(), marginLeft, y);
      y += 1.5;
      pdf.setDrawColor(55, 65, 81);
      pdf.setLineWidth(0.2);
      pdf.line(marginLeft, y, pageWidth - marginRight, y);
      y += 5;
    };

    // ─── Wrapped text helper ───
    const drawWrappedText = (
      text: string,
      fontSize: number,
      fontStyle: string = "normal",
      indent: number = 0,
      color: number[] = [26, 26, 46]
    ) => {
      pdf.setFont("times", fontStyle);
      pdf.setFontSize(fontSize);
      pdf.setTextColor(color[0], color[1], color[2]);
      const lines = pdf.splitTextToSize(text, contentWidth - indent);
      for (const line of lines) {
        checkPageBreak(5);
        pdf.text(line, marginLeft + indent, y);
        y += fontSize * 0.45;
      }
    };

    // ─── Professional Summary ───
    if (resume.summary) {
      drawSectionHeader("Professional Summary");
      drawWrappedText(resume.summary, 10);
      y += 3;
    }

    // ─── Core Competencies ───
    const competencies = [
      ...(resume.core_competencies || []),
      ...(resume.skills || []),
    ].filter((v, i, a) => a.indexOf(v) === i);
    if (competencies.length) {
      drawSectionHeader("Core Competencies");
      drawWrappedText(competencies.join("  •  "), 9.5);
      y += 3;
    }

    // ─── Experience ───
    if (resume.experience.length) {
      drawSectionHeader("Professional Experience");
      for (const exp of resume.experience) {
        checkPageBreak(14);
        // Title (italic) + dates
        pdf.setFont("times", "italic");
        pdf.setFontSize(10.5);
        pdf.setTextColor(26, 26, 46);
        pdf.text(exp.title || "", marginLeft, y);
        if (exp.dates) {
          pdf.setFont("times", "normal");
          pdf.setFontSize(9);
          pdf.setTextColor(107, 114, 128);
          pdf.text(exp.dates, pageWidth - marginRight, y, { align: "right" });
        }
        y += 4.5;

        // Company (bold)
        if (exp.company) {
          pdf.setFont("times", "bold");
          pdf.setFontSize(10);
          pdf.setTextColor(55, 65, 81);
          pdf.text(exp.company, marginLeft, y);
          y += 4.5;
        }

        // Bullets
        for (const bullet of exp.bullets) {
          checkPageBreak(6);
          pdf.setFont("times", "normal");
          pdf.setFontSize(9.5);
          pdf.setTextColor(26, 26, 46);
          pdf.text("•", marginLeft + 2, y);
          const bulletLines = pdf.splitTextToSize(bullet, contentWidth - 8);
          for (let li = 0; li < bulletLines.length; li++) {
            if (li > 0) checkPageBreak(4.5);
            pdf.text(bulletLines[li], marginLeft + 6, y);
            y += 4;
          }
        }
        y += 2;
      }
    }

    // ─── Independent Projects ───
    if (resume.independent_projects?.length) {
      if (y > 230) {
        pdf.addPage();
        y = 20;
      }

      pdf.setFont("times", "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(55, 65, 81);
      pdf.text("INDEPENDENT PROJECTS", marginLeft, y);
      y += 1.5;
      pdf.setDrawColor(55, 65, 81);
      pdf.setLineWidth(0.2);
      pdf.line(marginLeft, y, pageWidth - marginRight, y);
      y += 5;

      const projectTitleFontSize = 10.5;
      const projectBodyFontSize = 9.5;
      const projectLineHeight = 4.2;
      const projectBulletIndent = 8;
      const sectionBottom = pageHeight - 20;

      for (const proj of resume.independent_projects) {
        const hasDescription = Boolean(proj.description?.trim());
        if (y + projectLineHeight * (hasDescription ? 2 : 1) > sectionBottom) {
          pdf.addPage();
          y = 20;
        }

        pdf.setFont("times", "bold");
        pdf.setFontSize(projectTitleFontSize);
        pdf.setTextColor(26, 26, 46);
        pdf.text(proj.name, marginLeft, y);

        if (hasDescription) {
          const renderedNameWidth = pdf.getTextWidth(proj.name);
          const firstLineWidth = Math.max(12, contentWidth - renderedNameWidth - 2);

          pdf.setFont("times", "normal");
          pdf.setFontSize(projectBodyFontSize);
          pdf.setTextColor(107, 114, 128);

          const fullDescription = `— ${proj.description?.trim()}`;
          const descLines = pdf.splitTextToSize(fullDescription, firstLineWidth);

          for (let di = 0; di < descLines.length; di++) {
            if (y + projectLineHeight > sectionBottom) {
              pdf.addPage();
              y = 20;
              if (di === 0) {
                pdf.setFont("times", "bold");
                pdf.setFontSize(projectTitleFontSize);
                pdf.setTextColor(26, 26, 46);
                pdf.text(proj.name, marginLeft, y);
                pdf.setFont("times", "normal");
                pdf.setFontSize(projectBodyFontSize);
                pdf.setTextColor(107, 114, 128);
              }
            }

            const isFirstLine = di === 0;
            const lineX = isFirstLine ? marginLeft + renderedNameWidth + 2 : marginLeft + 2;
            const lineText = isFirstLine ? ` ${descLines[di]}` : descLines[di];
            pdf.text(lineText, lineX, y);
            y += projectLineHeight;
          }
        } else {
          y += projectLineHeight;
        }

        for (const bullet of proj.bullets) {
          const bulletLines = pdf.splitTextToSize(bullet, contentWidth - projectBulletIndent);

          for (let bi = 0; bi < bulletLines.length; bi++) {
            if (y + projectLineHeight > sectionBottom) {
              pdf.addPage();
              y = 20;
            }

            pdf.setFont("times", "normal");
            pdf.setFontSize(projectBodyFontSize);
            pdf.setTextColor(26, 26, 46);

            if (bi === 0) {
              pdf.text("•", marginLeft + 2, y);
            }

            pdf.text(bulletLines[bi], marginLeft + 6, y);
            y += projectLineHeight;
          }

          y += 2;
        }

        y += 2;
      }
    }

    // ─── Certifications ───
    const cleanedCertifications = (resume.certifications || []).map((cert) => {
      return cert
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/https?:\/\/\S+/gi, "")
        .replace(/www\.\S+/gi, "")
        .replace(/<a[^>]*>(.*?)<\/a>/gi, "$1")
        .replace(/\s{2,}/g, " ")
        .trim();
    });
    if (cleanedCertifications.length) {
      drawSectionHeader("Certifications");
      for (const cert of cleanedCertifications) {
        checkPageBreak(5);
        pdf.setFont("times", "normal");
        pdf.setFontSize(9.5);
        pdf.setTextColor(26, 26, 46);
        pdf.text("•", marginLeft + 2, y);
        const certLines = pdf.splitTextToSize(cert, contentWidth - 8);
        for (let li = 0; li < certLines.length; li++) {
          if (li > 0) checkPageBreak(4.5);
          pdf.text(certLines[li], marginLeft + 6, y);
          y += 4;
        }
      }
      y += 2;
    }

    // ─── Education ───
    if (resume.education?.length) {
      drawSectionHeader("Education");
      for (const edu of resume.education) {
        checkPageBreak(5);
        const eduText = [edu.degree, edu.institution, edu.year].filter(Boolean).join(" — ");
        drawWrappedText(eduText, 9.5);
        y += 1;
      }
    }

    pdf.save("Calibrated_Resume.pdf");
    toast.success("PDF exported");
  } catch (err) {
    console.error("PDF export error:", err);
    toast.error("Failed to export PDF. Please try again.");
  }
}
