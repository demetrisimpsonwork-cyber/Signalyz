import { ClipboardCopy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ExportResultsProps {
  result: {
    optimized_bullet: string;
    match_score: number;
    alignment_confidence_level?: string;
    missing_keywords: string[];
    suggested_verbs: string[];
    alt_a: string;
    alt_b: string;
    alignment_notes?: string;
    gap_suggestions?: string | null;
  };
}

const buildExportText = (r: ExportResultsProps["result"]): string => {
  const lines: string[] = [
    "RESUMIX CALIBRATION REPORT",
    "=========================",
    "",
    "CALIBRATED BULLET",
    r.optimized_bullet,
    "",
    `MATCH SCORE: ${r.match_score}%${r.alignment_confidence_level ? ` — ${r.alignment_confidence_level}` : ""}`,
    "",
    "MISSING KEYWORDS",
    r.missing_keywords.length ? r.missing_keywords.join(", ") : "None",
    "",
    "SUGGESTED ACTION VERBS",
    r.suggested_verbs.length ? r.suggested_verbs.join(", ") : "None",
    "",
    "ALTERNATE A — Impact-focused",
    r.alt_a,
    "",
    "ALTERNATE B — Human-natural",
    r.alt_b,
  ];

  if (r.alignment_notes) {
    lines.push("", "ALIGNMENT NOTES", r.alignment_notes);
  }
  if (r.gap_suggestions) {
    lines.push("", "GAP SUGGESTIONS", r.gap_suggestions);
  }

  return lines.join("\n");
};

const ExportResults = ({ result }: ExportResultsProps) => {
  const handleCopyAll = async () => {
    await navigator.clipboard.writeText(buildExportText(result));
    toast.success("Calibration report copied to clipboard", { duration: 1500 });
  };

  return (
    <Button variant="outline" onClick={handleCopyAll} className="w-full gap-2 border-foreground/20 text-foreground">
      <ClipboardCopy className="h-3.5 w-3.5" />
      Copy Calibration Report
    </Button>
  );
};

export default ExportResults;
