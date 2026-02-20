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
import IdentityStrengthIndex from "@/components/IdentityStrengthIndex";
import { Loader2, Sparkles } from "lucide-react";
import AlignmentLoader from "@/components/AlignmentLoader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDailyUsage } from "@/hooks/useDailyUsage";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useReverseTrial } from "@/hooks/useReverseTrial";
import { toast } from "sonner";

const SAMPLE_ROLES = [
  {
    label: "Senior Product Manager – SaaS Platform",
    bullet: "Worked with engineering and design to ship new product features and helped define the product roadmap.",
    jd: `We are looking for a Senior Product Manager to own the end-to-end product lifecycle for our core SaaS platform. You will define strategy, align cross-functional teams across engineering, design, and go-to-market, drive adoption metrics, and present roadmap decisions to executive leadership. Required: B2B SaaS experience, data-driven prioritization, stakeholder influence, OKR frameworks, Agile/Scrum.`,
    sampleA: "Owned the end-to-end product lifecycle for a core SaaS platform, translating executive strategy into a prioritized roadmap that aligned engineering, design, and GTM stakeholders across three concurrent release cycles.",
    sampleB: "Defined and drove the product roadmap for a B2B SaaS platform, leading cross-functional alignment between engineering and design while using OKR frameworks to connect feature delivery to adoption and retention outcomes.",
  },
  {
    label: "Technical Project Manager – AI Infrastructure",
    bullet: "Managed timelines and coordinated between engineering teams to keep AI projects on track.",
    jd: `We are looking for a Technical Project Manager to lead delivery of large-scale AI infrastructure initiatives. You will manage dependencies across ML, platform, and data engineering teams, track technical risk, and ensure milestone accountability at pace. Required: MLOps or data pipeline experience, technical fluency, cross-team dependency management, risk mitigation, stakeholder reporting.`,
    sampleA: "Led delivery of AI infrastructure initiatives spanning ML, platform, and data engineering, managing cross-team dependencies and surfacing technical risk to ensure milestone accountability at scale.",
    sampleB: "Coordinated delivery across ML, data, and platform engineering workstreams on AI infrastructure programs, proactively managing blockers and providing structured progress visibility to senior stakeholders.",
  },
  {
    label: "Group Product Manager – B2B Growth",
    bullet: "Led a team of PMs and worked on improving revenue metrics and expanding into new customer segments.",
    jd: `We are looking for a Group Product Manager to lead a team of PMs focused on B2B growth. You will own revenue expansion strategy, build business cases for new market segments, coach direct reports, and operate as a strategic partner to sales and marketing leadership. Required: B2B growth experience, GM-level business acumen, PM leadership, market sizing, executive communication.`,
    sampleA: "Led a team of PMs owning B2B revenue expansion, developing business cases for new market segments and operating as a strategic partner to sales and marketing leadership to drive measurable ARR growth.",
    sampleB: "Managed a PM team responsible for B2B growth strategy, translating market opportunities into structured roadmaps and coaching direct reports while maintaining executive alignment on revenue outcomes.",
  },
];



interface ScoringBreakdown {
  role_outcomes_alignment: number;
  tools_and_workflow_alignment: number;
  domain_and_context_alignment: number;
  context_and_scale_alignment: number;
  communication_and_leadership_alignment: number;
}

interface ISIPillar {
  name: string;
  score: number;
  explanation: string;
  improvement_lever: string;
}

interface IdentityStrengthIndexData {
  total_score: number;
  pillars: ISIPillar[];
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
  identity_strength_index?: IdentityStrengthIndexData;
}

const Index = () => {
  const [bullet, setBullet] = useState("");
  const [jd, setJd] = useState("");
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ bullet?: string; jd?: string }>({});
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showSamples, setShowSamples] = useState(false);
  const [selectedSampleRole, setSelectedSampleRole] = useState(0);
  const [additionalContext, setAdditionalContext] = useState("");
  const { user } = useAuth();

  // TODO: replace with real pro check when Stripe is wired up
  const isPro = false;
  const isAdmin = useIsAdmin();
  const {
    trialStarted,
    trialRunsUsed,
    trialExhausted,
    isTrialPro,
    startTrial,
    incrementTrialRun,
    TRIAL_LIMIT,
  } = useReverseTrial();
  const effectiveIsPro = isPro || isAdmin || isTrialPro;
  const { remaining, limitReached, increment } = useDailyUsage(effectiveIsPro);

  const validate = () => {
    const errs: typeof errors = {};
    if (!bullet.trim()) errs.bullet = "Please paste a resume bullet.";
    if (!jd.trim()) errs.jd = "Please paste a job description.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleOptimize = async () => {
    if (!validate()) return;

    if (limitReached && !isTrialPro) {
      setShowUpgrade(true);
      return;
    }

    setLoading(true);
    setResult(null);
    setShowSamples(false);

    const mode = effectiveIsPro ? "multi_bullet" : "single_bullet";

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
      if (isTrialPro) incrementTrialRun();
    } catch (err: any) {
      toast.error(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const fillSample = (roleIndex = selectedSampleRole) => {
    const role = SAMPLE_ROLES[roleIndex];
    setBullet(role.bullet);
    setJd(role.jd);
    setErrors({});
    setResult(null);
    setShowSamples(true);
    setSelectedSampleRole(roleIndex);
  };

  return (
    <div className="container max-w-6xl py-8">
      {/* Hero */}
      <div className="mb-8 text-center max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Strategic Resume Intelligence for Product &amp; Project Leaders
        </h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          Hiring for PM roles is risk evaluation. Resumix analyzes how your experience is actually perceived — not just how it's written.
        </p>
      </div>

      {/* How it works */}
      <div className="mb-10 mx-auto max-w-2xl">
        <h2 className="text-lg font-semibold tracking-tight text-foreground mb-6">
          How PM Resume Intelligence Works
        </h2>
        <ol className="space-y-5">
          {[
            {
              step: "Detect Employer Priority Signals",
              desc: "Surface what the role actually weights — ownership scope, strategic depth, cross-functional complexity, and business impact thresholds.",
            },
            {
              step: "Map Your Experience to Weighted Themes",
              desc: "Compare how your background reads against each priority signal, identifying where alignment is strong and where perception gaps exist.",
            },
            {
              step: "Refine for Strategic Alignment",
              desc: "Sharpen language to reflect ownership, decision authority, and measurable outcomes — without fabrication or inflation.",
            },
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

          {!effectiveIsPro && (
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

          <div className="flex items-center gap-3 flex-wrap">
            <Button onClick={handleOptimize} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Run Alignment
            </Button>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Try sample:</span>
              {SAMPLE_ROLES.map((role, i) => (
                <button
                  key={i}
                  onClick={() => fillSample(i)}
                  className="text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {role.label.split(" – ")[0].replace("Senior ", "Sr. ").replace("Group ", "GPM ").replace("Technical ", "TPM ")}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Takes 10–40 seconds. No fluff. No exaggeration. Just sharper alignment.
          </p>
        </div>

        {/* Right — Results */}
        <div className="space-y-4">
          {loading && <AlignmentLoader minHeight="260px" />}

          {!loading && !result && !showSamples && (
            <div className="flex h-60 items-center justify-center rounded-lg border border-dashed bg-card">
              <p className="text-sm text-muted-foreground">Results will appear here</p>
            </div>
          )}

          {!loading && !result && showSamples && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-foreground mb-0.5">
                  {SAMPLE_ROLES[selectedSampleRole].label}
                </p>
                <p className="text-xs text-muted-foreground">
                  Preview of what aligned positioning looks like for this role. Run Alignment to analyze your own experience.
                </p>
              </div>
              <ResultSection title="Alignment Version A — Strategic Ownership" content={SAMPLE_ROLES[selectedSampleRole].sampleA} />
              <ResultSection title="Alignment Version B — Cross-functional Depth" content={SAMPLE_ROLES[selectedSampleRole].sampleB} />
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
              {!effectiveIsPro && <ProInsightsTeaser />}
              {result.identity_strength_index && (
                <IdentityStrengthIndex
                  data={result.identity_strength_index}
                  isPro={effectiveIsPro}
                  onUpgrade={() => setShowUpgrade(true)}
                />
              )}
              <KeywordChips keywords={result.missing_keywords} />
              <ResultSection title="Suggested Action Verbs" content={result.suggested_verbs} />
              {effectiveIsPro && result.alt_a !== result.optimized_bullet && (
                <ResultSection title="Alternate — Impact-focused" content={result.alt_a} />
              )}
              {effectiveIsPro && result.alt_b !== result.optimized_bullet && (
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

      <UpgradeModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        trialStarted={trialStarted}
        trialRunsUsed={trialRunsUsed}
        trialLimit={TRIAL_LIMIT}
        onStartTrial={!trialStarted && !trialExhausted ? startTrial : undefined}
      />
    </div>
  );
};

export default Index;

