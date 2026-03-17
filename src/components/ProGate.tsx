import { useState } from "react";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { initiateCheckout } from "@/utils/stripe";
import { Loader2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface ProGateProps {
  featureName: string;
  featureDescription: string;
  children: React.ReactNode;
  /** When true, shows a subtle Pro upsell below the content */
  showOneTimeUpsell?: boolean;
}

export function ProGate({
  featureName,
  featureDescription,
  children,
  showOneTimeUpsell = false,
}: ProGateProps) {
  const { isPro, hasOneTimeCredit, loading } = useSubscription();
  const { user } = useAuth();
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Pro users or users with an unused one-time credit get full access
  if (isPro || hasOneTimeCredit) {
    return (
      <>
        {children}
        {/* Subtle upsell for one-time purchasers (not Pro subscribers) */}
        {!isPro && hasOneTimeCredit && showOneTimeUpsell && (
          <div className="mt-6 rounded-lg border border-border/50 bg-muted/30 px-4 py-3 text-center">
            <p className="text-sm text-muted-foreground">
              Applying to more than one role?{" "}
              <button
                onClick={() => initiateCheckout("subscription")}
                className="text-primary hover:underline font-medium"
              >
                See My Exact Fix — unlimited analyses for $19/mo
              </button>
            </p>
          </div>
        )}
      </>
    );
  }

  const isAuthenticated = !!user;

  const handleUpgrade = async (mode: "subscription" | "one_time") => {
    if (!isAuthenticated) {
      window.location.href = "/auth";
      return;
    }
    setCheckoutLoading(true);
    try {
      await initiateCheckout(mode);
    } finally {
      setCheckoutLoading(false);
    }
  };

  return (
    <div className="relative">
      <div className="pointer-events-none select-none blur-sm opacity-40">
        <div className="space-y-4 py-8">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex gap-3 items-start">
              <div className="h-4 w-4 rounded-full bg-muted shrink-0 mt-0.5" />
              <div className="space-y-2 flex-1">
                <div className="h-3 bg-muted rounded w-full" />
                <div className="h-3 bg-muted rounded w-3/4" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center space-y-5 max-w-sm px-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <span className="text-2xl text-primary">✦</span>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-bold text-foreground tracking-tight">
               {isAuthenticated ? "3 exact changes that would move your score above 70%" : "Create Your Free Account"}
             </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
               {isAuthenticated ? "You're closer than you think — but missing positioning, not experience." : "Sign up to access this feature — 3 free analyses included."}
             </p>
             {isAuthenticated && (
               <p className="text-[11px] text-muted-foreground/80 italic">Most candidates miss this — that's why they stay stuck</p>
             )}
             {isAuthenticated && (
               <p className="text-[11px] font-semibold text-destructive/80">Most candidates never fix this — that's why they stay stuck</p>
             )}
          </div>

          {isAuthenticated ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-2xl font-bold text-foreground">
                  $19<span className="text-sm font-normal text-muted-foreground">/month</span>
                </p>
                <p className="text-xs text-muted-foreground">Cancel anytime · Instant access</p>
              </div>

              <Button
                onClick={() => handleUpgrade("subscription")}
                disabled={checkoutLoading}
                className="w-full gap-2 transition-transform hover:scale-[1.03] active:scale-[0.97]"
                size="lg"
              >
                {checkoutLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span style={{ color: "inherit" }}>✦</span>
                )}
                See My Exact Fix
              </Button>

              <div className="relative flex items-center justify-center">
                <Separator className="flex-1" />
                <span className="px-3 text-xs text-muted-foreground">or</span>
                <Separator className="flex-1" />
              </div>

              <Button
                onClick={() => handleUpgrade("one_time")}
                disabled={checkoutLoading}
                variant="outline"
                className="w-full gap-2 transition-transform hover:scale-[1.03] active:scale-[0.97]"
              >
                See My Exact Fix — $9 one-time
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">Most users improve interview rates within 2–3 applications</p>
              <p className="text-[11px] text-destructive/70 italic text-center">Every application without fixing this risks being ignored.</p>
            </div>
          ) : (
            <Button
              onClick={() => handleUpgrade("subscription")}
              disabled={checkoutLoading}
              className="w-full gap-2 transition-transform hover:scale-[1.03] active:scale-[0.97]"
              size="lg"
              asChild
            >
              <a href="/auth">Get Started Free</a>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProGate;
