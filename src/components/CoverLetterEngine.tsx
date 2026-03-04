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
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (!isPro) { onUpgrade(); return; }
    setExpanded(true);
    setLoading(true);
    setError(null);
    setLetter("");
    setStrategyNote("");
    try {
      if (!experience?.trim() || !jd?.trim()) {
        throw new Error("Missing resume or job description content.");
      }
      const { data, error: fnError } = await supabase.functions.invoke("generate-pro-content", {
        body: {
          type: "cover_letter",
          experience: experience.trim(),
          jd: jd.trim(),
          alignmentResult: alignmentResult || {},
          inferredRole: inferredRole || "",
          companyName: "",
        },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      if (!data?.letter) throw new Error("No letter content returned.");
      setLetter(data.letter || "");
      setStrategyNote(data.strategy_note || "");
    } catch (e: any) {
      const msg = e?.message || "Cover letter generation failed.";
      console.error("Cover letter generation error:", msg);
      setError(msg);
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
      {(letter || loading || error) && (
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground" style={{ letterSpacing: "0.15em" }}>Cover Letter Engine™</p>
      )}

      {loading ? (
        <div className="animate-pulse h-48 rounded-lg bg-muted" />
      ) : error ? (
        <div className="rounded-lg bg-[#0F1C2E] p-6 space-y-4">
          <p className="text-sm text-white leading-relaxed">
            Cover letter generation interrupted. This can happen with complex inputs — click retry to try again.
          </p>
          <Button onClick={generate} className="w-full gap-2">
            <RefreshCw className="h-4 w-4" /> Retry
          </Button>
        </div>
      ) : letter ? (
        <>
          <div className="relative rounded-lg border bg-card p-6">
            <button onClick={handleCopy} className="absolute top-3 right-3 p-1.5 rounded hover:bg-secondary transition-colors">
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
            </button>
            <div className="space-y-4 pr-8">
              {letter.split("\n\n").filter(Boolean).map((p, i) => (
                <p key={i} className="text-foreground leading-relaxed" style={{ fontSize: "16px" }}>{p}</p>
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
          <p className="text-xs text-muted-foreground text-center italic">Built from your signal — not a template. Zero fabrication.</p>
        </>
      ) : null}
    </div>
  );
};

export default CoverLetterEngine;
