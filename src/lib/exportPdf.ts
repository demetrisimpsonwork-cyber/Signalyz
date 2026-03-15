import { pdf } from "@react-pdf/renderer";
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
    const doc = React.createElement(CalibratedResumePDF, { resume });
    const instance = pdf();
    instance.updateContainer(doc);
    const blob = await instance.toBlob();
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "Calibrated_Resume.pdf";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast.success("PDF exported");
  } catch (err) {
    console.error("PDF export error:", err);
    toast.error("Failed to export PDF. Please try again.");
  }
}
