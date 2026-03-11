import { useState, useRef } from "react";
import { Upload, Loader2, FileText, X } from "lucide-react";
import { toast } from "sonner";
import mammoth from "mammoth";
import { validateFileUpload } from "@/lib/sanitize";
import * as pdfjsLib from "pdfjs-dist";
import { reconstructPdfText } from "@/lib/pdfColumnParser";

// Use CDN worker to avoid build issues with pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export type ResumeInputSource = "paste" | "pdf" | "docx";

interface ResumeUploadProps {
  onTextExtracted: (text: string, source?: ResumeInputSource) => void;
  onClear?: () => void;
}

const ResumeUpload = ({ onTextExtracted, onClear }: ResumeUploadProps) => {
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

    const text = reconstructPdfText(pageData);
    if (!text || text.length < 10) {
      throw new Error("Could not extract meaningful text from this PDF. Try pasting your resume text directly.");
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

      onTextExtracted(text, ext === "docx" ? "docx" : "pdf");
      toast.success("Resume text extracted successfully.");
    } catch (err: any) {
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
            <button onClick={handleClear} className="p-0.5 hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResumeUpload;
