import { ClipboardCopy, Download } from "lucide-react";
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
    "RESUMIX ALIGNMENT RESULTS",
    "=========================",
    "",
    "OPTIMIZED BULLET",
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
    lines.push("", "PINNACLE ALIGNMENT NOTES", r.alignment_notes);
  }
  if (r.gap_suggestions) {
    lines.push("", "GAP SUGGESTIONS", r.gap_suggestions);
  }

  return lines.join("\n");
};

const ExportResults = ({ result }: ExportResultsProps) => {
  const handleCopyAll = async () => {
    await navigator.clipboard.writeText(buildExportText(result));
    toast.success("All results copied to clipboard", { duration: 1500 });
  };

  const handleDownload = () => {
    const text = buildExportText(result);
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "resumix-results.txt";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Download started", { duration: 1500 });
  };

  return (
    <div className="flex items-center gap-3 pt-2">
      <Button variant="outline" size="sm" onClick={handleCopyAll} className="gap-2">
        <ClipboardCopy className="h-3.5 w-3.5" />
        Copy All
      </Button>
      <Button variant="outline" size="sm" onClick={handleDownload} className="gap-2">
        <Download className="h-3.5 w-3.5" />
        Download .txt
      </Button>
    </div>
  );
};

export default ExportResults;
