import { useState } from "react";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { initiateCheckout } from "@/utils/stripe";
import { Loader2 } from "lucide-react";

interface ProGateProps {
  featureName: string;
  featureDescription: string;
  children: React.ReactNode;
}

export function ProGate({
  featureName,
  featureDescription,
  children,
}: ProGateProps) {
  const { isPro, loading } = useSubscription();
  const { user } = useAuth();
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (isPro) {
    return <>{children}</>;
  }

  const isAuthenticated = !!user;

  const handleUpgrade = async () => {
    if (!isAuthenticated) {
      window.location.href = "/auth";
      return;
    }
    setCheckoutLoading(true);
    try {
      await initiateCheckout();
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
              {isAuthenticated ? `Unlock ${featureName}` : "Create Your Free Account"}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {isAuthenticated ? featureDescription : "Sign up to access this feature — 3 free analyses included."}
            </p>
          </div>

          {isAuthenticated && (
            <div className="space-y-1">
              <p className="text-2xl font-bold text-foreground">
                $19<span className="text-sm font-normal text-muted-foreground">/month</span>
              </p>
              <p className="text-xs text-muted-foreground">Cancel anytime · Instant access</p>
            </div>
          )}

          <Button
            onClick={handleUpgrade}
            disabled={checkoutLoading}
            className="w-full gap-2 transition-transform hover:scale-[1.03] active:scale-[0.97]"
            size="lg"
            {...(!isAuthenticated ? { asChild: true } : {})}
          >
            {isAuthenticated ? (
              <>
                {checkoutLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span style={{ color: "inherit" }}>✦</span>
                )}
                Upgrade to Full Signal Intelligence
              </>
            ) : (
              <a href="/auth">Get Started Free</a>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ProGate;
