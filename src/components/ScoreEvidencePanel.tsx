import { breakdownToRows, type ScoringBreakdown } from "@/lib/scoreEvidence";
import type { ScoringEvidence } from "@/lib/scoringEvidenceTypes";
import { ScoringEvidenceSection } from "@/components/scoring-evidence";

interface ScoreEvidencePanelProps {
  breakdown?: ScoringBreakdown | null;
  topMatchedSignal?: string | null;
  topMissingSignal?: string | null;
  strengths?: string[];
  gaps?: string[];
  /** When set, shown above breakdown as the dominant screen-out reason */
  primaryBlocker?: string | null;
  /** Panel heading — defaults to "Why this score" */
  title?: string;
  /** Show strength/gap lists when provided */
  showRationale?: boolean;
  scoringEvidence?: ScoringEvidence | null;
  isPro?: boolean;
  className?: string;
}

export function ScoreEvidencePanel({
  breakdown,
  topMatchedSignal,
  topMissingSignal,
  strengths = [],
  gaps = [],
  primaryBlocker,
  title = "Why this score",
  showRationale = false,
  scoringEvidence,
  isPro = false,
  className = "",
}: ScoreEvidencePanelProps) {
  const rows = breakdownToRows(breakdown);
  const hasSignals = !!(topMatchedSignal || topMissingSignal);
  const hasRationale = showRationale && (strengths.length > 0 || gaps.length > 0);
  const hasContent = rows.length > 0 || hasSignals || hasRationale || primaryBlocker;

  if (!hasContent) return null;

  return (
    <div className={`rounded-lg border border-border/60 bg-background/40 p-4 space-y-2.5 min-w-0 overflow-hidden ${className}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{title}</p>

      {primaryBlocker && (
        <div className="rounded-md border border-destructive/20 bg-destructive/[0.04] p-2.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-destructive mb-1">Primary Blocker</p>
          <p className="text-xs text-foreground leading-relaxed">{primaryBlocker}</p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="space-y-1.5">
          {rows.map((item) => {
            const pct = Math.max(0, Math.min(100, Number(item.value) || 0));
            return (
              <div key={item.label} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {item.label} <span className="text-muted-foreground/50">({item.weight})</span>
                  </span>
                  <span className="text-xs font-semibold tabular-nums text-foreground">{pct}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {hasSignals && (
        <div className={`space-y-1.5 min-w-0 ${rows.length > 0 ? "pt-2 border-t border-border/40" : ""}`}>
          {topMatchedSignal && (
            <p className="text-xs text-muted-foreground break-words">
              <span className="font-medium text-green-600 dark:text-green-400">✓ Matched signal:</span> {topMatchedSignal}
            </p>
          )}
          {topMissingSignal && (
            <p className="text-xs text-muted-foreground break-words">
              <span className="font-medium text-destructive">✗ Under-signaled priority:</span> {topMissingSignal}
            </p>
          )}
        </div>
      )}

      <ScoringEvidenceSection
        scoringEvidence={scoringEvidence}
        isPro={isPro}
        className="min-w-0 bg-muted/10"
      />

      {hasRationale && (
        <div className="space-y-2 pt-2 border-t border-border/40">
          {strengths.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">What's landing</p>
              <ul className="space-y-1">
                {strengths.slice(0, 3).map((s, i) => (
                  <li key={i} className="text-xs text-muted-foreground leading-relaxed">• {s}</li>
                ))}
              </ul>
            </div>
          )}
          {gaps.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Screen-out risks</p>
              <ul className="space-y-1">
                {gaps.slice(0, 3).map((g, i) => (
                  <li key={i} className="text-xs text-muted-foreground leading-relaxed">• {g}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <p className="text-[10px] text-muted-foreground/70 leading-relaxed pt-1">
          Weighted across five employer-priority dimensions — these components produced the score above.
        </p>
      )}
    </div>
  );
}

export default ScoreEvidencePanel;
