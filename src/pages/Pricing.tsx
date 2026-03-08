import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { initiateCheckout } from "@/utils/stripe";
import { useAuth } from "@/hooks/useAuth";

const tiers = [
  {
    name: "Signal Preview",
    price: "$0",
    description: "Surface-level alignment diagnostics",
    features: [
      "3 signal alignments per day",
      "Calibrated bullet (1 version)",
      "Overall alignment score",
      "Top signal gap identification",
    ],
    cta: "Get started",
    highlighted: false,
  },
  {
    name: "Resumix Pro",
    price: "$19",
    period: "/mo",
    description: "Full signal calibration engine",
    features: [
      "Unlimited alignments",
      "Full Identity Strength Index™ (all 4 pillars)",
      "Complete Signal Risk Projection (all 5 stages)",
      "Multi-variant repositioned bullets",
      "Build My Calibrated Resume (full DOCX export)",
      "Executive Signal Audit access",
      "Interview Intelligence™",
      "ATS Signal Panel",
      "Cover Letter Engine™",
      "LinkedIn Signal calibration",
      "Alignment history",
    ],
    cta: "Unlock Resumix Pro",
    highlighted: true,
  },
];

const Pricing = () => {
  const { user } = useAuth();
  const isAuthenticated = !!user;
  const [showSticky, setShowSticky] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowSticky(window.scrollY > 600);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="container max-w-4xl py-20 px-4 pb-32 md:pb-20">
      <div className="mb-14 text-center">
        <h1 className="text-3xl font-bold text-foreground">Precision. Not guesswork.</h1>
        <p className="mt-3 text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
          Most candidates optimize wording. Strategic candidates optimize perception.
        </p>
      </div>

      {/* Desktop: 2-col grid. Mobile: stacked cards */}
      <div className="grid gap-6 md:grid-cols-2">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={`rounded-xl border p-6 sm:p-8 flex flex-col ${
              tier.highlighted
                ? "border-primary bg-[#0F1C2E] text-white shadow-lg"
                : "bg-card"
            }`}
          >
            <div>
              <h3 className={`text-base font-semibold tracking-tight ${tier.highlighted ? "text-white" : "text-foreground"}`}>{tier.name}</h3>
              <p className={`mt-1 text-sm ${tier.highlighted ? "text-white/60" : "text-muted-foreground"}`}>{tier.description}</p>
            </div>

            <div className="mt-4">
              <span className={`text-4xl font-bold ${tier.highlighted ? "text-white" : "text-foreground"}`}>{tier.price}</span>
              {tier.period && <span className={tier.highlighted ? "text-white/60" : "text-muted-foreground"}>{tier.period}</span>}
            </div>

            <ul className="mt-6 space-y-3 flex-1">
              {tier.features.map((f) => (
                <li key={f} className={`flex items-start gap-2 text-sm ${tier.highlighted ? "text-white/90" : "text-foreground"}`}>
                  <Check className={`h-4 w-4 shrink-0 mt-0.5 ${tier.highlighted ? "text-primary" : "text-primary"}`} />
                  {f}
                </li>
              ))}
            </ul>

            {isAuthenticated ? (
              <Button
                className={`mt-8 w-full`}
                variant={tier.highlighted ? "default" : "outline"}
                onClick={tier.highlighted ? () => initiateCheckout() : undefined}
              >
                {tier.cta}
              </Button>
            ) : (
              <Button
                className={`mt-8 w-full`}
                variant={tier.highlighted ? "default" : "outline"}
                asChild={tier.highlighted}
              >
                {tier.highlighted ? <a href="/auth">Get Started Free</a> : tier.cta}
              </Button>
            )}
          </div>
        ))}
      </div>

      <p className="mt-12 text-center text-sm font-medium text-foreground">
        Hiring managers agree: ATS scores don't get you hired. Signal does.
      </p>

      <p className="mt-4 text-center text-xs text-muted-foreground leading-relaxed">
        Less than one rejected application costs you.<br />
        Every insight is grounded in real resume + job description signals — zero fabrication.
      </p>

      {/* Sticky mobile CTA */}
      <div className={`fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background/95 backdrop-blur border-t border-border px-4 py-3 transition-transform duration-300 ${showSticky ? "translate-y-0" : "translate-y-full"}`}>
        {isAuthenticated ? (
          <Button className="w-full" size="lg" onClick={() => initiateCheckout()}>
            Unlock Resumix Pro — $19/month
          </Button>
        ) : (
          <Button className="w-full" size="lg" asChild>
            <a href="/auth">Get Started Free</a>
          </Button>
        )}
      </div>
    </div>
  );
};

export default Pricing;
