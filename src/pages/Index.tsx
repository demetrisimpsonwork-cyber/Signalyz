import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import ResultSection from "@/components/ResultSection";
import KeywordChips from "@/components/KeywordChips";
import MatchScoreCard from "@/components/MatchScoreCard";
import ExportResults from "@/components/ExportResults";
import UpgradeModal from "@/components/UpgradeModal";
import ResumeBuilder from "@/components/ResumeBuilder";
import ResumeUpload from "@/components/ResumeUpload";
import ProInsightsTeaser from "@/components/ProInsightsTeaser";
import WeakAlignmentNudge from "@/components/WeakAlignmentNudge";
import IdentityStrengthIndex from "@/components/IdentityStrengthIndex";
import { Loader2, Sparkles, Layers, Shield, LockKeyhole, ArrowDown, Quote } from "lucide-react";
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
    bullet: `Managed a portfolio of 45 SMB accounts — handling onboarding, renewal conversations, and escalation resolution for SaaS customers across e-commerce and retail verticals. Led quarterly business reviews with key accounts, identifying expansion opportunities and flagging churn risk before renewal cycles. Built internal playbooks for common escalation scenarios that reduced time-to-resolution by standardizing the first response protocol. Collaborated with product and support teams to route recurring customer complaints into the roadmap feedback process.`,
    jd: `We are looking for a Customer Success Manager to own a portfolio of 50-75 mid-market accounts. You will drive retention, lead QBRs, identify expansion opportunities, and serve as the primary relationship owner. Required: CRM experience, proven renewal track record, strong written communication.`,
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
      '"Managed a portfolio of 45 SMB accounts" signals administrative assignment — this role expects portfolio ownership with revenue accountability.',
      '"Led quarterly business reviews" reads as facilitation, not strategic ownership. CSM roles at this level require structured adoption programs with measurable engagement outcomes.',
      '"Collaborated with product and support teams" positions you as a participant. The JD weights proactive relationship management and expansion identification.',
    ],
  },
  {
    label: "Operations Lead",
    bullet: `Oversaw daily operations for a 12-person remote support team — managing scheduling, workflow distribution, and SLA compliance across three product lines. Redesigned the ticket routing process to reduce misassignment rate and improve first-contact resolution. Maintained vendor relationships with three external service partners, negotiating SLAs and reviewing monthly performance against agreed benchmarks. Reported weekly operational metrics to senior leadership and flagged process gaps with proposed solutions.`,
    jd: `Seeking an Operations Lead to manage day-to-day team workflows, own vendor relationships, and drive process improvement across our support infrastructure. Must be comfortable with data reporting, cross-functional coordination, and managing remote teams.`,
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
      '"Redesigned the ticket routing process" is closer to ownership language but lacks measurable outcomes. Operations Lead roles require process architecture that drives measurable efficiency gains.',
      '"Reported weekly operational metrics" reads as compliance, not leadership. The JD requires dependency management with accountability for throughput.',
    ],
  },
  {
    label: "Marketing Manager",
    bullet: `Led integrated campaigns across email, paid social, and organic channels for a B2B SaaS company targeting HR and finance decision-makers. Managed a $120K quarterly campaign budget and reported ROI to VP of Marketing monthly. Built and maintained the content calendar, coordinating with design, product, and sales to align messaging. Tracked funnel performance in HubSpot — identifying drop-off points and testing variations to improve conversion rates.`,
    jd: `Looking for a Marketing Manager to own demand generation strategy across digital channels. Plan and execute integrated campaigns, manage budget allocation, analyze funnel performance, partner with sales to optimize lead quality. Required: B2B demand gen, HubSpot/Marketo, budget ownership, funnel analytics.`,
    sampleA: "Owned demand generation across paid, organic, and email channels with $120K quarterly budget, building integrated campaign frameworks that generated 340 MQLs per month and reduced CPL by 22% through funnel-stage optimization.",
    sampleB: "Planned and executed multi-channel marketing campaigns across email, social, and paid digital, coordinating with sales on lead handoff processes and reporting campaign performance to marketing leadership monthly.",
    perceptionSnapshot: {
      "Strategic Ownership Signal": "Moderate",
      "Cross-Functional Authority": "Low",
      "Business Impact Clarity": "Moderate",
      "Seniority Weight": "Low",
    },
    roleWeightsMost: [
      "Demand generation strategy ownership — not campaign execution",
      "Budget accountability with ROI measurement",
      "Funnel analytics and conversion optimization",
      "Sales partnership on lead quality and handoff",
    ],
    perceptionInsights: [
      '"Led integrated campaigns" signals execution ownership, but "led" needs to be reinforced with strategic framing. Marketing Manager roles expect strategy ownership and budget accountability.',
      '"Managed a $120K quarterly campaign budget" is strong commercial signal but needs outcome attribution. The role requires integrated campaign planning across channels with measurable ROI.',
      '"Tracked funnel performance in HubSpot" is reporting, not analytics ownership. No mention of conversion optimization strategy leaves strategic value partially visible.',
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
  inferred_role_title?: string;
}

function getSessionToken(): string {
  const key = "resumix_session_token";
  let token = localStorage.getItem(key);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(key, token);
  }
  return token;
}

// ─── Animated count-up hook ──────────────────────────────────────────────────

function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    if (target <= 0) { setValue(0); return; }
    const start = performance.now();
    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out quad
      const eased = 1 - (1 - progress) * (1 - progress);
      setValue(Math.round(eased * target));
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return value;
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
  const [scoreRevealed, setScoreRevealed] = useState(false);

  // Executive Audit state
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

  const animatedScore = useCountUp(result?.match_score ?? 0, 1200);

  // Reset scoreRevealed when result changes
  useEffect(() => {
    if (result) {
      setScoreRevealed(false);
      const t = setTimeout(() => setScoreRevealed(true), 500);
      return () => clearTimeout(t);
    }
  }, [result]);

  const validate = () => {
    const errs: typeof errors = {};
    if (!bullet.trim()) {
      errs.bullet = "Add your experience and target role to run your signal analysis.";
    } else if (bullet.trim().length < 20) {
      errs.bullet = "Experience must be at least 20 characters.";
    }
    if (!jd.trim()) {
      errs.jd = "Add your experience and target role to run your signal analysis.";
    } else if (jd.trim().length < 20) {
      errs.jd = "Job description must be at least 20 characters.";
    }
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
      const sessionToken = user ? undefined : getSessionToken();
      const { data, error } = await supabase.functions.invoke("optimize-bullet", {
        body: { bullet: bulletWithContext, jd: jd.trim(), userId: user?.id ?? null, mode, sessionToken },
      });
      if (error) throw error;
      setResult(data as OptimizationResult);
      increment();
      if (isTrialPro) incrementTrialRun();
      // Guest nudge after first alignment
      if (!user) {
        toast("Save your results and track your progress", {
          description: "Create a free account to keep your alignment history.",
          action: { label: "Sign up", onClick: () => { window.location.href = "/auth"; } },
          duration: 8000,
        });
      }
    } catch (err: any) {
      const msg = err.message || "Something went wrong. Please try again.";
      if (msg.toLowerCase().includes("timeout") || msg.toLowerCase().includes("timed out")) {
        toast.error("Signal analysis is taking longer than expected. Hang tight — complex resumes take up to 60 seconds.");
      } else {
        toast.error(msg);
      }
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
      {/* Hero — deep navy */}
      <section className="py-20 bg-[#0F1C2E] relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0F1C2E] via-[#132438] to-[#0F1C2E] opacity-80" />
        <div className="container max-w-2xl text-center relative z-10">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl leading-tight">
            You already qualify. You just don't <span className="text-primary">read like it</span> yet.
          </h1>
          <p className="mt-4 text-base text-white/70 leading-relaxed">
            Most candidates optimize wording. Strategic candidates optimize <span className="text-primary font-medium">perception</span>.
          </p>
          <Button
            size="lg"
            className="mt-8"
            onClick={() => document.getElementById("alignment-tool")?.scrollIntoView({ behavior: "smooth" })}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Run Your Signal Analysis
          </Button>
        </div>
      </section>

      {/* Before/After Transformation Showcase */}
      <section className="py-16 container max-w-3xl">
        <div className="text-center mb-10">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Same experience. Different signal.
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">Resumix doesn't invent. It repositions.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-xl bg-[#2A2A2A] p-6 space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">BEFORE</p>
            <p className="text-sm text-gray-300 leading-relaxed">
              Managed customer inquiries and helped resolve issues for business clients while maintaining documentation.
            </p>
          </div>
          {/* Arrow for mobile */}
          <div className="flex justify-center md:hidden">
            <ArrowDown className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="rounded-xl bg-card border-l-4 border-l-primary p-6 space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">AFTER RESUMIX</p>
            <p className="text-sm text-foreground leading-relaxed">
              Served as primary resolution contact for 40-70 concurrent B2B cases under strict SLA requirements — translating compliance and procedural complexity into clear, actionable guidance for business owners and HR administrators.
            </p>
          </div>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-6">
          Zero fabrication. Every word came from the original.
        </p>
      </section>

      {/* Testimonial */}
      <section className="py-8 container max-w-2xl">
        <div className="rounded-xl bg-[#0F1C2E] p-8 relative">
          <Quote className="h-8 w-8 text-primary/40 absolute top-6 left-6" />
          <div className="pl-8">
            <p className="text-white text-sm leading-relaxed italic">
              "I ran my own resume and found out exactly why I wasn't hearing back on senior roles. The gap was real, specific, and fixable in one sitting."
            </p>
            <p className="mt-4 text-white/70 text-xs font-medium">— D.S., Resumix founder & early user</p>
            <p className="mt-1 text-white/40 text-[10px] italic">Results based on actual engine output.</p>
          </div>
        </div>
      </section>

      {/* Differentiation Statement — dark background */}
      <section className="py-16 bg-[#0F1C2E]">
        <div className="container max-w-2xl text-center">
          <h2 className="text-2xl font-bold text-white tracking-tight sm:text-3xl">
            This isn't resume tailoring.
          </h2>
          <p className="mt-4 text-sm text-white/70 leading-relaxed max-w-xl mx-auto">
            Most tools rewrite your bullets. Resumix diagnoses where your signal breaks — at the recruiter filter, the hiring manager review, the panel interview — and rebuilds your positioning from the threshold up. You can't get this from a ChatGPT prompt.
          </p>
        </div>
      </section>

      {/* Feature Cards with icons */}
      <section className="py-16 container max-w-3xl">
        <div className="grid gap-7 md:grid-cols-3">
          {[
            { title: "7-Layer Signal Engine", sub: "Intent capture through artifact generation.", icon: Layers },
            { title: "5-Stage Risk Projection", sub: "From recruiter filter to executive review.", icon: Shield },
            { title: "Zero Fabrication", sub: "Your experience, repositioned. Never invented.", icon: LockKeyhole },
          ].map((card) => (
            <div key={card.title} className="rounded-xl border border-border bg-card p-5 text-center space-y-3">
              <card.icon className="h-6 w-6 text-primary mx-auto" strokeWidth={1.5} />
              <p className="text-lg font-bold text-foreground">{card.title}</p>
              <p className="text-sm text-muted-foreground">{card.sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 container max-w-2xl">
        <h2 className="text-xl font-semibold tracking-tight text-foreground mb-8 mt-4" style={{ letterSpacing: "0.02em" }}>
          How Resumix Works
        </h2>
        <ol className="space-y-7">
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
      <section id="alignment-tool" className="py-16 container max-w-6xl">
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
              Executive Signal Audit
            </button>
          </div>
        </div>

        {/* Executive Signal Audit Mode */}
        {mode === "director" && (
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-1">
                  Executive Signal Audit Engine
                </p>
                <h2 className="text-base font-semibold text-foreground mb-1">Evaluate Executive-Level Signal Maturity</h2>
                <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                  Classifies ownership signals against executive-level thresholds. Detects hiring-stage friction risk, undersignaling, and ownership inflation.
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
                Run Executive Audit
              </Button>
            </div>
            <div className="space-y-4">
              {directorLoading && <AlignmentLoader minHeight="260px" />}
              {!directorLoading && !directorResult && (
                <div className="flex h-60 items-center justify-center rounded-xl border border-dashed bg-card">
                  <p className="text-sm text-muted-foreground">Executive audit output will appear here</p>
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
                  <ResumeUpload
                    onTextExtracted={(text) => {
                      setBullet(text);
                      setErrors((p) => ({ ...p, bullet: undefined }));
                    }}
                  />
                  <Textarea
                    placeholder="Paste a resume bullet, summary, or short experience section here..."
                    value={bullet}
                    onChange={(e) => { setBullet(e.target.value); setErrors((p) => ({ ...p, bullet: undefined })); }}
                    rows={4}
                    className={`mt-2 ${errors.bullet ? "border-destructive" : ""}`}
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
                      ? `${remaining} alignment${remaining !== 1 ? "s" : ""} remaining today`
                      : <>You've used your 3 free alignments today.<br /><span className="text-primary font-semibold">Upgrade for unlimited alignments.</span></>
                    }
                  </p>
                )}

                <div className="flex items-center gap-3 flex-wrap">
                  <Button onClick={handleOptimize} disabled={loading} className="gap-2 w-full sm:w-auto sticky bottom-4 z-10 sm:static">
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
              <div className="space-y-7">
                {loading && <AlignmentLoader minHeight="260px" />}

                {!loading && !result && !showSamples && (
                  <div className="flex h-60 items-center justify-center rounded-xl border border-dashed bg-card">
                    <p className="text-sm text-muted-foreground">Results will appear here</p>
                  </div>
                )}

                {!loading && !result && showSamples && (
                  <div className="space-y-7">
                    <div>
                      <p className="text-xs font-semibold text-foreground mb-0.5">{role.label}</p>
                      <p className="text-xs text-muted-foreground">Diagnostic preview based on the original bullet.</p>
                    </div>
                    <div className="rounded-xl border bg-card p-5 space-y-3">
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mt-2">Perception Snapshot</h3>
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
                    <div className="rounded-xl border bg-card p-5 space-y-2">
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mt-2">What This Role Actually Weighs Most</h3>
                      <ul className="space-y-1.5">
                        {role.roleWeightsMost.map((theme, i) => (
                          <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50 mt-1.5" />
                            {theme}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-xl border bg-card p-5 space-y-2">
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mt-2">Perception Insight</h3>
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
                    {/* Section 1: Signal Diagnosis with glow */}
                    <div className={`rounded-xl border bg-card p-6 space-y-4 transition-shadow duration-500 ${scoreRevealed ? "" : "shadow-[0_0_30px_-5px_hsl(var(--primary)/0.4)]"}`}>
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mt-2" style={{ letterSpacing: "0.15em" }}>Signal Diagnosis</h3>
                      <div className="flex items-baseline gap-3">
                        <span className={`text-5xl font-bold tabular-nums ${
                          result.match_score >= 70 ? "text-green-600 dark:text-green-400" :
                          result.match_score >= 50 ? "text-orange-500" :
                          "text-destructive"
                        }`}>
                          {animatedScore}%
                        </span>
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
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mt-4" style={{ letterSpacing: "0.15em" }}>Calibrated Bullets</h3>
                      <div className="rounded-xl border bg-card p-5 space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-1">
                            <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground font-medium">Original</p>
                            <p className="text-sm text-muted-foreground leading-relaxed">{bullet}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[11px] uppercase tracking-[0.15em] text-primary font-medium">Calibrated</p>
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
                        inferredRoleTitle={result.inferred_role_title}
                      />
                    )}
                    <KeywordChips keywords={result.missing_keywords} />
                    {(result.alignment_notes || result.gap_suggestions) && (
                      <LevelDeterminationBlock
                        score={result.match_score}
                        alignmentNotes={result.alignment_notes}
                        gapSuggestions={result.gap_suggestions}
                        confidenceLevel={result.alignment_confidence_level}
                        inferredRoleTitle={result.inferred_role_title}
                      />
                    )}
                    {result.match_score < 60 && (
                      <WeakAlignmentNudge
                        additionalContext={additionalContext}
                        onContextChange={setAdditionalContext}
                      />
                    )}

                    {/* Resume Builder — Pro gated */}
                    <ResumeBuilder
                      experience={bullet}
                      jd={jd}
                      calibratedBullet={result.optimized_bullet}
                      originalBullet={bullet}
                      matchScore={result.match_score}
                      isPro={effectiveIsPro}
                      onUpgrade={() => setShowUpgrade(true)}
                    />

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
        <h2 className="text-xl font-semibold tracking-tight text-foreground mb-8 mt-4 text-center" style={{ letterSpacing: "0.02em" }}>
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

      {/* Footer */}
      <footer className="border-t py-10">
        <div className="container max-w-2xl text-center space-y-3">
          <p className="text-xs text-muted-foreground">Zero fabrication. We only work with what you give us.</p>
          <p className="text-xs text-muted-foreground">Your data is never used to train AI models.</p>
          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground/60">
            <span>Privacy Policy</span>
            <span>•</span>
            <span>Terms</span>
          </div>
        </div>
      </footer>

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
