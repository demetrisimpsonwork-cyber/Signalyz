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
}

const getScoreConfig = (score: number) => {
  if (score >= 85) return { label: "High Priority Match", accent: "text-green-600", bg: "bg-green-50 dark:bg-green-950/30", border: "border-green-200 dark:border-green-800" };
  if (score >= 70) return { label: "Strong Alignment", accent: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30", border: "border-emerald-200 dark:border-emerald-800" };
  if (score >= 50) return { label: "Developing Alignment", accent: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-200 dark:border-amber-800" };
  return { label: "Low Alignment — Needs Strategic Revision", accent: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950/30", border: "border-orange-200 dark:border-orange-800" };
};

const MatchScoreCard = ({ score, confidenceLevel }: MatchScoreCardProps) => {
  const [copied, setCopied] = useState(false);
  const config = getScoreConfig(score);

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
          <PopoverContent className="w-72 text-sm" side="bottom" align="start">
            <p className="text-muted-foreground leading-relaxed">
              Alignment is calculated based on weighted employer priorities, keyword emphasis, ownership level signals, and contextual matching.
            </p>
            {score < 80 && (
              <p className="mt-2 text-muted-foreground leading-relaxed">
                Gaps detected in high-priority signals such as methodology, scope, or measurable outcomes.
              </p>
            )}
          </PopoverContent>
        </Popover>
      </div>

      <p className={`mt-1 text-xs font-medium ${config.accent}`}>
        {confidenceLevel || config.label}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">Based on weighted employer priorities.</p>
    </div>
  );
};

export default MatchScoreCard;
