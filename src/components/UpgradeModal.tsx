import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { initiateCheckout } from "@/utils/stripe";
import { Separator } from "@/components/ui/separator";
import { trackEvent } from "@/lib/analytics";
import { useEffect } from "react";

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  trialStarted?: boolean;
  trialRunsUsed?: number;
  trialLimit?: number;
  onStartTrial?: () => void;
  isAuthenticated?: boolean;
  hasConsumedOneTimeCredit?: boolean;
}

const UpgradeModal = ({
  open,
  onClose,
  trialStarted = false,
  trialRunsUsed = 0,
  trialLimit = 3,
  onStartTrial,
  isAuthenticated = true,
  hasConsumedOneTimeCredit = false,
}: UpgradeModalProps) => {

  // Track paywall view
  useEffect(() => {
    if (open) trackEvent("paywall_viewed");
  }, [open]);

  const handleStartTrial = () => {
    onStartTrial?.();
    onClose();
  };

  if (!isAuthenticated) {
    return (
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-sm">
          <DialogHeader className="space-y-2">
            <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
              Create Your Free Account
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
              Sign up to run your own alignment — 3 free analyses included.
            </DialogDescription>
          </DialogHeader>
          <div className="pt-4">
            <Button
              size="lg"
              className="w-full gap-2 bg-primary hover:bg-primary/90 transition-transform hover:scale-[1.03] active:scale-[0.97]"
              asChild
            >
              <a href="/auth">Get Started Free</a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto min-h-0 space-y-0">
          <DialogHeader className="space-y-2">
            <DialogTitle className="text-2xl font-bold tracking-tight text-foreground">
              See exactly what's holding your signal back.
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
              Your experience isn't the problem. Your positioning is.
            </DialogDescription>
          </DialogHeader>

          <Separator className="my-4" />

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">What you see now</p>
              <ul className="space-y-2">
                {[
                  "Surface-level score",
                  "High-level blocker",
                  "Partial insights",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary/80">What you unlock</p>
              <ul className="space-y-2">
                {[
                  "Exact resume changes to fix your blocker",
                  "Repositioned bullets aligned to this role",
                  "Clear positioning strategy hiring managers respond to",
                  "Interview questions based on your gaps",
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

          <div className="space-y-3">
            <Button
              size="lg"
              className="w-full gap-2 transition-transform hover:scale-[1.03] active:scale-[0.97]"
              onClick={() => {
                trackEvent("cta_clicked", { cta_label: "Unlock Full Signal Intelligence → $19/month", source: "upgrade_modal" });
                onClose();
                initiateCheckout("subscription");
              }}
            >
              Unlock Full Signal Intelligence → $19/month
            </Button>

            <div className="relative flex items-center justify-center">
              <Separator className="flex-1" />
              <span className="px-3 text-xs text-muted-foreground">or</span>
              <Separator className="flex-1" />
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2 transition-transform hover:scale-[1.03] active:scale-[0.97]"
              onClick={() => {
                trackEvent("cta_clicked", { cta_label: "One-time full report — $9", source: "upgrade_modal" });
                onClose();
                initiateCheckout("one_time");
              }}
            >
              {hasConsumedOneTimeCredit ? "Buy Another Single Report — $9" : "One-time full report — $9"}
            </Button>
          </div>
        </div>

        <div className="shrink-0 pt-3 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground/40 hover:text-muted-foreground/60 text-xs"
            onClick={onClose}
          >
            Continue with Signal Preview
          </Button>
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
