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
import { useIsMobile } from "@/hooks/use-mobile";

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
  const isMobile = useIsMobile();

  // Track paywall view
  useEffect(() => {
    if (open) trackEvent("paywall_viewed");
  }, [open]);

  if (!isAuthenticated) {
    return (
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-sm">
          <DialogHeader className="space-y-2">
            <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
              Your signal analysis is ready to unlock
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
              Create your free account to unlock your full signal analysis.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-primary/20 bg-primary/[0.04] px-3 py-2.5 mt-1">
            <p className="text-sm text-foreground">
              You're closer than you think — your experience just needs repositioning. Sign up to see your exact fix.
            </p>
          </div>
          <div className="pt-2 space-y-3">
            <Button
              size="lg"
              className="w-full gap-2 bg-primary hover:bg-primary/90 transition-transform hover:scale-[1.03] active:scale-[0.97]"
              asChild
            >
              <a href="/auth">Unlock Your Fix → Free</a>
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">3 free analyses included · No credit card required</p>
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
            <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
              See exactly what's blocking interviews
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
              Your experience is not the problem. How it's being read is.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border border-primary/20 bg-primary/[0.04] px-3 py-2.5 mt-3 space-y-1">
            <p className="text-sm font-semibold text-foreground">
              Unlock the exact changes, rewritten bullets, and interview guidance tied to this role.
            </p>
          </div>

          {/* What you unlock — single-column on mobile, two-column on desktop */}
          {isMobile ? (
            <div className="mt-5 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary/80">What you unlock</p>
              <ul className="space-y-2">
                {[
                  "Exact resume changes to fix your blocker",
                  "Rewritten bullets aligned to this role",
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
          ) : (
            <div className="mt-5 grid grid-cols-2 gap-6">
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
                    "Rewritten bullets aligned to this role",
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
          )}

          <Separator className="my-5" />

          <div className="space-y-3">
            <Button
              size="lg"
              className="w-full gap-2 transition-transform hover:scale-[1.03] active:scale-[0.97]"
              onClick={() => {
                trackEvent("cta_clicked", { cta_label: "Fix This Now → $9", source: "upgrade_modal" });
                onClose();
                initiateCheckout("one_time");
              }}
            >
              Fix This Now → $9
            </Button>

            <div className="relative flex items-center justify-center">
              <Separator className="flex-1" />
              <span className="px-3 text-xs text-muted-foreground">or</span>
              <Separator className="flex-1" />
            </div>

            <Button
              variant="outline"
              className="w-full gap-2 transition-transform hover:scale-[1.03] active:scale-[0.97]"
              onClick={() => {
                trackEvent("cta_clicked", { cta_label: "Get Full Access → $19/month", source: "upgrade_modal" });
                onClose();
                initiateCheckout("subscription");
              }}
            >
              Get Full Access → $19/month
            </Button>

            <p className="text-[11px] text-muted-foreground text-center">Most users improve interview rates within 2–3 applications</p>
            <p className="text-[11px] text-destructive/70 italic text-center">Every application you send without fixing this is likely being ignored.</p>
          </div>
        </div>

        <div className="shrink-0 pt-3 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground/60 hover:text-muted-foreground/80 text-xs"
            onClick={onClose}
          >
            Continue with limited preview
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UpgradeModal;
