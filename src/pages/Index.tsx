import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import ResultSection from "@/components/ResultSection";
import KeywordChips from "@/components/KeywordChips";
import MatchScoreCard from "@/components/MatchScoreCard";
import ExportResults from "@/components/ExportResults";
import UpgradeModal from "@/components/UpgradeModal";
import ProInsightsTeaser from "@/components/ProInsightsTeaser";
import WeakAlignmentNudge from "@/components/WeakAlignmentNudge";
import { Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDailyUsage } from "@/hooks/useDailyUsage";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { toast } from "sonner";

const SAMPLE_BULLET = "Managed a team of developers to deliver software projects on time and within budget.";
const SAMPLE_JD = `We are looking for a Senior Project Manager to lead cross-functional engineering teams. 
You will drive delivery of complex SaaS products, improve sprint velocity, 
and mentor junior PMs. Required: Agile/Scrum, stakeholder communication, 
risk management, KPI tracking, CI/CD awareness.`;

const SAMPLE_RESULTS = {
  sampleA: "Led a cross-functional engineering team through full project lifecycles, consistently delivering on schedule and within budget while aligning priorities with stakeholders.",
  sampleB: "Coordinated developers across multiple projects, keeping delivery on track and managing scope to meet deadlines and budget targets set by leadership.",
};

interface ScoringBreakdown {
  role_outcomes_alignment: number;
  tools_and_workflow_alignment: number;
  domain_and_context_alignment: number;
  context_and_scale_alignment: number;
  communication_and_leadership_alignment: number;
}

interface OptimizationResult {
  optimized_bullet: string;
  match_score: number;
  alignment_confidence_level?: string;
  missing_keywords: string[];
  suggested_verbs: string[];
  alt_a: string;
  alt_b: string;
  alignment_notes?: string;
  gap_suggestions?: string | null;
  top_matched_signal?: string;
  top_missing_signal?: string;
  score_rationale?: string[];
  scoring_breakdown?: ScoringBreakdown;
  used_signals?: string[];
  removed_or_softened?: string[];
}

const Index = () => {
  const [bullet, setBullet] = useState("");
  const [jd, setJd] = useState("");
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ bullet?: string; jd?: string }>({});
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showSamples, setShowSamples] = useState(false);
  const [additionalContext, setAdditionalContext] = useState("");
  const { user } = useAuth();

  // TODO: replace with real pro check when Stripe is wired up
  const isPro = false;
  const isAdmin = useIsAdmin();
  const { remaining, limitReached, increment } = useDailyUsage(isPro || isAdmin);

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
    setShowSamples(false);

    const mode = isPro || isAdmin ? "multi_bullet" : "single_bullet";

    try {
      const bulletWithContext = additionalContext.trim()
        ? `${bullet.trim()}\n\nAdditional context: ${additionalContext.trim()}`
        : bullet.trim();
      const { data, error } = await supabase.functions.invoke("optimize-bullet", {
        body: { bullet: bulletWithContext, jd: jd.trim(), userId: user?.id ?? null, mode },
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
    setResult(null);
    setShowSamples(true);
  };

  return (
    <div className="container max-w-6xl py-8">
      <div className="mb-8 text-center max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Align your resume to what employers actually prioritize.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          Resumix analyzes job descriptions for weighted priorities and refines your real experience to match — clearly, credibly, and without fabrication.
        </p>
      </div>

      <div className="mb-10 mx-auto max-w-2xl">
        <h2 className="text-lg font-semibold tracking-tight text-foreground mb-6">
          How Resumix Aligns Your Resume
        </h2>
        <ol className="space-y-5">
          {[
            { step: "Detect Employer Priorities", desc: "Analyze the job description for weighting, ownership level, and repeated themes." },
            { step: "Map Your Experience", desc: "Compare your real experience against what the employer emphasized." },
            { step: "Refine for Alignment", desc: "Sharpen wording to naturally mirror high-priority signals — without exaggeration." },
          ].map((item, i) => (
            <li key={i} className="flex gap-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium text-muted-foreground">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">{item.step}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{item.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Left — Inputs */}
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Your Experience</label>
            <p className="mb-1.5 text-xs text-muted-foreground">Paste a bullet, summary, or short section from your resume.</p>
            <Textarea
              placeholder="Paste a bullet, summary, or short section..."
              value={bullet}
              onChange={(e) => { setBullet(e.target.value); setErrors((p) => ({ ...p, bullet: undefined })); }}
              rows={4}
              className={errors.bullet ? "border-destructive" : ""}
            />
            {errors.bullet && <p className="mt-1 text-xs text-destructive">{errors.bullet}</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">The Role You're Applying For</label>
            <p className="mb-1.5 text-xs text-muted-foreground">Paste the job description. We'll analyze what matters most.</p>
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
                ? `${remaining} free alignment${remaining !== 1 ? "s" : ""} left today`
                : (
                  <>
                    You've used your 3 free precision refinements today.
                    <br />
                    <span className="text-primary font-semibold">Upgrade for unlimited intelligent refinements and weighted insight.</span>
                  </>
                )}
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={handleOptimize} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Run Alignment
            </Button>
            <Button variant="ghost" size="sm" onClick={fillSample}>
              Try sample
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Takes 10 seconds. No fluff. No exaggeration. Just sharper alignment.
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

          {!loading && !result && !showSamples && (
            <div className="flex h-60 items-center justify-center rounded-lg border border-dashed bg-card">
              <p className="text-sm text-muted-foreground">Results will appear here</p>
            </div>
          )}

          {!loading && !result && showSamples && (
            <div className="space-y-4">
              <p className="text-xs font-medium text-muted-foreground">
                Here's a preview of what optimized bullets look like. Hit Optimize to get your personalized results.
              </p>
              <ResultSection title="Sample Version A" content={SAMPLE_RESULTS.sampleA} />
              <ResultSection title="Sample Version B" content={SAMPLE_RESULTS.sampleB} />
            </div>
          )}

          {result && (
            <>
              <ResultSection title="Optimized Bullet" content={result.optimized_bullet} />
              <MatchScoreCard
                score={result.match_score}
                confidenceLevel={result.alignment_confidence_level}
                topMatchedSignal={result.top_matched_signal}
                topMissingSignal={result.top_missing_signal}
                scoreRationale={result.score_rationale}
                scoringBreakdown={result.scoring_breakdown}
              />
              {!isPro && <ProInsightsTeaser />}
              <KeywordChips keywords={result.missing_keywords} />
              <ResultSection title="Suggested Action Verbs" content={result.suggested_verbs} />
              {(isPro || isAdmin) && result.alt_a !== result.optimized_bullet && (
                <ResultSection title="Alternate — Impact-focused" content={result.alt_a} />
              )}
              {(isPro || isAdmin) && result.alt_b !== result.optimized_bullet && (
                <ResultSection title="Alternate — Human-natural" content={result.alt_b} />
              )}
              {result.alignment_notes && (
                <ResultSection title="Alignment Intelligence Summary" content={result.alignment_notes} />
              )}
              {result.gap_suggestions && (
                <ResultSection title="Strategic Gap Actions" content={result.gap_suggestions} />
              )}
              {result.match_score < 60 && (
                <WeakAlignmentNudge
                  additionalContext={additionalContext}
                  onContextChange={setAdditionalContext}
                />
              )}
              <ExportResults result={result} />
            </>
          )}
        </div>
      </div>

      <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} />
    </div>
  );
};

export default Index;
