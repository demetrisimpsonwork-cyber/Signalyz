import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

const tiers = [
  {
    name: "Free",
    price: "$0",
    description: "Surface-level alignment",
    features: [
      "3 alignments/day",
      "Overall alignment score",
      "Basic keyword gap analysis",
      "1 optimized bullet",
      "Role Signal Clarity pillar (ISI™)",
    ],
    cta: "Get started",
    highlighted: false,
    microcopy: null,
    psychFrame: null,
  },
  {
    name: "Pro — Unlimited",
    price: "$19",
    period: "/mo",
    description: "Full employer decision model",
    features: [
      "Unlimited refinements",
      "Full Identity Strength Index™ (4 pillars)",
      "Employer Risk Perception Analysis™",
      "Weighted employer priority breakdown",
      "Multi-bullet strategic variants",
      "Gap severity classification",
      "Interview leverage insights",
      "Strategic Bridge Analysis",
      "Alignment history tracking",
    ],
    cta: "Unlock Employer Intelligence™",
    highlighted: true,
    microcopy: "Most users get interview-ready in one session.",
    psychFrame: "You are currently seeing surface-level alignment only.",
  },
];

const Pricing = () => {
  return (
    <div className="container max-w-4xl py-20">
      <div className="mb-14 text-center">
        <h1 className="text-3xl font-bold text-foreground">Precision. Not guesswork.</h1>
        <p className="mt-3 text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
          Most candidates optimize wording. Strategic candidates optimize perception.
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={`rounded-xl border p-8 flex flex-col ${
              tier.highlighted
                ? "border-primary bg-accent shadow-lg"
                : "bg-card"
            }`}
          >
            <div>
              <h3 className="text-base font-semibold text-foreground tracking-tight">{tier.name}</h3>
              {tier.psychFrame && (
                <p className="mt-1 text-[11px] text-destructive/70 font-medium">{tier.psychFrame}</p>
              )}
              {!tier.psychFrame && (
                <p className="mt-1 text-sm text-muted-foreground">{tier.description}</p>
              )}
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
            {tier.microcopy && (
              <p className="mt-2 text-[11px] text-muted-foreground text-center italic">{tier.microcopy}</p>
            )}
          </div>
        ))}
      </div>

      <p className="mt-12 text-center text-sm font-medium text-foreground">
        Hiring managers agree: ATS scores don't get you hired. Signal does.
      </p>

      <p className="mt-4 text-center text-xs text-muted-foreground leading-relaxed">
        Cancel anytime. No contracts. No commitment.<br />
        Every insight is grounded in real resume + job description signals — zero fabrication.
      </p>
    </div>
  );
};

export default Pricing;
