import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

const tiers = [
  {
    name: "Free",
    price: "$0",
    description: "Try it out",
    features: ["5 optimizations/day", "Basic match scoring", "Keyword analysis"],
    cta: "Get started",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$9",
    period: "/mo",
    description: "For active job seekers",
    features: ["Unlimited optimizations", "Advanced AI rewriting", "Dashboard & history", "Priority support"],
    cta: "Upgrade to Pro",
    highlighted: true,
  },
];

const Pricing = () => {
  return (
    <div className="container max-w-4xl py-16">
      <div className="mb-12 text-center">
        <h1 className="text-3xl font-bold text-foreground">Simple pricing</h1>
        <p className="mt-2 text-muted-foreground">Start for free, upgrade when you need more.</p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={`rounded-xl border p-8 ${
              tier.highlighted
                ? "border-primary bg-accent shadow-lg"
                : "bg-card"
            }`}
          >
            <h3 className="text-lg font-semibold text-foreground">{tier.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{tier.description}</p>
            <div className="mt-4">
              <span className="text-4xl font-bold text-foreground">{tier.price}</span>
              {tier.period && <span className="text-muted-foreground">{tier.period}</span>}
            </div>
            <ul className="mt-6 space-y-3">
              {tier.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-foreground">
                  <Check className="h-4 w-4 text-primary" />
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
    </div>
  );
};

export default Pricing;
