import { Copy, Check, Info } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface ScoringBreakdown {
  role_outcomes_alignment: number;
  tools_and_workflow_alignment: number;
  domain_and_context_alignment: number;
  context_and_scale_alignment: number;
  communication_and_leadership_alignment: number;
}

interface MatchScoreCardProps {
  score: number;
  confidenceLevel?: string;
  topMatchedSignal?: string;
  topMissingSignal?: string;
  scoreRationale?: string[];
  scoringBreakdown?: ScoringBreakdown;
}

const getScoreConfig = (score: number) => {
  if (score >= 80) return { label: "Above Threshold", accent: "text-green-700", bg: "bg-green-50 dark:bg-green-950/30", border: "border-green-200 dark:border-green-800" };
  if (score >= 70) return { label: "At Threshold", accent: "text-amber-500", bg: "bg-amber-50/70 dark:bg-amber-950/20", border: "border-amber-200 dark:border-amber-800" };
  if (score >= 55) return { label: "Approaching Threshold", accent: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-950/20", border: "border-orange-200 dark:border-orange-800" };
  return { label: "Below Threshold", accent: "text-red-500", bg: "bg-red-50 dark:bg-red-950/30", border: "border-red-200 dark:border-red-800" };
};

const MatchScoreCard = ({ score, confidenceLevel, topMatchedSignal, topMissingSignal, scoreRationale, scoringBreakdown }: MatchScoreCardProps) => {
  const [copied, setCopied] = useState(false);
  const config = getScoreConfig(score);

  const breakdown = scoringBreakdown || {
    role_outcomes_alignment: score,
    tools_and_workflow_alignment: score,
    domain_and_context_alignment: score,
    context_and_scale_alignment: score,
    communication_and_leadership_alignment: score,
  };

  const handleCopy = async () => {
    const text = `Match Score: ${score}% — ${confidenceLevel || config.label}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={`rounded-lg border p-4 ${config.bg} ${config.border}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Match Score</h3>
        <button
          onClick={handleCopy}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Copy Match Score"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex items-baseline gap-2 group cursor-pointer">
              <span className={`text-2xl font-bold tracking-tight ${config.accent}`}>
                {score}%
              </span>
              <Info className="h-3.5 w-3.5 text-muted-foreground opacity-60 group-hover:opacity-100 transition-opacity self-center" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 text-sm space-y-4" side="bottom" align="start">
            <p className="font-semibold text-foreground">What this score means</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Signal Diagnosis measures how clearly your current experience aligns with the target role as written.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              It does not judge your ability or invent qualifications. A lower score simply means the signal from your resume is not landing clearly yet with hiring systems and managers.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Signalyz analyzes where that signal breaks and shows how to reposition your real experience so it reads the way it was meant to be understood.
            </p>
            <div className="border-t pt-3">
              <p className="text-xs font-medium text-foreground mb-2">Score Breakdown</p>
              <div className="space-y-2">
                {[
                  { label: "Role & Outcomes", value: breakdown.role_outcomes_alignment },
                  { label: "Tools & Workflow", value: breakdown.tools_and_workflow_alignment },
                  { label: "Domain & Context", value: breakdown.domain_and_context_alignment },
                  { label: "Context & Scale", value: breakdown.context_and_scale_alignment },
                  { label: "Communication & Leadership", value: breakdown.communication_and_leadership_alignment },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                    <span className="text-xs font-medium text-foreground">{item.value}%</span>
                  </div>
                ))}
              </div>
            </div>
            {topMatchedSignal && (
              <div>
                <p className="text-xs font-medium text-foreground">✓ Matched Signal</p>
                <p className="text-xs text-muted-foreground mt-0.5">{topMatchedSignal}</p>
              </div>
            )}
            {topMissingSignal && (
              <div>
                <p className="text-xs font-medium text-foreground">✗ Under-Signaled Priority</p>
                <p className="text-xs text-muted-foreground mt-0.5">{topMissingSignal}</p>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>

      <p className={`mt-1 text-xs font-medium ${config.accent}`}>
        {confidenceLevel || config.label}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">Weighted employer priority alignment</p>
    </div>
  );
};

export default MatchScoreCard;
