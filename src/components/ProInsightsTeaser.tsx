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
      <div className="rounded-lg border border-accent bg-accent/30 p-4">
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
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Lock className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-primary">Pro Alignment Intelligence</h3>
      </div>

      <div className="rounded-lg border bg-accent/20 p-5 space-y-4">
        {/* Benefits */}
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          <li>• Weighted Priority Breakdown</li>
          <li>• Advanced Gap Diagnostics</li>
          <li>• Alignment History Tracking</li>
          <li>• Deeper Keyword Clustering</li>
          <li>• Unlimited Alignments</li>
        </ul>

        {/* Blurred example preview */}
        <div className="relative rounded-md border bg-card/60 p-4 select-none" aria-hidden="true">
          <div className="blur-[4px] opacity-60 space-y-2 text-xs text-muted-foreground">
            <p className="font-medium text-foreground/70">Top 3 Weighted Priorities:</p>
            <p>Cross-functional leadership <span className="text-green-600">(High weight)</span></p>
            <p>Agile framework ownership <span className="text-amber-600">(Medium weight)</span></p>
            <p>SaaS product lifecycle <span className="text-green-600">(High weight)</span></p>
          </div>
        </div>

        {/* CTA */}
        <Button
          onClick={() => navigate("/pricing")}
          className="w-full gap-2 shadow-md hover:brightness-110 transition-all"
        >
          Unlock Pro Alignment Intelligence — $9/month
        </Button>

        <button
          onClick={handleStartTrial}
          className="w-full text-center text-xs font-medium text-primary hover:text-primary/80 transition-colors py-1"
        >
          Try Pro Free for 3 Alignments
        </button>

        <p className="text-center text-xs text-muted-foreground">
          Prove alignment with clarity. Cancel anytime.
        </p>
      </div>
    </div>
  );
};

export default ProInsightsTeaser;
