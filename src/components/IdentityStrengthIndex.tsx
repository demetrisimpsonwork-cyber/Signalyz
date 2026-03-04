import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";

interface ISIPillar {
  name: string;
  score: number;
  explanation: string;
  improvement_lever: string;
}

interface IdentityStrengthIndexData {
  total_score: number;
  pillars: ISIPillar[];
}

interface IdentityStrengthIndexProps {
  data: IdentityStrengthIndexData;
  isPro: boolean;
  onUpgrade: () => void;
  inferredRoleTitle?: string;
}

const scoreColor = (score: number, max = 25) => {
  const pct = score / max;
  if (pct >= 0.8) return "text-green-700 dark:text-green-400";
  if (pct >= 0.56) return "text-amber-700 dark:text-amber-400";
  return "text-destructive";
};

const scoreBarColor = (score: number, max = 25) => {
  const pct = score / max;
  if (pct >= 0.8) return "bg-green-500 dark:bg-green-400";
  if (pct >= 0.56) return "bg-amber-500 dark:bg-amber-400";
  return "bg-destructive";
};

const totalScoreColor = (score: number) => {
  if (score >= 70) return "text-green-600 dark:text-green-400";
  if (score >= 50) return "text-orange-500";
  return "text-destructive";
};

const totalScoreLabel = (score: number) => {
  if (score >= 80) return { label: "STRONG", color: totalScoreColor(score), bg: "bg-green-100 dark:bg-green-950/40 border-green-200 dark:border-green-800/40" };
  if (score >= 60) return { label: "MODERATE", color: totalScoreColor(score), bg: "bg-amber-100 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/40" };
  return { label: "WEAK", color: totalScoreColor(score), bg: "bg-destructive/10 border-destructive/20" };
};

function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>();
  useEffect(() => {
    if (target <= 0) { setValue(0); return; }
    const start = performance.now();
    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - (1 - progress) * (1 - progress);
      setValue(Math.round(eased * target));
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);
  return value;
}

const LockedPillar = ({ name }: { name: string }) => (
  <div className="rounded-md border bg-background overflow-hidden relative min-h-[100px]">
    <div className="p-5 space-y-2 select-none pointer-events-none blur-sm opacity-40" aria-hidden>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">{name}</p>
        <span className="text-sm font-bold text-muted-foreground">--/25</span>
      </div>
      <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
        <div className="h-full w-3/5 bg-muted-foreground/30 rounded-full" />
      </div>
      <div className="h-2.5 w-full rounded bg-muted mt-2" />
      <div className="h-2.5 w-4/5 rounded bg-muted" />
    </div>
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-background/80 backdrop-blur-[2px]">
      <Lock className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-[11px] text-muted-foreground font-medium tracking-wide">RESUMIX PRO</span>
    </div>
  </div>
);

const PillarCard = ({ pillar, roleTitle }: { pillar: ISIPillar; roleTitle: string }) => (
  <div className="rounded-md border bg-background overflow-hidden">
    <div className="p-5 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-foreground">{pillar.name}</p>
        <span className={`text-sm font-bold tabular-nums ${scoreColor(pillar.score)}`}>
          {pillar.score}<span className="text-[10px] font-normal text-muted-foreground">/25</span>
        </span>
      </div>
      <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${scoreBarColor(pillar.score)}`}
          style={{ width: `${(pillar.score / 25) * 100}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed pt-1">{pillar.explanation}</p>
    </div>
    <div className="px-5 py-3 border-t border-border/60 bg-muted/20">
      <p className="text-[10px] uppercase tracking-widest font-semibold text-primary mb-1">
        Threshold Requirement
      </p>
      <p className="text-xs text-foreground leading-relaxed">{roleTitle} threshold requires {pillar.improvement_lever.replace(/^[Ii]f possible[,]?\s*/i, "").replace(/^[Aa]dd\s/i, "").replace(/^[Ii]nclude\s/i, "").replace(/^[Cc]onsider\s/i, "")}</p>
    </div>
  </div>
);

const IdentityStrengthIndex = ({ data, isPro, onUpgrade, inferredRoleTitle }: IdentityStrengthIndexProps) => {
  const { label, color, bg } = totalScoreLabel(data.total_score);
  const visiblePillars = isPro ? data.pillars : data.pillars.slice(0, 1);
  const lockedPillars = isPro ? [] : data.pillars.slice(1);
  const roleTitle = inferredRoleTitle || "Target Role";
  const animatedTotal = useCountUp(data.total_score, 1200);

  return (
    <div className="rounded-lg border bg-card p-5 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground mt-2" style={{ letterSpacing: "0.02em" }}>Identity Strength Index™</h3>
            {!isPro && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wide">
                Pro
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">
            Resume identity coherence measured across four signal dimensions.
          </p>
        </div>
        {/* Total score — large animated */}
        <div className={`shrink-0 rounded-md border px-4 py-3 text-center ${bg}`}>
          <p className={`font-bold tabular-nums leading-none ${color}`} style={{ fontSize: "48px" }}>{animatedTotal}</p>
          <p className="text-[9px] font-semibold tracking-widest mt-1 text-muted-foreground uppercase">/100</p>
          <p className={`text-[9px] font-bold tracking-widest mt-1 uppercase ${color}`}>{label}</p>
        </div>
      </div>

      {!isPro && (
        <p className="text-[11px] text-muted-foreground leading-relaxed border-l-2 border-border pl-3">
          You are currently seeing surface-level alignment only.
        </p>
      )}

      {/* Pillar cards */}
      <div className="space-y-3">
        {visiblePillars.map((pillar, i) => (
          <PillarCard key={i} pillar={pillar} roleTitle={roleTitle} />
        ))}
        {lockedPillars.map((pillar, i) => (
          <LockedPillar key={i} name={pillar.name} />
        ))}
      </div>

      {/* Free tier CTA */}
      {!isPro && (
        <div className="pt-1 flex flex-col items-start gap-2">
          <p className="text-[11px] text-muted-foreground">
            3 identity dimensions are restricted to Resumix Pro.
          </p>
          <Button size="sm" className="gap-1.5 text-xs h-8 px-3" onClick={onUpgrade}>
            <Lock className="h-3 w-3" />
            Unlock Resumix Pro
          </Button>
        </div>
      )}
    </div>
  );
};

export default IdentityStrengthIndex;
