import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

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
      "Interview Preparation Notice",
      "Alignment history",
    ],
    cta: "Unlock Resumix Pro",
    highlighted: true,
  },
];

const Pricing = () => {
  return (
    <div className="container max-w-4xl py-20 px-4">
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
                ? "border-primary bg-accent shadow-lg"
                : "bg-card"
            }`}
          >
            <div>
              <h3 className="text-base font-semibold text-foreground tracking-tight">{tier.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{tier.description}</p>
            </div>

            <div className="mt-4">
              <span className="text-4xl font-bold text-foreground">{tier.price}</span>
              {tier.period && <span className="text-muted-foreground">{tier.period}</span>}
            </div>

            <ul className="mt-6 space-y-3 flex-1">
              {tier.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-foreground">
                  <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>

            <Button
              className="mt-8 w-full"
              variant={tier.highlighted ? "default" : "outline"}
            >
              {tier.cta}
            </Button>
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
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background/95 backdrop-blur border-t border-border px-4 py-3">
        <Button className="w-full" size="lg">
          Unlock Resumix Pro — $19/month
        </Button>
      </div>
    </div>
  );
};

export default Pricing;
