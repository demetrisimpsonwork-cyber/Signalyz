import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { toast } from "sonner";

export async function exportCalibratedPdf(canvasElementId: string = "resume-canvas") {
  const element = document.getElementById(canvasElementId);
  if (!element) {
    toast.error("Resume canvas not found.");
    return;
  }

  try {
    toast.info("Generating PDF...");
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#FFFFFF",
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const imgWidth = pageWidth - 20; // 10mm margins
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 10; // top margin

    // First page
    pdf.addImage(imgData, "PNG", 10, position, imgWidth, imgHeight);
    heightLeft -= pageHeight - 20;

    // Additional pages if needed
    while (heightLeft > 0) {
      position = -(pageHeight - 20 - 10) + 10;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 10, position, imgWidth, imgHeight);
      heightLeft -= pageHeight - 20;
    }

    pdf.save("Calibrated_Resume_Designed.pdf");
    toast.success("PDF exported");
  } catch (err) {
    console.error("PDF export error:", err);
    toast.error("Failed to export PDF. Please try again.");
  }
}
