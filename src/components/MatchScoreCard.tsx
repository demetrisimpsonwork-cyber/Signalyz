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
  if (score >= 70) return { label: "Interview Range", accent: "text-green-700", bg: "bg-green-50 dark:bg-green-950/30", border: "border-green-200 dark:border-green-800" };
  if (score >= 60) return { label: "Strong", accent: "text-amber-500", bg: "bg-amber-50/70 dark:bg-amber-950/20", border: "border-amber-200 dark:border-amber-800" };
  if (score >= 40) return { label: "Moderate", accent: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-950/20", border: "border-orange-200 dark:border-orange-800" };
  return { label: "Low Signal", accent: "text-red-500", bg: "bg-red-50 dark:bg-red-950/30", border: "border-red-200 dark:border-red-800" };
};

/** Display the actual 5 deterministic scoring dimensions with real weights */
function toRealBreakdown(b: ScoringBreakdown) {
  return [
    { label: "Role Outcomes Alignment", value: b.role_outcomes_alignment, weight: "30%" },
    { label: "Tools & Workflow Alignment", value: b.tools_and_workflow_alignment, weight: "20%" },
    { label: "Domain & Context Alignment", value: b.domain_and_context_alignment, weight: "20%" },
    { label: "Context & Scale Alignment", value: b.context_and_scale_alignment, weight: "15%" },
    { label: "Communication & Leadership", value: b.communication_and_leadership_alignment, weight: "15%" },
  ];
}

const MatchScoreCard = ({ score, confidenceLevel, topMatchedSignal, topMissingSignal, scoreRationale, scoringBreakdown }: MatchScoreCardProps) => {
  const [copied, setCopied] = useState(false);
  const config = getScoreConfig(score);

  const hasRealBreakdown = !!scoringBreakdown;

  const handleCopy = async () => {
    const text = `Match Score: ${score}% — ${config.label}`;
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
              It does not judge your ability or invent qualifications. A lower score means the signal from your resume is not landing clearly yet with hiring systems and managers.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Signalyz analyzes where that signal breaks and shows how to reposition your real experience so it reads the way it was meant to be understood.
            </p>
            {hasRealBreakdown ? (
              <div className="border-t pt-3">
                <p className="text-xs font-medium text-foreground mb-2">Score Components</p>
                <div className="space-y-2">
                  {toRealBreakdown(scoringBreakdown!).map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{item.label} <span className="text-muted-foreground/50">({item.weight})</span></span>
                      <span className="text-xs font-medium text-foreground">{item.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground italic">Component breakdown unavailable for this run.</p>
              </div>
            )}
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
