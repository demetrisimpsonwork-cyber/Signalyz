import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { initiateCheckout } from "@/utils/stripe";
import { useAuth } from "@/hooks/useAuth";

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
    <div className="container max-w-6xl py-20 px-4 pb-32 md:pb-20" style={{ background: 'radial-gradient(1000px circle at 50% -15%, rgba(20,184,166,0.22) 0%, rgba(20,184,166,0.09) 20%, rgba(20,184,166,0.03) 40%, transparent 55%)' }}>
      <div className="mb-14 text-center space-y-4">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Precision. Not guesswork.</h1>
        <div className="space-y-3 max-w-[600px] mx-auto">
          <p className="text-base font-medium text-foreground leading-relaxed">Know exactly why you're not getting interviews.</p>
          <p className="text-base font-medium text-foreground leading-relaxed">See how hiring managers actually read your experience.</p>
          <p className="text-base font-medium text-foreground leading-relaxed">Get the repositioned version of your resume — same experience, stronger signal.</p>
        </div>
        <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
          Most candidates optimize wording. Strategic candidates optimize perception.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Free tier */}
        <div className="rounded-xl border p-6 sm:p-8 flex flex-col bg-card">
          <div>
            <h3 className="text-base font-semibold tracking-tight text-foreground">Signal Preview</h3>
            <p className="mt-1 text-sm text-muted-foreground">Surface-level alignment diagnostics</p>
          </div>
          <div className="mt-4">
            <span className="text-4xl font-bold text-foreground">$0</span>
          </div>
          <ul className="mt-6 space-y-3 flex-1">
            {[
              "3 signal alignments per day",
              "Calibrated bullet (1 version)",
              "Overall alignment score",
              "Top signal gap identification",
            ].map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-foreground">
                <Check className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                {f}
              </li>
            ))}
          </ul>
          {isAuthenticated ? (
            <Button className="mt-8 w-full" variant="outline" asChild>
              <a href="/">Get started</a>
            </Button>
          ) : (
            <Button className="mt-8 w-full" variant="outline" asChild>
              <a href="/auth">Get started</a>
            </Button>
          )}
        </div>

        {/* Pro $19/mo — highlighted as best value */}
        <div className="rounded-xl border border-primary p-6 sm:p-8 flex flex-col bg-[#0F1C2E] text-white shadow-lg relative">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full tracking-wide uppercase">
            Best Value
          </div>
          <div>
            <h3 className="text-base font-semibold tracking-tight text-white">Full Signal Intelligence</h3>
            <p className="mt-1 text-sm text-white/60">Full signal calibration engine</p>
          </div>
          <div className="mt-4">
            <span className="text-4xl font-bold text-white">$19</span>
            <span className="text-white/60">/mo</span>
          </div>
          <ul className="mt-6 space-y-3 flex-1">
            {[
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
            ].map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-white/90">
                <Check className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                {f}
              </li>
            ))}
          </ul>


          {isAuthenticated ? (
            <Button
              className="mt-3 w-full"
              variant="default"
              onClick={() => initiateCheckout("subscription")}
            >
               Unlock Full Signal Intelligence → $19/mo
            </Button>
          ) : (
            <Button className="mt-8 w-full" variant="default" asChild>
              <a href="/auth">Get Started</a>
            </Button>
          )}

        </div>

        {/* One-time $9 */}
        <div className="rounded-xl border p-6 sm:p-8 flex flex-col bg-card">
          <div>
            <h3 className="text-base font-semibold tracking-tight text-foreground">Single Report</h3>
            <p className="mt-1 text-sm text-muted-foreground">One complete analysis session</p>
          </div>
          <div className="mt-4">
            <span className="text-4xl font-bold text-foreground">$9</span>
            <span className="text-muted-foreground text-sm ml-1">one-time</span>
          </div>
          <ul className="mt-6 space-y-3 flex-1">
            {[
              "1 full signal analysis",
              "Complete Signal Diagnosis",
              "Calibrated Resume output",
              "Cover Letter generation",
              "Full positioning report",
            ].map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-foreground">
                <Check className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                {f}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
            Perfect for a single job application. Unlocks one full run — no recurring charges.
          </p>
          {isAuthenticated ? (
            <Button
              className="mt-4 w-full"
              variant="outline"
              onClick={() => initiateCheckout("one_time")}
            >
              One-time full report — $9
            </Button>
          ) : (
            <Button className="mt-4 w-full" variant="outline" asChild>
              <a href="/auth">Get Started</a>
            </Button>
          )}
        </div>
      </div>

      <p className="mt-12 text-center text-sm font-medium text-foreground">
        Hiring managers agree: ATS scores don't get you hired. Signal does.
      </p>

      <p className="mt-4 text-center text-xs text-muted-foreground leading-relaxed">
        Every insight is grounded in real resume + job description signals — zero fabrication.
      </p>

      {/* Sticky mobile CTA */}
      <div className={`fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background/95 backdrop-blur border-t border-border px-4 py-3 transition-transform duration-300 ${showSticky ? "translate-y-0" : "translate-y-full"}`}>
        {isAuthenticated ? (
          <div className="space-y-2">
            <Button className="w-full" size="lg" onClick={() => initiateCheckout("subscription")}>
              Unlock Full Signal Intelligence → $19/mo
            </Button>
            <Button className="w-full" size="sm" variant="outline" onClick={() => initiateCheckout("one_time")}>
              One-time full report — $9
            </Button>
          </div>
        ) : (
          <Button className="w-full" size="lg" asChild>
            <a href="/auth">Get Started</a>
          </Button>
        )}
      </div>
    </div>
  );
};

export default Pricing;
