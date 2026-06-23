import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { pickDisplayLinks } from "@/lib/scoringEvidenceDisplay";
import type { DisplayEvidenceLink } from "@/lib/scoringEvidenceDisplay";
import type { ScoringEvidence, ScoringEvidenceLinkage } from "@/lib/scoringEvidenceTypes";
import { ScoringEvidenceBadge } from "./ScoringEvidenceBadge";
import { ScoringEvidenceExcerpt } from "./ScoringEvidenceExcerpt";

function linkageLabel(linkage: ScoringEvidenceLinkage): string {
  switch (linkage) {
    case "supports":
      return "Resume-backed";
    case "absent":
      return "Not found in resume";
    default:
      return "Partial resume match";
  }
}

const LINKAGE_STYLES: Record<ScoringEvidenceLinkage, string> = {
  supports: "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/20 border-green-200/50 dark:border-green-900/40",
  partial: "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border-amber-200/50 dark:border-amber-900/40",
  absent: "text-destructive bg-destructive/[0.06] border-destructive/20",
};

interface ScoringEvidenceLinkRowProps {
  link: DisplayEvidenceLink;
  variant: "matched" | "missing";
}

function ScoringEvidenceLinkRow({ link, variant }: ScoringEvidenceLinkRowProps) {
  const prefix = variant === "matched" ? "✓" : "✗";

  return (
    <div className="rounded-md border border-border/50 bg-muted/15 px-3 py-2.5 space-y-2 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
        <p className="text-xs text-muted-foreground leading-relaxed min-w-0 flex-1">
          <span className={variant === "matched" ? "font-medium text-green-600 dark:text-green-400" : "font-medium text-destructive"}>
            {prefix}{" "}
          </span>
          {link.signal}
        </p>
        <span
          className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${LINKAGE_STYLES[link.linkage]}`}
        >
          {linkageLabel(link.linkage)}
        </span>
      </div>

      {link.excerpts.length > 0 && (
        <div className="space-y-2 pt-1 border-t border-border/40">
          {link.excerpts.map((excerpt, index) => (
            <ScoringEvidenceExcerpt key={`${excerpt.excerpt.slice(0, 24)}-${index}`} excerpt={excerpt} />
          ))}
        </div>
      )}
    </div>
  );
}

export interface ScoringEvidenceSectionProps {
  scoringEvidence?: ScoringEvidence | null;
  isPro?: boolean;
  className?: string;
}

export function ScoringEvidenceSection({
  scoringEvidence,
  isPro = false,
  className = "",
}: ScoringEvidenceSectionProps) {
  const [open, setOpen] = useState(false);
  const display = useMemo(
    () => pickDisplayLinks(scoringEvidence, isPro),
    [scoringEvidence, isPro],
  );

  const hasContent = display.matched.length > 0 || display.missing.length > 0;
  if (!scoringEvidence || !hasContent) {
    return null;
  }

  return (
    <div className={`rounded-lg border border-border/60 bg-background/40 min-w-0 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full min-h-[44px] items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/20"
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Resume evidence
        </span>
        <span className="flex items-center gap-2 shrink-0">
          <ScoringEvidenceBadge confidence={display.confidence} />
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
          )}
        </span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-border/40 px-3 py-3 animate-fade-in">
          {display.matched.map((link) => (
            <ScoringEvidenceLinkRow key={`matched-${link.signal}`} link={link} variant="matched" />
          ))}
          {display.missing.map((link) => (
            <ScoringEvidenceLinkRow key={`missing-${link.signal}`} link={link} variant="missing" />
          ))}
          <p className="text-[10px] text-muted-foreground/70 leading-relaxed pt-1">
            Based on resume sections retrieved for this run.
          </p>
        </div>
      )}
    </div>
  );
}

export default ScoringEvidenceSection;
