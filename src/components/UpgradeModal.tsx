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
  isAuthenticated?: boolean;
  hasConsumedOneTimeCredit?: boolean;
  hasOneTimeCredit?: boolean;
}

const UpgradeModal = ({
  open,
  onClose,
  isAuthenticated = true,
  hasConsumedOneTimeCredit = false,
  hasOneTimeCredit = false,
}: UpgradeModalProps) => {

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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">What you see now</p>
              <ul className="space-y-2">
                {[
                  "Your signal score and primary blocker",
                  "High-level blocker",
                  "Your diagnosis summary",
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
            {hasOneTimeCredit && !hasConsumedOneTimeCredit && (
              <p className="text-xs text-center text-primary/80 font-medium">
                You have 1 unused report credit available.
              </p>
            )}

            <Button
              size="lg"
              className="w-full gap-2"
              onClick={() => {
                trackEvent("upgrade_clicked", { payment_mode: "subscription", source: "upgrade_modal" });
                trackEvent("cta_clicked", { cta_label: "Unlock Full Signal Intelligence → $19/mo", source: "upgrade_modal" });
                initiateCheckout("subscription");
              }}
            >
              Unlock Full Signal Intelligence → $19/mo
            </Button>

            <div className="relative flex items-center justify-center">
              <Separator className="flex-1" />
              <span className="px-3 text-xs text-muted-foreground">or</span>
              <Separator className="flex-1" />
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={() => {
                trackEvent("one_time_report_clicked", { payment_mode: "one_time", source: "upgrade_modal" });
                trackEvent("cta_clicked", { cta_label: hasConsumedOneTimeCredit ? "Buy Another Single Report — $9" : "One-time full report — $9", source: "upgrade_modal" });
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

export default UpgradeModal;
