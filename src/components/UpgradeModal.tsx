import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Separator } from "@/components/ui/separator";

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  trialStarted?: boolean;
  trialRunsUsed?: number;
  trialLimit?: number;
  onStartTrial?: () => void;
}

const UpgradeModal = ({
  open,
  onClose,
  trialStarted = false,
  trialRunsUsed = 0,
  trialLimit = 3,
  onStartTrial,
}: UpgradeModalProps) => {
  const navigate = useNavigate();

  const handleStartTrial = () => {
    onStartTrial?.();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
            Unlock Employer Intelligence™
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
            You are currently seeing surface-level alignment only.
            <br />
            Upgrade to access the full employer decision model.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">Free Tier</p>
            <ul className="space-y-2">
              {[
                "One aligned bullet",
                "Overall alignment score",
                "Role Signal Clarity only",
                "Surface-level gap indicators",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary/80">Employer Intelligence™</p>
            <ul className="space-y-2">
              {[
                "Identity Strength Index™ — all 4 pillars",
                "Employer Risk Perception™",
                "Multi-bullet strategic variants",
                "Weighted priority breakdown",
                "Gap severity classification",
                "Interview leverage insights",
                "Unlimited strategic runs",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-foreground">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <Separator className="my-5" />

        <p className="text-sm text-muted-foreground leading-relaxed">
          Hiring managers don't scan resumes.
          <br />
          They evaluate risk and signal strength.
          <br />
          <span className="text-foreground font-medium">Resumix shows you what they actually see.</span>
        </p>

        <Separator className="my-5" />

        <div className="space-y-4">
          <div>
            <p className="text-sm font-bold text-foreground">Employer Intelligence™</p>
            <p className="text-xs text-muted-foreground mt-0.5">$9/month — cancel anytime</p>
            <p className="text-[11px] text-muted-foreground/70 italic mt-0.5">Less than one rejected application.</p>
          </div>

          <div className="space-y-3">
            <Button
              size="lg"
              className="w-full"
              onClick={() => {
                onClose();
                navigate("/pricing");
              }}
            >
              Unlock Employer Intelligence™
            </Button>

            {!trialStarted && onStartTrial && (
              <>
                <div className="flex items-center gap-3">
                  <Separator className="flex-1" />
                  <span className="text-xs text-muted-foreground/50">or</span>
                  <Separator className="flex-1" />
                </div>
                <button
                  onClick={handleStartTrial}
                  className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
                >
                  Try Pro Free — 3 Strategic Runs
                  <span className="block text-xs text-muted-foreground/50 mt-0.5">No card required</span>
                </button>
              </>
            )}

            {trialStarted && (
              <TrialProgress used={trialRunsUsed} limit={trialLimit} />
            )}

            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              Most candidates optimize wording.
              <br />
              Strategic candidates optimize perception.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground/50 hover:text-muted-foreground"
              onClick={onClose}
            >
              Continue with free tier
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const TrialProgress = ({ used, limit }: { used: number; limit: number }) => {
  const pct = Math.min((used / limit) * 100, 100);
  return (
    <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2.5 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Pro Trial</span>
        <span className="text-xs text-muted-foreground">
          {used} of {limit} runs used
        </span>
      </div>
      <div className="h-0.5 w-full rounded-full bg-border overflow-hidden">
        <div
          className="h-full rounded-full bg-primary/60 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

export default UpgradeModal;
