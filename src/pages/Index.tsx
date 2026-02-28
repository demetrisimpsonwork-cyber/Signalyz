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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// Define types
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
      "No mention of metrics, budget, or funnel impact leaves commercial value invisible.",
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
    <div className="min-h-screen">
      {/* Hero — subtle gradient only here */}
      <section className="py-20 bg-gradient-to-b from-background to-muted/30">
        <div className="container max-w-2xl text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl leading-tight">
            You already qualify. You just don't read like it yet.
          </h1>
          <p className="mt-4 text-base text-muted-foreground leading-relaxed">
            Most candidates optimize wording. Strategic candidates optimize perception.
          </p>
        </div>
      </section>

      {/* Before/After — static comparison */}
      <section className="py-16 container max-w-3xl">
        <h2 className="text-xl font-semibold tracking-tight text-foreground mb-8 text-center">
          Same experience. Different signal.
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-6 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">How most candidates write it</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Managed cases and resolved customer issues while maintaining documentation.
            </p>
          </div>
          <div className="rounded-xl border border-primary/30 bg-card p-6 space-y-3 shadow-[0_0_24px_-8px_hsl(var(--primary)/0.15)]">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">After Resumix calibration</p>
            <p className="text-sm text-foreground leading-relaxed">
              Own end-to-end resolution workflows for 40–70 concurrent cases, resolving 8–15 daily with full SLA accountability and audit-ready documentation — eliminating rework cycles through structured QA protocols.
            </p>
          </div>
        </div>
        <p className="text-center text-sm text-muted-foreground mt-6">
          Same person. Same job. The signal was always there.
        </p>
      </section>

      {/* Differentiation Statement — dark background */}
      <section className="py-16 bg-foreground">
        <div className="container max-w-2xl text-center">
          <h2 className="text-2xl font-bold text-background tracking-tight sm:text-3xl">
            This isn't resume tailoring.
          </h2>
          <p className="mt-4 text-sm text-background/70 leading-relaxed max-w-xl mx-auto">
            Most tools rewrite your bullets. Resumix diagnoses where your signal breaks — at the recruiter filter, the hiring manager review, the panel interview — and rebuilds your positioning from the threshold up. You can't get this from a ChatGPT prompt.
          </p>
        </div>
      </section>

      {/* Stats — Product fact cards */}
      <section className="py-16 container max-w-3xl">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { title: "7-Layer Signal Engine", sub: "Intent capture through artifact generation." },
            { title: "5-Stage Risk Projection", sub: "From recruiter filter to executive review." },
            { title: "Zero Fabrication", sub: "Your experience, repositioned. Never invented." },
          ].map((card) => (
            <div key={card.title} className="rounded-xl border border-border bg-card p-6 text-center space-y-2">
              <p className="text-lg font-bold text-foreground">{card.title}</p>
              <p className="text-sm text-muted-foreground">{card.sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 container max-w-2xl">
        <h2 className="text-xl font-semibold tracking-tight text-foreground mb-8">
          How PM Resume Intelligence Works
        </h2>
        <ol className="space-y-6">
          {[
            { step: "Detect Employer Priority Signals", desc: "Surface what the role actually weights — ownership scope, strategic depth, cross-functional complexity, and business impact thresholds." },
            { step: "Map Your Experience to Weighted Themes", desc: "Compare how your background reads against each priority signal, identifying where alignment is strong and where perception gaps exist." },
            { step: "Refine for Strategic Alignment", desc: "Sharpen language to reflect ownership, decision authority, and measurable outcomes — without fabrication or inflation." },
          ].map((item, i) => (
            <li key={i} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-medium text-muted-foreground">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">{item.step}</p>
                <p className="mt-1 text-sm text-muted-foreground">{item.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Mode toggle + Tool */}
      <section className="py-16 container max-w-6xl">
        {/* Mode toggle */}
        <div className="mb-10 flex justify-center">
          <div className="inline-flex rounded-lg border border-border bg-card p-1 gap-1">
            <button
              onClick={() => setMode("alignment")}
              className={`px-4 py-2 rounded-md text-xs font-medium transition-colors ${
                mode === "alignment"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Alignment Engine
            </button>
            <button
              onClick={() => setMode("director")}
              className={`px-4 py-2 rounded-md text-xs font-medium transition-colors ${
                mode === "director"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Director Signal Calibration
            </button>
          </div>
        </div>

        {/* Director Calibration Mode */}
        {mode === "director" && (
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-1">
                  Director Signal Calibration Engine v1.1
                </p>
                <h2 className="text-base font-semibold text-foreground mb-1">Evaluate Director-Level Signal Maturity</h2>
                <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                  Classifies ownership signals against Director-level thresholds. Detects hiring-stage friction risk, undersignaling, and ownership inflation.
                </p>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Resume or Experience Input</label>
                <Textarea
                  placeholder="Paste your resume bullets, summary, or experience section..."
                  value={directorExperience}
                  onChange={(e) => setDirectorExperience(e.target.value)}
                  rows={12}
                />
              </div>
              <Button onClick={handleDirectorCalibrate} disabled={directorLoading} className="gap-2">
                {directorLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Run Director Calibration
              </Button>
            </div>
            <div className="space-y-4">
              {directorLoading && <AlignmentLoader minHeight="260px" />}
              {!directorLoading && !directorResult && (
                <div className="flex h-60 items-center justify-center rounded-xl border border-dashed bg-card">
                  <p className="text-sm text-muted-foreground">Director calibration output will appear here</p>
                </div>
              )}
              {directorResult && !directorLoading && <DirectorCalibrationBlock result={directorResult} />}
            </div>
          </div>
        )}

        {/* Alignment Mode */}
        {mode === "alignment" && (
          <>
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
                      : <>You've used your 3 free precision refinements today.<br /><span className="text-primary font-semibold">Upgrade for unlimited intelligent refinements and weighted insight.</span></>
                    }
                  </p>
                )}

                <div className="flex items-center gap-3 flex-wrap">
                  <Button onClick={handleOptimize} disabled={loading} className="gap-2 w-full sm:w-auto">
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
                  <div className="flex h-60 items-center justify-center rounded-xl border border-dashed bg-card">
                    <p className="text-sm text-muted-foreground">Results will appear here</p>
                  </div>
                )}

                {!loading && !result && showSamples && (
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-semibold text-foreground mb-0.5">{role.label}</p>
                      <p className="text-xs text-muted-foreground">Diagnostic preview based on the original bullet.</p>
                    </div>
                    <div className="rounded-xl border bg-card p-4 space-y-3">
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
                    <div className="rounded-xl border bg-card p-4 space-y-2">
                      <h3 className="text-sm font-semibold text-foreground">What This Role Actually Weighs Most</h3>
                      <ul className="space-y-1.5">
                        {role.roleWeightsMost.map((theme, i) => (
                          <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50 mt-1.5" />
                            {theme}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-xl border bg-card p-4 space-y-2">
                      <h3 className="text-sm font-semibold text-foreground">Perception Insight</h3>
                      <ul className="space-y-2">
                        {role.perceptionInsights.map((insight, i) => (
                          <li key={i} className="text-xs text-muted-foreground border-l-2 border-border pl-3 leading-relaxed">{insight}</li>
                        ))}
                      </ul>
                    </div>
                    <ResultSection title="Repositioned Version A — Ownership Elevation" content={role.sampleA} />
                    <ResultSection title="Repositioned Version B — Strategic Depth Expansion" content={role.sampleB} />
                  </div>
                )}

                {result && (
                  <>
                    {/* Section 1: Signal Diagnosis */}
                    <div className="rounded-xl border bg-card p-6 space-y-4">
                      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Signal Diagnosis</h3>
                      <div className="flex items-baseline gap-3">
                        <span className="text-4xl font-bold text-primary">{result.match_score}%</span>
                        {result.alignment_confidence_level && (
                          <span className="text-sm font-medium text-muted-foreground">{result.alignment_confidence_level}</span>
                        )}
                      </div>
                      {result.top_missing_signal && (
                        <p className="text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">Top gap:</span> {result.top_missing_signal}
                        </p>
                      )}
                      {result.score_rationale && result.score_rationale.length > 0 && (
                        <ul className="space-y-1">
                          {result.score_rationale.map((r, i) => (
                            <li key={i} className="text-xs text-muted-foreground">• {r}</li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Section 2: Calibrated Bullets */}
                    <div className="space-y-3">
                      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Calibrated Bullets</h3>
                      <div className="rounded-xl border bg-card p-5 space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-1">
                            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Original</p>
                            <p className="text-sm text-muted-foreground leading-relaxed">{bullet}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[10px] uppercase tracking-widest text-primary font-medium">Calibrated</p>
                            <p className="text-sm text-foreground leading-relaxed">{result.optimized_bullet}</p>
                          </div>
                        </div>
                      </div>
                      {effectiveIsPro && result.alt_a !== result.optimized_bullet && (
                        <ResultSection title="Repositioned Version A — Ownership Elevation" content={result.alt_a} />
                      )}
                      {effectiveIsPro && result.alt_b !== result.optimized_bullet && (
                        <ResultSection title="Repositioned Version B — Strategic Depth Expansion" content={result.alt_b} />
                      )}
                    </div>

                    {!effectiveIsPro && <ProInsightsTeaser />}
                    {result.identity_strength_index && (
                      <IdentityStrengthIndex
                        data={result.identity_strength_index}
                        isPro={effectiveIsPro}
                        onUpgrade={() => setShowUpgrade(true)}
                      />
                    )}
                    <KeywordChips keywords={result.missing_keywords} />
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

                    {/* Section 3: Export */}
                    <ExportResults result={result} />
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </section>

      {/* FAQ */}
      <section className="py-16 container max-w-2xl">
        <h2 className="text-xl font-semibold tracking-tight text-foreground mb-8 text-center">
          Frequently Asked Questions
        </h2>
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="fabrication">
            <AccordionTrigger className="text-sm text-foreground hover:no-underline">
              Does Resumix make things up?
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
              Never. Resumix only works with what you give it. The engine repositions your real experience using stronger language and role-native framing — it never fabricates skills, roles, or accomplishments you don't have. Zero fabrication is a core product principle, not a feature.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="chatgpt">
            <AccordionTrigger className="text-sm text-foreground hover:no-underline">
              How is this different from ChatGPT or other AI tools?
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
              ChatGPT rewrites. Resumix calibrates. We analyze your signal against institutional hiring thresholds, identify exactly where your profile breaks down at each stage of the hiring process, and reconstruct your positioning from the ground up. The output isn't a better-worded resume — it's a recalibrated professional identity.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="ats">
            <AccordionTrigger className="text-sm text-foreground hover:no-underline">
              Is this just ATS keyword stuffing?
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
              No. ATS keyword matching is a surface-level tactic that experienced hiring managers see through immediately. Resumix calibrates how your actual experience reads to a human reviewer — the recruiter scanning for ownership signal, the hiring manager assessing strategic depth, the panel evaluating execution maturity. Keywords are one output. Perception is the goal.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>

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
