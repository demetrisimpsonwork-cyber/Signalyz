import { pdf } from "@react-pdf/renderer";
import { saveAs } from "file-saver";
import { toast } from "sonner";
import React from "react";
import type { CalibratedResumeData } from "@/hooks/useResumeAssembly";
import CalibratedResumePDF from "@/components/CalibratedResumePDF";

/**
 * Export the calibrated resume as a PDF using @react-pdf/renderer.
 */
export async function exportCalibratedPdf(resume: CalibratedResumeData) {
  if (!resume) {
    toast.error("No resume data found. Please assemble your resume first.");
    return;
  }

  try {
    toast.info("Generating PDF...");
    const blob = await pdf(
      React.createElement(CalibratedResumePDF, { resume })
    ).toBlob();
    saveAs(blob, "Calibrated_Resume.pdf");
    toast.success("PDF exported");
  } catch (err) {
    console.error("PDF export error:", err);
    toast.error("Failed to export PDF. Please try again.");
  }
}
