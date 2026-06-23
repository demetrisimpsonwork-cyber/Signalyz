import type { DisplayConfidence } from "@/lib/scoringEvidenceDisplay";

const TONE_STYLES: Record<DisplayConfidence["tone"], string> = {
  high: "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/25 border-green-200/60 dark:border-green-900/50",
  medium: "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/25 border-amber-200/60 dark:border-amber-900/50",
  low: "text-muted-foreground bg-muted/40 border-border/60",
};

interface ScoringEvidenceBadgeProps {
  confidence: DisplayConfidence;
  className?: string;
}

export function ScoringEvidenceBadge({ confidence, className = "" }: ScoringEvidenceBadgeProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${TONE_STYLES[confidence.tone]} ${className}`}
    >
      {confidence.label}
    </span>
  );
}

export default ScoringEvidenceBadge;
