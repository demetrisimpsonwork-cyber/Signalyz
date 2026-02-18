import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import ResultSection from "@/components/ResultSection";
import UpgradeModal from "@/components/UpgradeModal";
import ProInsightsTeaser from "@/components/ProInsightsTeaser";
import { Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDailyUsage } from "@/hooks/useDailyUsage";
import { toast } from "sonner";

const SAMPLE_BULLET = "Managed a team of developers to deliver software projects on time and within budget.";
const SAMPLE_JD = `We are looking for a Senior Project Manager to lead cross-functional engineering teams. 
You will drive delivery of complex SaaS products, improve sprint velocity, 
and mentor junior PMs. Required: Agile/Scrum, stakeholder communication, 
risk management, KPI tracking, CI/CD awareness.`;

interface OptimizationResult {
  optimized_bullet: string;
  match_score: number;
  missing_keywords: string[];
  suggested_verbs: string[];
  alt_a: string;
  alt_b: string;
}

const Index = () => {
  const [bullet, setBullet] = useState("");
  const [jd, setJd] = useState("");
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ bullet?: string; jd?: string }>({});
  const [showUpgrade, setShowUpgrade] = useState(false);
  const { user } = useAuth();

  // TODO: replace with real pro check when Stripe is wired up
  const isPro = false;
  const { remaining, limitReached, increment } = useDailyUsage(isPro);

  const validate = () => {
    const errs: typeof errors = {};
    if (!bullet.trim()) errs.bullet = "Please paste a resume bullet.";
    if (!jd.trim()) errs.jd = "Please paste a job description.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleOptimize = async () => {
    if (!validate()) return;

    if (limitReached) {
      setShowUpgrade(true);
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("optimize-bullet", {
        body: { bullet: bullet.trim(), jd: jd.trim(), userId: user?.id ?? null },
      });

      if (error) throw error;
      setResult(data as OptimizationResult);
      increment();
    } catch (err: any) {
      toast.error(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const fillSample = () => {
    setBullet(SAMPLE_BULLET);
    setJd(SAMPLE_JD);
    setErrors({});
  };

  return (
    <div className="container max-w-6xl py-8">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Optimize your resume bullets
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          AI-powered analysis to match your experience with any job description.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Left — Inputs */}
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Resume bullet</label>
            <Textarea
              placeholder="Paste one resume bullet..."
              value={bullet}
              onChange={(e) => { setBullet(e.target.value); setErrors((p) => ({ ...p, bullet: undefined })); }}
              rows={4}
              className={errors.bullet ? "border-destructive" : ""}
            />
            {errors.bullet && <p className="mt-1 text-xs text-destructive">{errors.bullet}</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Job description</label>
            <Textarea
              placeholder="Paste the job description..."
              value={jd}
              onChange={(e) => { setJd(e.target.value); setErrors((p) => ({ ...p, jd: undefined })); }}
              rows={6}
              className={errors.jd ? "border-destructive" : ""}
            />
            {errors.jd && <p className="mt-1 text-xs text-destructive">{errors.jd}</p>}
          </div>

          {!isPro && (
            <p className="text-xs font-medium text-muted-foreground">
              {remaining > 0
                ? `${remaining} free optimization${remaining !== 1 ? "s" : ""} left today`
                : "You've used all 3 free optimizations today"}
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={handleOptimize} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Optimize
            </Button>
            <Button variant="ghost" size="sm" onClick={fillSample}>
              Try sample
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Paste a single bullet point and the target JD. We'll analyze keyword fit, suggest stronger verbs, and rewrite alternatives.
          </p>
        </div>

        {/* Right — Results */}
        <div className="space-y-4">
          {loading && (
            <div className="flex h-60 items-center justify-center rounded-lg border bg-card">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-sm">Analyzing your bullet…</span>
              </div>
            </div>
          )}

          {!loading && !result && (
            <div className="flex h-60 items-center justify-center rounded-lg border border-dashed bg-card">
              <p className="text-sm text-muted-foreground">Results will appear here</p>
            </div>
          )}

          {result && (
            <>
              <ResultSection title="Optimized Bullet" content={result.optimized_bullet} />
              <ResultSection title="Match Score" content={`${result.match_score}%`} />
              {!isPro && <ProInsightsTeaser />}
              <ResultSection title="Missing Keywords" content={result.missing_keywords} />
              <ResultSection title="Missing Keywords" content={result.missing_keywords} />
              <ResultSection title="Suggested Action Verbs" content={result.suggested_verbs} />
              <ResultSection title="Alternate A — Metric-focused" content={result.alt_a} />
              <ResultSection title="Alternate B — Human-natural" content={result.alt_b} />
            </>
          )}
        </div>
      </div>

      <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} />
    </div>
  );
};

export default Index;
