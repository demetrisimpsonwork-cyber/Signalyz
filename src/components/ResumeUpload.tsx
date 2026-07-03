import { useState, useRef } from "react";
import { Upload, Loader2, FileText, X, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import mammoth from "mammoth";
import { validateFileUpload } from "@/lib/sanitize";
import * as pdfjsLib from "pdfjs-dist";
import { reconstructPdfStructured } from "@/lib/pdfColumnParser";

// Use CDN worker to avoid build issues with pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export type ResumeInputSource = "paste" | "pdf" | "docx";

interface ResumeUploadProps {
  onTextExtracted: (text: string, source?: ResumeInputSource) => void;
  onClear?: () => void;
  onUploadStarted?: (fileType: ResumeInputSource) => void;
  onUploadFailed?: (errorCode: string, fileType: ResumeInputSource) => void;
}

const ResumeUpload = ({
  onTextExtracted,
  onClear,
  onUploadStarted,
  onUploadFailed,
}: ResumeUploadProps) => {
  const [extracting, setExtracting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const extractFromDocx = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value.trim();
  };

  const extractFromPdf = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pageData: { content: any; viewport: any }[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });
      pageData.push({ content, viewport });
    }

    const structured = reconstructPdfStructured(pageData);
    
    // Debug logging for layout detection
    console.log(`[PDF Parser] Layout: ${structured.layoutType}, Confidence: ${structured.confidence.toFixed(2)}, Sections: ${structured.sections.map(s => s.type).join(", ")}`);

    const text = structured.rawText || "";

    // ── Scanned / image-based PDF detection ──
    // Image-only PDFs yield little-to-no extractable text. Block these before
    // they reach the parser or any AI call, and steer the user to DOCX / paste.
    const SCANNED_PDF_MESSAGE =
      "This PDF looks image-based or could not be read reliably. Please upload a DOCX or copy/paste your resume for best results.";
    const numPages = pdf.numPages || 1;
    const meaningfulChars = text.replace(/\s/g, "").length;
    const avgCharsPerPage = meaningfulChars / numPages;
    const pageCharCounts = pageData.map((p) =>
      (p.content?.items || []).reduce(
        (n: number, it: any) => n + ((it.str || "").trim().length),
        0,
      ),
    );
    const blankPages = pageCharCounts.filter((c) => c < 20).length;

    const looksUnreadable =
      meaningfulChars < 150 ||
      avgCharsPerPage < 100 ||
      blankPages === numPages ||
      structured.confidence < 0.3;

    if (looksUnreadable) {
      console.warn(
        `[PDF Parser] Unreadable/scanned PDF blocked: chars=${meaningfulChars}, avgCharsPerPage=${avgCharsPerPage.toFixed(0)}, blankPages=${blankPages}/${numPages}, confidence=${structured.confidence.toFixed(2)}`,
      );
      throw new Error(SCANNED_PDF_MESSAGE);
    }

    return text;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateFileUpload(file);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    const fileType: ResumeInputSource = ext === "docx" ? "docx" : "pdf";

    onUploadStarted?.(fileType);
    setExtracting(true);
    setFileName(file.name);

    try {
      let text = "";
      if (ext === "docx") {
        text = await extractFromDocx(file);
      } else {
        text = await extractFromPdf(file);
      }

      if (!text || text.length < 10) {
        throw new Error("Could not extract meaningful text from this file.");
      }

      onTextExtracted(text, fileType);
      toast.success("Resume text extracted successfully.");
    } catch (err: any) {
      const errorCode =
        err?.message?.includes("image-based") ? "SCANNED_PDF" : "PARSE_FAILED";
      onUploadFailed?.(errorCode, fileType);
      toast.error(err.message || "Failed to extract text from file.");
      setFileName(null);
    } finally {
      setExtracting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleClear = () => {
    setFileName(null);
    if (inputRef.current) inputRef.current.value = "";
    onClear?.();
  };

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">Or upload your resume</p>
      <div className="flex items-center gap-2">
        <label
          className={`inline-flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground cursor-pointer transition-colors hover:bg-muted/50 ${
            extracting ? "pointer-events-none opacity-60" : ""
          }`}
        >
          {extracting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          {extracting ? "Extracting text…" : "Upload PDF or DOCX"}
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx"
            className="hidden"
            onChange={handleFileChange}
            disabled={extracting}
          />
        </label>
        {fileName && !extracting && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileText className="h-3 w-3" />
            <span className="max-w-[140px] truncate">{fileName}</span>
            <button onClick={handleClear} className="p-0.5 hover:text-foreground" aria-label="Remove uploaded file">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground/80">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-px text-primary/70" />
        <span>Encrypted in transit. We never sell your data or use your resume to train AI models.</span>
      </p>
    </div>
  );
};

export default ResumeUpload;
