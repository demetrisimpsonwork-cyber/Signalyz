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
import LevelDeterminationBlock from "@/components/LevelDeterminationBlock";
import DirectorCalibrationBlock, { type DirectorCalibrationResult } from "@/components/DirectorCalibrationBlock";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDailyUsage } from "@/hooks/useDailyUsage";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useReverseTrial } from "@/hooks/useReverseTrial";
import { toast } from "sonner";

type SignalLevel = "Low" | "Moderate" | "High" | "Strong";

interface SampleRole {
  label: string;
  bullet: string;
  jd: string;
  sampleA: string;
  sampleB: string;
  perceptionSnapshot: Record<string, SignalLevel>;
  roleWeightsMost: string[];
  perceptionInsights: string[];
}

const SIGNAL_LEVEL_STYLES: Record<SignalLevel, string> = {
  Low: "bg-destructive/10 text-destructive",
  Moderate: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  High: "bg-primary/10 text-primary",
  Strong: "bg-green-500/10 text-green-700 dark:text-green-400",
};

const SAMPLE_ROLES: SampleRole[] = [
  {
    label: "Customer Success Manager",
    bullet: "Managed a book of business and helped customers adopt the product while resolving support issues.",
    jd: `We are looking for a Customer Success Manager to own post-sale client relationships across a portfolio of mid-market accounts. You will drive adoption, reduce churn, identify expansion opportunities, and serve as the primary point of contact. Required: SaaS customer success experience, renewal ownership, QBR facilitation, CRM fluency, cross-functional coordination with product and support.`,
    sampleA: "Owned post-sale relationships across 45 mid-market accounts ($3.2M ARR), driving product adoption through structured onboarding sequences and quarterly business reviews that surfaced expansion opportunities.",
    sampleB: "Managed a portfolio of mid-market accounts, coordinating onboarding, renewal conversations, and escalation resolution while maintaining 92% gross retention across two renewal cycles.",
    perceptionSnapshot: {
      "Strategic Ownership Signal": "Low",
      "Cross-Functional Authority": "Low",
      "Business Impact Clarity": "Low",
      "Seniority Weight": "Moderate",
    },
    roleWeightsMost: [
      "Portfolio ownership with renewal and expansion accountability",
      "Proactive adoption driving — not reactive support",
      "QBR facilitation and executive-facing communication",
      "Churn reduction as a measurable outcome",
    ],
    perceptionInsights: [
      '"Managed a book of business" signals administrative assignment — this role expects portfolio ownership with revenue accountability.',
      '"Helped customers adopt" reads as support behavior. CSM roles at this level require structured adoption programs and measurable engagement outcomes.',
      '"Resolving support issues" positions you as reactive. The JD weights proactive relationship management and expansion identification.',
    ],
  },
  {
    label: "Operations Lead",
    bullet: "Oversaw daily operations and coordinated across teams to improve efficiency and meet deadlines.",
    jd: `We are looking for an Operations Lead to own end-to-end operational workflows across logistics, fulfillment, and vendor management. You will build scalable processes, manage cross-functional dependencies, and drive measurable efficiency improvements. Required: process design, vendor negotiations, KPI ownership, team leadership, operational reporting to senior management.`,
    sampleA: "Built and owned end-to-end fulfillment workflows across 3 distribution channels, reducing cycle time by 28% through process redesign and vendor SLA renegotiation while reporting operational KPIs to the VP of Operations weekly.",
    sampleB: "Coordinated logistics and fulfillment operations across multiple vendor relationships, implementing process improvements that reduced order-to-delivery time and improving cross-team visibility through structured reporting cadences.",
    perceptionSnapshot: {
      "Strategic Ownership Signal": "Low",
      "Cross-Functional Authority": "Low",
      "Business Impact Clarity": "Low",
      "Seniority Weight": "Low",
    },
    roleWeightsMost: [
      "Process ownership and scalable system design — not coordination",
      "Measurable efficiency outcomes tied to KPIs",
      "Vendor management with negotiation accountability",
      "Operational reporting to senior leadership",
    ],
    perceptionInsights: [
      '"Oversaw daily operations" signals supervision rather than system ownership. The role expects process design and scalable workflow construction.',
      '"Coordinated across teams" reads as facilitation. Operations Lead roles require dependency management and accountability for throughput.',
      '"Improve efficiency" without metrics or method signals aspiration rather than delivery.',
    ],
  },
  {
    label: "Marketing Manager",
    bullet: "Ran marketing campaigns and worked with the design team to create content for social media and email.",
    jd: `We are looking for a Marketing Manager to own demand generation strategy across digital channels. You will plan and execute integrated campaigns, manage marketing budget allocation, analyze funnel performance, and partner with sales to optimize lead quality. Required: B2B demand gen experience, marketing automation (HubSpot/Marketo), budget ownership, funnel analytics, content strategy.`,
    sampleA: "Owned demand generation across paid, organic, and email channels with $180K quarterly budget, building integrated campaign frameworks that generated 340 MQLs per month and reduced CPL by 22% through funnel-stage optimization.",
    sampleB: "Planned and executed multi-channel marketing campaigns across email, social, and paid digital, coordinating with sales on lead handoff processes and reporting campaign performance to marketing leadership monthly.",
    perceptionSnapshot: {
      "Strategic Ownership Signal": "Low",
      "Cross-Functional Authority": "Low",
      "Business Impact Clarity": "Low",
      "Seniority Weight": "Low",
    },
    roleWeightsMost: [
      "Demand generation strategy ownership — not campaign execution",
      "Budget accountability with ROI measurement",
      "Funnel analytics and conversion optimization",
      "Sales partnership on lead quality and handoff",
    ],
    perceptionInsights: [
      '"Ran marketing campaigns" signals task execution. Marketing Manager roles expect strategy ownership and budget accountability.',
      '"Worked with the design team" positions you as a requester, not a strategist. The role requires integrated campaign planning across channels.',
      'No mention of metrics, budget, or funnel impact leaves commercial value invisible.',
    ],
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
  const [mode, setMode] = useState<"alignment" | "director">("alignment");
  const [bullet, setBullet] = useState("");
  const [jd, setJd] = useState("");
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ bullet?: string; jd?: string }>({});
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showSamples, setShowSamples] = useState(false);
  const [selectedSampleRole, setSelectedSampleRole] = useState(0);
  const [additionalContext, setAdditionalContext] = useState("");

  // Director Calibration state
  const [directorExperience, setDirectorExperience] = useState("");
  const [directorResult, setDirectorResult] = useState<DirectorCalibrationResult | null>(null);
  const [directorLoading, setDirectorLoading] = useState(false);
  const [directorError, setDirectorError] = useState<string | null>(null);

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

  const handleDirectorCalibrate = async () => {
    if (!directorExperience.trim()) {
      toast.error("Please paste your resume or experience bullets.");
      return;
    }
    setDirectorLoading(true);
    setDirectorResult(null);
    setDirectorError(null);
    try {
      const { data, error } = await supabase.functions.invoke("director-calibration", {
        body: { experience: directorExperience.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setDirectorResult(data as DirectorCalibrationResult);
    } catch (err: any) {
      const msg = err.message || "Something went wrong. Please try again.";
      setDirectorError(msg);
      toast.error(msg);
    } finally {
      setDirectorLoading(false);
    }
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

  const role = SAMPLE_ROLES[selectedSampleRole];

  return (
    <div className="container max-w-6xl py-8">
      {/* Hero */}
      <div className="mb-6 text-center max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          You already qualify. You just don't read like it yet.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          Most candidates optimize wording. Strategic candidates optimize perception.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="mb-8 flex justify-center">
        <div className="inline-flex rounded-lg border border-border bg-card p-1 gap-1">
          <button
            onClick={() => setMode("alignment")}
            className={`px-4 py-2 rounded-md text-xs font-medium transition-colors ${
              mode === "alignment"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            PM Alignment Engine
          </button>
          <button
            onClick={() => setMode("director")}
            className={`px-4 py-2 rounded-md text-xs font-medium transition-colors ${
              mode === "director"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Director Signal Calibration
          </button>
        </div>
      </div>

      {/* ── Director Calibration Mode ───────────────────────────────────────── */}
      {mode === "director" && (
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Left — Input */}
          <div className="space-y-4">
            <div>
              <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-1">
                Director Signal Calibration Engine v1.1
              </p>
              <h2 className="text-base font-semibold text-foreground mb-1">Evaluate Director-Level Signal Maturity</h2>
              <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                Classifies ownership signals against Director-level thresholds. Detects hiring-stage friction risk, undersignaling, and ownership inflation. No rewriting. No advice. Structured evaluation only.
              </p>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Resume or Experience Input
              </label>
              <p className="mb-1.5 text-xs text-muted-foreground">
                Paste a resume summary, bullet set, or leadership experience section.
              </p>
              <Textarea
                placeholder="Paste your resume bullets, summary, or experience section..."
                value={directorExperience}
                onChange={(e) => setDirectorExperience(e.target.value)}
                rows={12}
              />
            </div>
            <Button
              onClick={handleDirectorCalibrate}
              disabled={directorLoading}
              className="gap-2"
            >
              {directorLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Run Director Calibration
            </Button>
            <p className="text-xs text-muted-foreground">
              Evaluates four ownership dimensions. Maps hiring-stage friction. Reports as a VP-facing diagnostic.
            </p>
          </div>

          {/* Right — Results */}
          <div className="space-y-4">
            {directorLoading && <AlignmentLoader minHeight="260px" />}

            {!directorLoading && !directorResult && (
              <div className="flex h-60 items-center justify-center rounded-lg border border-dashed bg-card">
                <div className="text-center space-y-1.5 px-6">
                  <p className="text-sm text-muted-foreground">Director calibration output will appear here</p>
                  <p className="text-xs text-muted-foreground/60">Dimension evaluation · Signal tier · Hiring friction · Pattern detection</p>
                </div>
              </div>
            )}

            {directorResult && !directorLoading && (
              <DirectorCalibrationBlock result={directorResult} />
            )}
          </div>
        </div>
      )}

      {/* ── PM Alignment Mode ───────────────────────────────────────────────── */}
      {mode === "alignment" && (
        <>
          {/* Before/After comparison */}
          <div className="mb-12 mx-auto max-w-3xl">
            <h2 className="text-lg font-semibold tracking-tight text-foreground mb-6 text-center">
              Same experience. Different signal.
            </h2>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-lg border border-border bg-card p-5 space-y-3 opacity-80">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">How most candidates write it</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Managed cases and resolved customer issues while maintaining documentation.
                </p>
              </div>
              <div className="rounded-lg border border-primary/30 bg-card p-5 space-y-3 shadow-[0_0_20px_-8px_hsl(var(--primary)/0.2)]">
                <p className="text-xs font-semibold uppercase tracking-widest text-primary">After Resumix calibration</p>
                <p className="text-sm text-foreground leading-relaxed">
                  Own end-to-end resolution workflows for 40–70 concurrent cases, resolving 8–15 daily with full SLA accountability and audit-ready documentation — eliminating rework cycles through structured QA protocols.
                </p>
              </div>
            </div>
            <p className="text-center text-sm text-muted-foreground mt-5">
              Same person. Same job. The signal was always there.
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
                <Textarea
                  placeholder="Paste a resume bullet, summary, or short experience section here..."
                  value={bullet}
                  onChange={(e) => { setBullet(e.target.value); setErrors((p) => ({ ...p, bullet: undefined })); }}
                  rows={4}
                  className={errors.bullet ? "border-destructive" : ""}
                />
                {errors.bullet && <p className="mt-1 text-xs text-destructive">{errors.bullet}</p>}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Target Role</label>
                <Textarea
                  placeholder="Paste the full job description you're targeting..."
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
                  {SAMPLE_ROLES.map((r, i) => (
                    <button
                      key={i}
                      onClick={() => fillSample(i)}
                      className="text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground/70">
                Zero fabrication — we only work with what you give us.
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
                  {/* Role label */}
                  <div>
                    <p className="text-xs font-semibold text-foreground mb-0.5">{role.label}</p>
                    <p className="text-xs text-muted-foreground">
                      Diagnostic preview based on the original bullet. Run Alignment to analyze your own experience.
                    </p>
                  </div>

                  {/* Perception Snapshot */}
                  <div className="rounded-lg border bg-card p-4 space-y-3">
                    <h3 className="text-sm font-semibold text-foreground">Perception Snapshot</h3>
                    <p className="text-xs text-muted-foreground">How the original language registers across key hiring signals.</p>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(role.perceptionSnapshot).map(([dimension, level]) => (
                        <div key={dimension} className="rounded-md border bg-background p-2.5 space-y-1">
                          <p className="text-xs text-muted-foreground leading-tight">{dimension}</p>
                          <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${SIGNAL_LEVEL_STYLES[level]}`}>
                            {level}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* What This Role Actually Weighs Most */}
                  <div className="rounded-lg border bg-card p-4 space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">What This Role Actually Weighs Most</h3>
                    <ul className="space-y-1.5">
                      {role.roleWeightsMost.map((theme, i) => (
                        <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                          <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50 mt-1.5" />
                          {theme}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Perception Insight */}
                  <div className="rounded-lg border bg-card p-4 space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">Perception Insight</h3>
                    <p className="text-xs text-muted-foreground mb-2">How the original language may read to a hiring manager.</p>
                    <ul className="space-y-2">
                      {role.perceptionInsights.map((insight, i) => (
                        <li key={i} className="text-xs text-muted-foreground border-l-2 border-border pl-3 leading-relaxed">
                          {insight}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Repositioned versions */}
                  <ResultSection title="Repositioned Version A — Ownership Elevation" content={role.sampleA} />
                  <ResultSection title="Repositioned Version B — Strategic Depth Expansion" content={role.sampleB} />
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
                  {effectiveIsPro && result.alt_a !== result.optimized_bullet && (
                    <ResultSection title="Repositioned Version A — Ownership Elevation" content={result.alt_a} />
                  )}
                  {effectiveIsPro && result.alt_b !== result.optimized_bullet && (
                    <ResultSection title="Repositioned Version B — Strategic Depth Expansion" content={result.alt_b} />
                  )}
                  {(result.alignment_notes || result.gap_suggestions) && (
                    <LevelDeterminationBlock
                      score={result.match_score}
                      alignmentNotes={result.alignment_notes}
                      gapSuggestions={result.gap_suggestions}
                      confidenceLevel={result.alignment_confidence_level}
                    />
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
        </>
      )}

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
