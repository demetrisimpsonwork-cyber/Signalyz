import { ClipboardCopy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { SignalModel } from "@/types/SignalModel";

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
    top_missing_signal?: string;
    score_rationale?: string[];
    signal_model?: SignalModel;
  };
}

const getStrengthLabel = (score: number): string => {
  if (score >= 85) return "Strong Alignment";
  if (score >= 70) return "Solid Alignment";
  if (score >= 55) return "Moderate Alignment";
  if (score >= 40) return "Weak Alignment";
  return "Critical Misalignment";
};

const buildExportText = (r: ExportResultsProps["result"]): string => {
  const sm = r.signal_model;
  const score = r.match_score;
  const label = r.alignment_confidence_level || getStrengthLabel(score);

  // Classify score_rationale into strengths and gaps
  const strengths: string[] = [];
  const gaps: string[] = [];
  if (r.score_rationale?.length) {
    for (const item of r.score_rationale) {
      const cleaned = item.replace(/^\[(STRENGTH|GAP)\]\s*/i, "");
      if (/^\[STRENGTH\]/i.test(item)) {
        strengths.push(cleaned);
      } else if (/^\[GAP\]/i.test(item)) {
        gaps.push(cleaned);
      } else if (/miss|lack|gap|absent|weak|no evidence|under/i.test(item)) {
        gaps.push(cleaned);
      } else {
        strengths.push(cleaned);
      }
    }
  }
  // Fallback strengths from signal_model
  if (strengths.length === 0 && sm?.strengths?.length) {
    strengths.push(...sm.strengths);
  }
  // Fallback gaps from signal_model
  if (gaps.length === 0 && sm?.gaps?.length) {
    gaps.push(...sm.gaps);
  }

  const primaryBlocker = sm?.interview_gap_diagnosis?.primary_blocker || sm?.interview_gap_diagnosis?.primary_issue || sm?.gaps?.[0] || r.top_missing_signal || gaps[0] || "None identified";
  const primaryStrength = sm?.executive_insight_summary?.primary_strength || strengths[0] || "None identified";
  const repositioning = sm?.executive_insight_summary?.strategic_repositioning_opportunity || r.alignment_notes || "None identified";

  // Strategic fixes from interview_gap_diagnosis or gap_suggestions
  const strategicFixes: string[] = sm?.interview_gap_diagnosis?.strategic_fixes || [];
  if (strategicFixes.length === 0 && r.gap_suggestions) {
    r.gap_suggestions.split(/\n|;/).map(s => s.trim()).filter(s => s.length > 10).slice(0, 3).forEach(s => strategicFixes.push(s));
  }

  // Predicted signal improvement
  let predicted = "";
  if (sm?.predicted_signal_lift) {
    predicted = `Current: ${sm.predicted_signal_lift.current_score}% → Predicted: ${sm.predicted_signal_lift.predicted_score}%`;
  } else if (sm?.interview_gap_diagnosis) {
    predicted = `Current: ${sm.interview_gap_diagnosis.current_score}% → Predicted: ${sm.interview_gap_diagnosis.predicted_score}%`;
  }

  const lines: string[] = [
    `SIGNAL DIAGNOSIS: ${score}% — ${label}`,
    "",
    "TOP GAP",
    topGap,
    "",
    "PRIMARY STRENGTH",
    primaryStrength,
    "",
    "REPOSITIONING OPPORTUNITY",
    repositioning,
    "",
    "WHAT'S LANDING",
    ...(strengths.length > 0 ? strengths.map(s => `- ${s}`) : ["- None identified"]),
    "",
    "SCREEN-OUT RISKS",
    ...(gaps.length > 0 ? gaps.map(g => `- ${g}`) : ["- None identified"]),
    "",
    "THREE STRATEGIC FIXES",
    ...(strategicFixes.length > 0
      ? strategicFixes.slice(0, 3).map((f, i) => `${i + 1}. ${f}`)
      : ["1. No strategic fixes generated"]),
    "",
    "PREDICTED SIGNAL IMPROVEMENT",
    predicted || "Not available for this analysis",
  ];

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
