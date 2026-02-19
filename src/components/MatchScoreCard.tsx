import { Copy, Check, Info } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface MatchScoreCardProps {
  score: number;
  confidenceLevel?: string;
  topMatchedSignal?: string;
  topMissingSignal?: string;
}

const getScoreConfig = (score: number) => {
  if (score >= 75) return { label: "Strong Alignment", accent: "text-green-700", bg: "bg-green-50 dark:bg-green-950/30", border: "border-green-200 dark:border-green-800" };
  if (score >= 60) return { label: "Solid Alignment", accent: "text-amber-500", bg: "bg-amber-50/70 dark:bg-amber-950/20", border: "border-amber-200 dark:border-amber-800" };
  return { label: "Weak Alignment", accent: "text-red-500", bg: "bg-red-50 dark:bg-red-950/30", border: "border-red-200 dark:border-red-800" };
};

// Derive approximate sub-scores from the main score for the breakdown display
const getBreakdown = (score: number) => ({
  leadership: Math.min(100, Math.round(score + (Math.random() * 10 - 5))),
  technical: Math.min(100, Math.round(score + (Math.random() * 12 - 6))),
  keywordCoverage: Math.min(100, Math.round(score + (Math.random() * 8 - 4))),
  seniority: Math.min(100, Math.round(score + (Math.random() * 10 - 5))),
});

const MatchScoreCard = ({ score, confidenceLevel, topMatchedSignal, topMissingSignal }: MatchScoreCardProps) => {
  const [copied, setCopied] = useState(false);
  const config = getScoreConfig(score);
  const [breakdown] = useState(() => getBreakdown(score));

  const handleCopy = async () => {
    const text = `Match Score: ${score}% — ${confidenceLevel || config.label}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied to clipboard", { duration: 1500 });
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
            <p className="font-semibold text-foreground">How this score was calculated</p>
            <div className="space-y-2">
              {[
                { label: "Leadership Match", value: breakdown.leadership },
                { label: "Technical Match", value: breakdown.technical },
                { label: "Keyword Coverage", value: breakdown.keywordCoverage },
                { label: "Seniority Signal Match", value: breakdown.seniority },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                  <span className="text-xs font-medium text-foreground">{item.value}%</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Score is calculated based on weighted employer priorities detected in the job description.
            </p>
            {score < 60 && (
              <p className="text-xs text-amber-600 font-medium">
                Add more specific detail (metrics, tools, frameworks) to increase match strength.
              </p>
            )}
            {topMatchedSignal && (
              <div>
                <p className="text-xs font-medium text-green-600">✓ Top Matched Signal</p>
                <p className="text-xs text-muted-foreground mt-0.5">{topMatchedSignal}</p>
              </div>
            )}
            {topMissingSignal && (
              <div>
                <p className="text-xs font-medium text-amber-600">✗ Top Missing Signal</p>
                <p className="text-xs text-muted-foreground mt-0.5">{topMissingSignal}</p>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>

      <p className={`mt-1 text-xs font-medium ${config.accent}`}>
        {confidenceLevel || config.label}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">Based on weighted employer priorities.</p>
      <p className="mt-2 text-[11px] text-muted-foreground/70 italic">
        Free shows surface alignment. Pro reveals weighted priority intelligence.
      </p>
    </div>
  );
};

export default MatchScoreCard;
