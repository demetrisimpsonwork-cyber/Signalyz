import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle, FileText, Upload, ClipboardPaste, Loader2, Pencil } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import mammoth from "mammoth";

interface PdfFallbackStateProps {
  /** Called when user provides clean text (from DOCX or paste) */
  onCleanTextProvided: (text: string) => void;
  /** Called when user chooses to continue with edit mode on extracted data */
  onContinueWithEditMode: () => void;
}

export default function PdfFallbackState({
  onCleanTextProvided,
  onContinueWithEditMode,
}: PdfFallbackStateProps) {
  const [mode, setMode] = useState<"choose" | "paste" | "uploading">("choose");
  const [pastedText, setPastedText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDocxUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "docx") {
      toast.error("Please upload a .docx file.");
      return;
    }

    setMode("uploading");
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      const text = result.value.trim();
      if (!text || text.length < 20) {
        throw new Error("Could not extract meaningful text from this file.");
      }
      onCleanTextProvided(text);
      toast.success("DOCX text extracted — reassembling resume.");
    } catch (err: any) {
      toast.error(err.message || "Failed to extract text.");
      setMode("choose");
    }
  };

  const handlePasteSubmit = () => {
    if (pastedText.trim().length < 50) {
      toast.error("Please paste more resume content (at least 50 characters).");
      return;
    }
    onCleanTextProvided(pastedText.trim());
    toast.success("Resume text received — reassembling resume.");
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Status banner */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <div className="flex items-start gap-3">
          <CheckCircle className="h-5 w-5 shrink-0 mt-0.5 text-emerald-500" />
          <div className="space-y-1.5">
            <h3 className="text-sm font-semibold text-foreground">
              Signal analysis complete — calibrated resume assembly paused
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Your alignment score, gap analysis, and interview intelligence are ready in the Signal Report tab.
              However, the PDF's formatting made it difficult to extract reliable structure
              (name, job titles, company names, education) for an accurate Calibrated Resume.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Choose one of the options below so we can build your resume correctly:
            </p>
          </div>
        </div>
      </div>

      {/* Recovery options */}
      {mode === "choose" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <button
            onClick={() => inputRef.current?.click()}
            className="flex flex-col items-center gap-2.5 rounded-lg border border-border bg-card p-5 text-center transition-colors hover:bg-muted/50 hover:border-primary/30 cursor-pointer"
          >
            <Upload className="h-6 w-6 text-primary" />
            <span className="text-sm font-medium text-foreground">Upload DOCX</span>
            <span className="text-[11px] text-muted-foreground leading-snug">
              Best option — DOCX preserves structure accurately
            </span>
          </button>

          <button
            onClick={() => setMode("paste")}
            className="flex flex-col items-center gap-2.5 rounded-lg border border-border bg-card p-5 text-center transition-colors hover:bg-muted/50 hover:border-primary/30 cursor-pointer"
          >
            <ClipboardPaste className="h-6 w-6 text-primary" />
            <span className="text-sm font-medium text-foreground">Paste Resume Text</span>
            <span className="text-[11px] text-muted-foreground leading-snug">
              Copy-paste the full text from your resume file
            </span>
          </button>

          <button
            onClick={onContinueWithEditMode}
            className="flex flex-col items-center gap-2.5 rounded-lg border border-border bg-card p-5 text-center transition-colors hover:bg-muted/50 hover:border-primary/30 cursor-pointer"
          >
            <Pencil className="h-6 w-6 text-primary" />
            <span className="text-sm font-medium text-foreground">Review & Edit</span>
            <span className="text-[11px] text-muted-foreground leading-snug">
              Verify and correct the extracted fields manually
            </span>
          </button>

          <input
            ref={inputRef}
            type="file"
            accept=".docx"
            className="hidden"
            onChange={handleDocxUpload}
          />
        </div>
      )}

      {/* Paste mode */}
      {mode === "paste" && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Paste your full resume text</span>
          </div>
          <Textarea
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder="Paste your complete resume text here…"
            rows={8}
            className="text-xs"
          />
          <div className="flex gap-2">
            <Button onClick={handlePasteSubmit} size="sm" className="gap-1.5">
              <CheckCircle className="h-3.5 w-3.5" />
              Use This Text
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setMode("choose")}>
              Back
            </Button>
          </div>
        </div>
      )}

      {/* Uploading state */}
      {mode === "uploading" && (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed bg-card p-8">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Extracting text from DOCX…</span>
        </div>
      )}
    </div>
  );
}
