import type { DisplayExcerpt } from "@/lib/scoringEvidenceDisplay";

interface ScoringEvidenceExcerptProps {
  excerpt: DisplayExcerpt;
  className?: string;
}

export function ScoringEvidenceExcerpt({ excerpt, className = "" }: ScoringEvidenceExcerptProps) {
  const meta = [excerpt.section, excerpt.company].filter(Boolean).join(" · ");

  return (
    <div className={`min-w-0 space-y-1 ${className}`}>
      <p className="text-[11px] text-muted-foreground/90 italic leading-relaxed pl-2 border-l-2 border-border/60 line-clamp-2">
        &ldquo;{excerpt.excerpt}&rdquo;
      </p>
      {meta && (
        <p className="text-[10px] text-muted-foreground/70 truncate">{meta}</p>
      )}
    </div>
  );
}

export default ScoringEvidenceExcerpt;
