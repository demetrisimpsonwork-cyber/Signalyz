import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { initiateCheckout } from "@/utils/stripe";
import { useAuth } from "@/hooks/useAuth";
import { trackEvent } from "@/lib/analytics";

const Pricing = () => {
  const { user } = useAuth();
  const isAuthenticated = !!user;
  const [showSticky, setShowSticky] = useState(false);

  useEffect(() => {
    trackEvent("pricing_viewed");
  }, []);

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
          Every paid export is checked against the Signalyzed Standard — grounded in your resume and the role, not generic AI rewrite.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Free tier */}
        <div className="rounded-xl border p-6 sm:p-8 flex flex-col bg-card">
          <div>
            <h3 className="text-base font-semibold tracking-tight text-foreground">Free Signal Preview</h3>
            <p className="mt-1 text-sm text-muted-foreground">See your score and #1 blocker — no card required.</p>
          </div>
          <div className="mt-4">
            <span className="text-4xl font-bold text-foreground">$0</span>
          </div>
          <ul className="mt-6 space-y-3 flex-1">
            {[
              "3 signal previews per day",
              "Match score + risk read",
              "Your #1 rejection reason",
              "1 reframed bullet example",
              "No calibrated export",
            ].map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-foreground">
                <Check className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                {f}
              </li>
            ))}
          </ul>
          {isAuthenticated ? (
            <Button className="mt-8 w-full" variant="outline" asChild>
              <a href="/">Start Free Preview</a>
            </Button>
          ) : (
            <Button className="mt-8 w-full" variant="outline" asChild>
              <a href="/auth">Start Free Preview</a>
            </Button>
          )}
        </div>

        {/* Active Job Search $19/mo — highlighted as best value */}
        <div className="rounded-xl border border-primary p-6 sm:p-8 flex flex-col bg-[#0F1C2E] text-white shadow-lg relative">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full tracking-wide uppercase">
            Best Value
          </div>
          <div>
            <h3 className="text-base font-semibold tracking-tight text-white">Active Job Search</h3>
            <p className="mt-1 text-sm text-white/60">Multiple roles, full exports, saved progress.</p>
          </div>
          <div className="mt-4">
            <span className="text-4xl font-bold text-white">$19</span>
            <span className="text-white/60">/mo</span>
          </div>
          <ul className="mt-6 space-y-3 flex-1">
            {[
              "Unlimited resume analyses",
              "Full Hiring Report + calibrated resume exports",
              "Cover letter, LinkedIn, interview prep",
              "Saved analysis history",
              "Full Signalyzed Standard on every paid export",
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
              onClick={() => {
                trackEvent("upgrade_clicked", { payment_mode: "subscription", source: "pricing" });
                initiateCheckout("subscription");
              }}
            >
              Active Job Search — $19/mo
            </Button>
          ) : (
            <Button className="mt-8 w-full" variant="default" asChild>
              <a href="/auth">Get Started</a>
            </Button>
          )}

        </div>

        {/* Final Apply Check $9 */}
        <div className="rounded-xl border p-6 sm:p-8 flex flex-col bg-card">
          <div>
            <h3 className="text-base font-semibold tracking-tight text-foreground">Final Apply Check</h3>
            <p className="mt-1 text-sm text-muted-foreground">One target role. Full Standard check. Export-ready resume.</p>
          </div>
          <div className="mt-4">
            <span className="text-4xl font-bold text-foreground">$9</span>
            <span className="text-muted-foreground text-sm ml-1">one-time</span>
          </div>
          <ul className="mt-6 space-y-3 flex-1">
            {[
              "1 resume + job description",
              "Full Hiring Report for that role",
              "Calibrated resume DOCX download",
              "Cover letter for that role",
              "Return to the same resume + role anytime with the same inputs",
            ].map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-foreground">
                <Check className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                {f}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
            One application, one unlock. New role = new check.
          </p>
          {isAuthenticated ? (
            <Button
              className="mt-4 w-full"
              variant="outline"
              onClick={() => {
                trackEvent("one_time_report_clicked", { payment_mode: "one_time", source: "pricing" });
                initiateCheckout("one_time");
              }}
            >
              Final Apply Check — $9
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
        Every insight is grounded in real resume + job description signals — designed to avoid unsupported claims.
      </p>

      {/* Sticky mobile CTA */}
      <div className={`fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background/95 backdrop-blur border-t border-border px-4 py-3 transition-transform duration-300 ${showSticky ? "translate-y-0" : "translate-y-full"}`}>
        {isAuthenticated ? (
          <div className="space-y-2">
            <Button className="w-full" size="lg" onClick={() => {
              trackEvent("upgrade_clicked", { payment_mode: "subscription", source: "pricing_sticky" });
              initiateCheckout("subscription");
            }}>
              Active Job Search — $19/mo
            </Button>
            <Button className="w-full" size="sm" variant="outline" onClick={() => {
              trackEvent("one_time_report_clicked", { payment_mode: "one_time", source: "pricing_sticky" });
              initiateCheckout("one_time");
            }}>
              Final Apply Check — $9
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
