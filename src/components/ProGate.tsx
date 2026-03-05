import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { initiateCheckout } from "@/utils/stripe";

interface PinnacleGateProps {
  featureName: string;
  featureDescription: string;
  children: React.ReactNode;
}

export function PinnacleGate({
  featureName,
  featureDescription,
  children,
}: PinnacleGateProps) {
  const { isPinnacle, loading } = useSubscription();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (isPinnacle) {
    return <>{children}</>;
  }

  // ── LOCKED STATE ───────────────────────────────────────
  return (
    <div className="relative">
      {/* Blurred ghost content */}
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

      {/* Upgrade overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center space-y-5 max-w-sm px-4">
          {/* Icon */}
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(38,92%,50%)]/10">
            <span className="text-2xl" style={{ color: "hsl(38, 92%, 50%)" }}>✦</span>
          </div>

          {/* Copy */}
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-foreground tracking-tight">
              Unlock {featureName}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {featureDescription}
            </p>
          </div>

          {/* Price */}
          <div className="space-y-1">
            <p className="text-2xl font-bold text-foreground">
              $19<span className="text-sm font-normal text-muted-foreground">/month</span>
            </p>
            <p className="text-xs text-muted-foreground">Cancel anytime · Instant access</p>
          </div>

          {/* CTA */}
          <Button
            onClick={() => initiateCheckout()}
            className="w-full gap-2 transition-transform hover:scale-[1.03] active:scale-[0.97]"
            size="lg"
          >
            <span style={{ color: "inherit" }}>✦</span>
            Upgrade to Pinnacle
          </Button>
        </div>
      </div>
    </div>
  );
}

export default PinnacleGate;
