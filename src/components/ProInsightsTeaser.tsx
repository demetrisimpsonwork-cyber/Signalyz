import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useState, useCallback } from "react";

const TRIAL_KEY = "resumix_pro_trial";

interface TrialState {
  remaining: number;
  active: boolean;
}

function getTrialState(): TrialState {
  try {
    const raw = localStorage.getItem(TRIAL_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as TrialState;
      if (parsed.remaining > 0) return parsed;
    }
  } catch {}
  return { remaining: 0, active: false };
}

function startTrial() {
  const state: TrialState = { remaining: 3, active: true };
  localStorage.setItem(TRIAL_KEY, JSON.stringify(state));
  return state;
}

interface ProInsightsTeaserProps {
  onTrialStart?: () => void;
}

const ProInsightsTeaser = ({ onTrialStart }: ProInsightsTeaserProps) => {
  const navigate = useNavigate();
  const [trial, setTrial] = useState<TrialState>(getTrialState);

  const handleStartTrial = useCallback(() => {
    const state = startTrial();
    setTrial(state);
    onTrialStart?.();
  }, [onTrialStart]);

  if (trial.active && trial.remaining > 0) {
    return (
      <div className="rounded-lg border border-accent bg-accent/30 p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-accent-foreground" />
          <h3 className="text-sm font-semibold text-accent-foreground">Pro Trial Active</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {trial.remaining} Pro alignment{trial.remaining !== 1 ? "s" : ""} remaining in your trial.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card shadow-md overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-primary">Pro Alignment Intelligence™</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Advanced weighted employer-priority modeling.
        </p>
      </div>

      <div className="px-5 pb-5 space-y-4">
        {/* Benefits */}
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          <li className="flex items-center gap-2"><span className="text-primary">•</span> Weighted Priority Breakdown</li>
          <li className="flex items-center gap-2"><span className="text-primary">•</span> Advanced Gap Diagnostics</li>
          <li className="flex items-center gap-2"><span className="text-primary">•</span> Alignment History Tracking</li>
          <li className="flex items-center gap-2"><span className="text-primary">•</span> Deeper Keyword Clustering</li>
          <li className="flex items-center gap-2"><span className="text-primary">•</span> Unlimited Alignments</li>
        </ul>

        {/* Social proof */}
        <p className="text-xs text-muted-foreground/80 italic">
          Most users increase their match score after reviewing Pro gap insights.
        </p>

        {/* Preview Panel */}
        <div className="relative rounded-lg border bg-muted/30 overflow-hidden">
          <p className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Pro Preview
          </p>

          {/* Lock badge */}
          <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-background/80 border px-2 py-0.5">
            <Lock className="h-2.5 w-2.5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground font-medium">Locked</span>
          </div>

          <div className="px-3 pt-1.5 pb-6">
            {/* Visible lines */}
            <p className="text-xs font-medium text-foreground/80">Top 3 Weighted Priorities:</p>
            <p className="text-xs text-muted-foreground mt-1">
              Cross-functional leadership <span className="text-green-600 font-medium">(High weight)</span>
            </p>

            {/* Faded/blurred lines */}
            <div className="relative mt-1 overflow-hidden" style={{ maxHeight: "3rem" }}>
              <div className="space-y-1 text-xs text-muted-foreground select-none pointer-events-none">
                <p>Agile framework ownership <span className="text-amber-600">(Medium weight)</span></p>
                <p>SaaS product lifecycle <span className="text-green-600">(High weight)</span></p>
                <p>Stakeholder communication <span className="text-green-600">(High weight)</span></p>
              </div>
              {/* Gradient fade overlay */}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-muted/95 dark:to-background/95" />
            </div>
          </div>
        </div>

        {/* CTA Stack */}
        <div className="space-y-2 pt-1">
          <Button
            onClick={() => navigate("/pricing")}
            className="w-full gap-2 shadow-md hover:brightness-110 transition-all text-sm"
          >
            Unlock Deeper Alignment Intelligence — $9/month
          </Button>

          <button
            onClick={handleStartTrial}
            className="w-full text-center text-xs font-medium text-primary hover:text-primary/80 transition-colors py-1"
          >
            Try Pro Free for 3 Alignments
          </button>

          <p className="text-center text-[11px] text-muted-foreground">
            See exactly what hiring managers weight most. Cancel anytime.
          </p>
          <p className="text-center text-[10px] text-muted-foreground/60">
            No card required.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ProInsightsTeaser;
