import { useState, useRef } from "react";
import { Upload, Loader2, FileText, X } from "lucide-react";
import { toast } from "sonner";
import mammoth from "mammoth";
import { validateFileUpload } from "@/lib/sanitize";

interface ResumeUploadProps {
  onTextExtracted: (text: string) => void;
}

const ResumeUpload = ({ onTextExtracted }: ResumeUploadProps) => {
  const [extracting, setExtracting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const extractFromDocx = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value.trim();
  };

  const extractFromPdf = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = (e.target?.result as string) || "";
        if (!text || text.length < 10) {
          reject(new Error("Could not extract meaningful text from this PDF."));
          return;
        }
        resolve(text.trim());
      };
      reader.onerror = () => reject(new Error("Failed to read PDF file."));
      reader.readAsText(file);
    });
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
        toast.info("PDF text extracted. If formatting looks off, paste your resume text directly for best results.");
      }

      if (!text || text.length < 10) {
        throw new Error("Could not extract meaningful text from this file.");
      }

      onTextExtracted(text);
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
