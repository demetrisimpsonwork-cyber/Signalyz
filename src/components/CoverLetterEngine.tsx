import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, RefreshCw, Download, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { saveAs } from "file-saver";

interface CoverLetterEngineProps {
  experience: string;
  jd: string;
  alignmentResult: Record<string, unknown>;
  inferredRole: string;
  isPro: boolean;
  onUpgrade: () => void;
}

const CoverLetterEngine = ({ experience, jd, alignmentResult, inferredRole, isPro, onUpgrade }: CoverLetterEngineProps) => {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [letter, setLetter] = useState("");
  const [strategyNote, setStrategyNote] = useState("");
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    if (!isPro) { onUpgrade(); return; }
    setExpanded(true);
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-pro-content", {
        body: {
          type: "cover_letter",
          experience,
          jd,
          alignmentResult,
          inferredRole,
          companyName: "",
        },
      });
      if (error) throw error;
      setLetter(data.letter || "");
      setStrategyNote(data.strategy_note || "");
    } catch {
      toast.error("Failed to generate cover letter.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(letter);
    setCopied(true);
    toast.success("Copied to clipboard", { duration: 1500 });
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownloadDocx = async () => {
    const paragraphs = letter.split("\n\n").filter(Boolean).map(
      (p) => new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: p, size: 24, font: "Calibri" })] })
    );
    const doc = new Document({ sections: [{ children: paragraphs }] });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, "Cover_Letter.docx");
    toast.success("DOCX downloaded");
  };

  if (!expanded) {
    return (
      <Button variant="secondary" onClick={generate} className="w-full gap-2">
        <Sparkles className="h-4 w-4" />
        Generate Signal-Calibrated Cover Letter
        {!isPro && <span className="ml-1 text-[10px] uppercase tracking-wider text-primary font-semibold">Pro</span>}
      </Button>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground" style={{ letterSpacing: "0.15em" }}>Cover Letter Engine™</p>

      {loading ? (
        <div className="animate-pulse h-48 rounded-lg bg-muted" />
      ) : letter ? (
        <>
          <div className="relative rounded-lg border bg-card p-6">
            <button onClick={handleCopy} className="absolute top-3 right-3 p-1.5 rounded hover:bg-secondary transition-colors">
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
            </button>
            <div className="space-y-4 pr-8">
              {letter.split("\n\n").filter(Boolean).map((p, i) => (
                <p key={i} className="text-sm text-foreground leading-relaxed">{p}</p>
              ))}
            </div>
          </div>
          {strategyNote && (
            <p className="text-xs text-muted-foreground italic">{strategyNote}</p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={generate} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Regenerate
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadDocx} className="gap-1.5">
              <Download className="h-3.5 w-3.5" /> Download DOCX
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center">Built from your signal — not a template. Zero fabrication.</p>
        </>
      ) : null}
    </div>
  );
};

export default CoverLetterEngine;
