import { useState, useEffect, useRef, useCallback, useMemo, Component, type ReactNode, type ErrorInfo } from "react";
import { initiateCheckout } from "@/utils/stripe";
import { Button } from "@/components/ui/button";
import DebugPanel, { EngineErrorCard, type DebugInfo } from "@/components/DebugPanel";
import { Textarea } from "@/components/ui/textarea";
import ResumePasteQuality from "@/components/ResumePasteQuality";
import { parseResumeIntake, getPasteQuality, type PasteQuality } from "@/lib/resumeIntake";
import ResultSection from "@/components/ResultSection";
import KeywordChips from "@/components/KeywordChips";
import MatchScoreCard from "@/components/MatchScoreCard";
import ExportResults from "@/components/ExportResults";
import CalibratedBulletsSection from "@/components/CalibratedBulletsSection";
import UpgradeModal from "@/components/UpgradeModal";
// ResumeBuilder removed from alignment results — now only in Calibrated Resume tab
import ResumeUpload from "@/components/ResumeUpload";
// ProInsightsTeaser removed — consolidated into single gate card
import WeakAlignmentNudge from "@/components/WeakAlignmentNudge";
import IdentityStrengthIndex from "@/components/IdentityStrengthIndex";
import SignalGapActions from "@/components/SignalGapActions";
import CalibratedSummary from "@/components/CalibratedSummary";
import ATSSignalPanel from "@/components/ATSSignalPanel";
import InterviewIntelligence from "@/components/InterviewIntelligence";
import CoverLetterTab from "@/components/CoverLetterTab";
import SignalDiagnosticModules, { ScoreExplanation } from "@/components/SignalDiagnosticModules";
import type { SignalDiagnosticData } from "@/components/SignalDiagnosticModules";
import type { SignalModel } from "@/types/SignalModel";
import LinkedInSignalTab from "@/components/LinkedInSignalTab";
import OnboardingModal from "@/components/OnboardingModal";
import EvidenceLedger from "@/components/EvidenceLedger";
import type { EvidenceEntry } from "@/components/EvidenceLedger";
import PositioningLoader from "@/components/PositioningLoader";
import CalibratedResumeTab from "@/components/CalibratedResumeTab";
import SignalPipelineProgress, { type PipelineStage } from "@/components/SignalPipelineProgress";
import { Loader2, Sparkles, Layers, Shield, LockKeyhole, ArrowDown, Quote, Lock, RefreshCw, Check } from "lucide-react";
import AlignmentLoader from "@/components/AlignmentLoader";
import LevelDeterminationBlock from "@/components/LevelDeterminationBlock";
import DirectorCalibrationBlock, { type DirectorCalibrationResult } from "@/components/DirectorCalibrationBlock";
import { supabase } from "@/integrations/supabase/client";
import { invokeResilient, FRIENDLY_FAIL_MSG } from "@/lib/resilientEdgeFn";
import { useAuth } from "@/hooks/useAuth";
import { useDailyUsage } from "@/hooks/useDailyUsage";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useReverseTrial } from "@/hooks/useReverseTrial";
import { useSubscription } from "@/hooks/useSubscription";
import { ProGate } from "@/components/ProGate";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
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
    perceptionSnapshot: { "Strategic Ownership Signal": "Low", "Cross-Functional Authority": "Low", "Business Impact Clarity": "Low", "Seniority Weight": "Moderate" },
    roleWeightsMost: ["Portfolio ownership with renewal and expansion accountability", "Proactive adoption driving — not reactive support", "QBR facilitation and executive-facing communication", "Churn reduction as a measurable outcome"],
    perceptionInsights: ['"Managed a portfolio of 45 SMB accounts" signals administrative assignment — this role expects portfolio ownership with revenue accountability.', '"Led quarterly business reviews" reads as facilitation, not strategic ownership.', '"Collaborated with product and support teams" positions you as a participant.'],
  },
  {
    label: "Operations Lead",
    bullet: `Oversaw daily operations for a 12-person remote support team — managing scheduling, workflow distribution, and SLA compliance across three product lines. Redesigned the ticket routing process to reduce misassignment rate and improve first-contact resolution. Maintained vendor relationships with three external service partners, negotiating SLAs and reviewing monthly performance against agreed benchmarks. Reported weekly operational metrics to senior leadership and flagged process gaps with proposed solutions.`,
    jd: `Seeking an Operations Lead to manage day-to-day team workflows, own vendor relationships, and drive process improvement across our support infrastructure. Must be comfortable with data reporting, cross-functional coordination, and managing remote teams.`,
    sampleA: "Built and owned end-to-end fulfillment workflows across 3 distribution channels, reducing cycle time by 28% through process redesign and vendor SLA renegotiation.",
    sampleB: "Coordinated logistics and fulfillment operations across multiple vendor relationships, implementing process improvements that reduced order-to-delivery time.",
    perceptionSnapshot: { "Strategic Ownership Signal": "Low", "Cross-Functional Authority": "Low", "Business Impact Clarity": "Low", "Seniority Weight": "Low" },
    roleWeightsMost: ["Process ownership and scalable system design", "Measurable efficiency outcomes tied to KPIs", "Vendor management with negotiation accountability", "Operational reporting to senior leadership"],
    perceptionInsights: ['"Oversaw daily operations" signals supervision rather than system ownership.', '"Redesigned the ticket routing process" lacks measurable outcomes.', '"Reported weekly operational metrics" reads as compliance, not leadership.'],
  },
  {
    label: "Marketing Manager",
    bullet: `Led integrated campaigns across email, paid social, and organic channels for a B2B SaaS company targeting HR and finance decision-makers. Managed a $120K quarterly campaign budget and reported ROI to VP of Marketing monthly. Built and maintained the content calendar, coordinating with design, product, and sales to align messaging. Tracked funnel performance in HubSpot — identifying drop-off points and testing variations to improve conversion rates.`,
    jd: `Looking for a Marketing Manager to own demand generation strategy across digital channels. Plan and execute integrated campaigns, manage budget allocation, analyze funnel performance, partner with sales to optimize lead quality. Required: B2B demand gen, HubSpot/Marketo, budget ownership, funnel analytics.`,
    sampleA: "Owned demand generation across paid, organic, and email channels with $120K quarterly budget, building integrated campaign frameworks that generated 340 MQLs per month.",
    sampleB: "Planned and executed multi-channel marketing campaigns across email, social, and paid digital, coordinating with sales on lead handoff processes.",
    perceptionSnapshot: { "Strategic Ownership Signal": "Moderate", "Cross-Functional Authority": "Low", "Business Impact Clarity": "Moderate", "Seniority Weight": "Low" },
    roleWeightsMost: ["Demand generation strategy ownership", "Budget accountability with ROI measurement", "Funnel analytics and conversion optimization", "Sales partnership on lead quality"],
    perceptionInsights: ['"Led integrated campaigns" signals execution ownership but needs strategic framing.', '"Managed a $120K quarterly campaign budget" is strong but needs outcome attribution.', '"Tracked funnel performance in HubSpot" is reporting, not analytics ownership.'],
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
  signal_model?: SignalModel;
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

// ─── Error boundary for Signal Positioning Report ─────────────────────────
class DirectorCalibrationErrorBoundary extends Component<
  { children: ReactNode; onRetry: () => void },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; onRetry: () => void }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, _info: ErrorInfo) {
    // Error boundary caught render error
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border bg-[#0F1C2E] p-6 space-y-4">
          <p className="text-sm text-white leading-relaxed">
            Your Signal Positioning Report couldn't render. This can happen with complex resumes — click retry to regenerate.
          </p>
          <button
            onClick={() => { this.setState({ hasError: false }); this.props.onRetry(); }}
            className="w-full flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium transition-colors hover:bg-primary/90"
          >
            Retry Analysis
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Input normalization (client-side) ─────────────────────────────────────
const MAX_RESUME_CHARS = 10000;
const MAX_JD_CHARS = 8000;

function normalizeClientInput(text: string, maxChars: number): { text: string; truncated: boolean } {
  let cleaned = text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const truncated = cleaned.length > maxChars;
  if (truncated) cleaned = cleaned.slice(0, maxChars);
  return { text: cleaned, truncated };
}

function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    if (target <= 0) { setValue(0); return; }
    const start = performance.now();
    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - (1 - progress) * (1 - progress);
      setValue(Math.round(eased * target));
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return value;
}

function getStrengthLabel(score: number): string {
  if (score >= 70) return "Strong";
  if (score >= 50) return "Solid";
  return "Weak";
}

// ─── Director Mode Content (hard-gated) ──────────────────────────────────────
function DirectorModeContent({
  result,
  bullet,
  jd,
  directorResult,
  directorLoading,
  directorError,
  onRunAlignment,
  onRunDirector,
  isPro,
  onUpgrade,
  isAuthenticated,
}: {
  result: OptimizationResult | null;
  bullet: string;
  jd: string;
  directorResult: DirectorCalibrationResult | null;
  directorLoading: boolean;
  directorError: string | null;
  onRunAlignment: () => void;
  onRunDirector: () => void;
  isPro: boolean;
  onUpgrade: () => void;
  isAuthenticated: boolean;
}) {
  // HARD GATE: If no current-session alignment result, render ONLY the empty state
  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <p className="text-sm text-muted-foreground">Run an alignment first to generate your Signal Positioning Report</p>
        <Button variant="outline" size="sm" onClick={onRunAlignment}>
          Run Alignment →
        </Button>
      </div>
    );
  }

  // Full report UI — only mounts when result exists
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="space-y-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-1">Signal Positioning Engine</p>
          <h2 className="text-base font-semibold text-foreground mb-1">Diagnose where your professional signal breaks down across the hiring pipeline</h2>
          <p className="text-xs text-muted-foreground leading-relaxed mb-4">
            Then recalibrate it using only the experience you already have. 11-section diagnostic report. Zero fabrication. Private analysis.
          </p>

          {/* Confirmed inputs cards */}
          <div className="space-y-3 mb-5">
            <div className="rounded-lg border bg-card px-4 py-3 flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Resume detected from Alignment Engine</p>
                <p className="text-xs text-muted-foreground truncate">
                  {result.inferred_role_title ? `${result.inferred_role_title} · ` : ""}{bullet.slice(0, 80)}{bullet.length > 80 ? "…" : ""}
                </p>
              </div>
            </div>
            <div className="rounded-lg border bg-card px-4 py-3 flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Job description loaded</p>
                <p className="text-xs text-muted-foreground truncate">{jd.slice(0, 60)}{jd.length > 60 ? "…" : ""}</p>
              </div>
            </div>
          </div>
        </div>
        <Button onClick={onRunDirector} disabled={directorLoading} className="w-full gap-2 transition-transform hover:scale-[1.03] active:scale-[0.97]">
          {directorLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span style={{ color: "inherit" }}>✦</span>}
          Run Signal Positioning Report
        </Button>
        <p className="text-[11px] text-muted-foreground/70">Analysis typically completes in ~20 seconds. Zero fabrication • Your data remains private.</p>
      </div>
      <div className="space-y-4">
        {directorLoading && <PositioningLoader minHeight="300px" />}
        {directorError && !directorLoading && (
          <div className="rounded-xl border bg-[#0F1C2E] p-6 space-y-4">
            <p className="text-sm text-white leading-relaxed">{directorError}</p>
            <Button onClick={onRunDirector} variant="outline" className="w-full gap-2 border-white/20 text-white hover:bg-white/10">
              <RefreshCw className="h-4 w-4" />
              Retry Analysis
            </Button>
          </div>
        )}
        {directorResult && !directorLoading && !directorError && (
          <DirectorCalibrationErrorBoundary onRetry={onRunDirector}>
            <DirectorCalibrationBlock result={directorResult} isPro={isPro} onUpgrade={onUpgrade} isAuthenticated={isAuthenticated} />
          </DirectorCalibrationErrorBoundary>
        )}
      </div>
    </div>
  );
}

const Index = () => {
  const [mode, setMode] = useState<"alignment" | "linkedin" | "director" | "calibrated" | "coverletter">("alignment");
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
  const [analysisTime, setAnalysisTime] = useState(0);

  // Executive Audit state
  const [directorExperience, setDirectorExperience] = useState("");
  const [directorResult, setDirectorResult] = useState<DirectorCalibrationResult | null>(null);
  const [directorLoading, setDirectorLoading] = useState(false);
  const [directorError, setDirectorError] = useState<string | null>(null);
  const [lastDebug, setLastDebug] = useState<DebugInfo | null>(null);
  const [alignmentError, setAlignmentError] = useState<DebugInfo | null>(null);
  const [inputTruncated, setInputTruncated] = useState(false);
  const lastClickRef = useRef(0);

  const { user } = useAuth();
  const { isPro, isFree, dailyRunsRemaining, loading: subLoading, refresh: refreshSub } = useSubscription();
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
  const { remaining, limitReached, increment, DAILY_FREE_LIMIT } = useDailyUsage(effectiveIsPro);
  const [searchParams, setSearchParams] = useSearchParams();

  // Post-upgrade success toast
  useEffect(() => {
    if (searchParams.get("upgrade") === "success") {
      toast("Welcome to Pro. All features are now unlocked.", {
        icon: "✦",
        duration: 4000,
        style: { background: "linear-gradient(135deg, hsl(174, 62%, 47%), hsl(174, 62%, 35%))", color: "white", border: "none" },
      });
      searchParams.delete("upgrade");
      setSearchParams(searchParams, { replace: true });
      refreshSub();
    }
  }, []);

  const animatedScore = useCountUp(result?.match_score ?? 0, 1200);

  // Track whether calibrated resume was assembled in THIS session
  // This is set to true when CalibratedResumeTab signals assembly complete
  const [sessionResumeAssembled, setSessionResumeAssembled] = useState(false);

  // Pipeline stages derived purely from current-session React state
  const pipelineStages: PipelineStage[] = useMemo(() => {
    const alignmentDone = !!result;
    const reportDone = !!directorResult;
    const resumeDone = sessionResumeAssembled;

    // Map the current tab to a pipeline stage id
    const activeTab = mode === "director" ? "report" : mode === "calibrated" ? "resume" : mode === "coverletter" ? "alignment" : mode === "linkedin" ? "alignment" : "alignment";

    const getStatus = (id: string, done: boolean, priorDone: boolean): "complete" | "active" | "pending" | "locked" => {
      if (done) return "complete";
      // If the user is viewing this stage's tab, show it as active (not locked)
      if (id === activeTab) return "active";
      if (!priorDone) return "pending";
      // The next actionable stage
      const nextActionable = !alignmentDone ? "alignment" : !reportDone ? "report" : !resumeDone ? "resume" : null;
      return id === nextActionable ? "active" : "pending";
    };

    return [
      {
        id: "alignment",
        label: "Alignment Engine",
        shortLabel: "Alignment",
        sublabel: "Score + signal diagnosis",
        status: alignmentDone ? "complete" as const : "active" as const,
        completedAt: null,
      },
      {
        id: "report",
        label: "Signal Report",
        shortLabel: "Report",
        sublabel: "12-section deep analysis",
        status: getStatus("report", reportDone, alignmentDone),
        completedAt: null,
        lockedReason: "Complete the Alignment Engine first",
      },
      {
        id: "resume",
        label: "Calibrated Resume",
        shortLabel: "Resume",
        sublabel: "Assembled + export ready",
        status: getStatus("resume", resumeDone, reportDone),
        completedAt: null,
        lockedReason: "Run the Signal Positioning Report first",
      },
    ];
  }, [result, directorResult, sessionResumeAssembled, mode]);

  useEffect(() => {
    if (result) {
      setScoreRevealed(false);
      const t = setTimeout(() => setScoreRevealed(true), 500);
      return () => clearTimeout(t);
    }
  }, [result]);

  // Credential patterns that indicate a hard requirement the resume cannot satisfy via repositioning
  const CREDENTIAL_PATTERNS = [
    /\b(MD|M\.D\.)\b/, /\b(JD|J\.D\.)\b/, /\b(RN|BSN)\b/, /\bCPA\b/, /\bP\.?E\.?\b/,
    /\bPharmD\b/i, /\bDO\b/, /\bDDS\b/, /\bDMD\b/, /\bNP\b/, /\bPA-C\b/,
    /\bLCSW\b/, /\bLMFT\b/, /\bPMP\b/, /\bCFA\b/, /\bCISS?P\b/,
    /\bbar admission\b/i, /\bmedical licen[sc]e\b/i, /\bnursing licen[sc]e\b/i,
    /\blicensed (physician|attorney|nurse|pharmacist|engineer)\b/i,
    /\bboard[- ]?certif/i, /\bregistered nurse\b/i, /\battorney at law\b/i,
  ];

  const CREDENTIAL_BLOCK_MSG =
    "This role requires credentials not found in your resume. Resumix works best when your experience already qualifies you — the signal just needs repositioning.";

  const checkCredentialMismatch = (resumeText: string, jdText: string): boolean => {
    const resumeUpper = resumeText.toUpperCase();
    for (const pattern of CREDENTIAL_PATTERNS) {
      if (pattern.test(jdText)) {
        // Check if the credential also appears in the resume
        if (!pattern.test(resumeText) && !pattern.test(resumeUpper)) {
          return true; // required credential missing from resume
        }
      }
    }
    return false;
  };

  const validate = () => {
    const errs: typeof errors = {};
    if (!bullet.trim()) {
      errs.bullet = "Add your resume to continue";
      setErrors(errs);
      return false;
    }
    if (bullet.trim().length < 20) {
      errs.bullet = "Experience must be at least 20 characters.";
      setErrors(errs);
      return false;
    }
    if (!jd.trim()) {
      errs.jd = "Add the job description to continue";
      setErrors(errs);
      return false;
    }
    if (jd.trim().length < 20) {
      errs.jd = "Job description must be at least 20 characters.";
      setErrors(errs);
      return false;
    }
    // Credential gate
    if (checkCredentialMismatch(bullet.trim(), jd.trim())) {
      setAlignmentError({ message: CREDENTIAL_BLOCK_MSG, error_code: "CREDENTIAL_MISMATCH" });
      return false;
    }
    setErrors({});
    return true;
  };

  const handleDirectorCalibrate = async () => {
    // 2s debounce
    const now = Date.now();
    if (now - lastClickRef.current < 2000) return;
    lastClickRef.current = now;

    const normResume = normalizeClientInput(bullet.trim(), MAX_RESUME_CHARS);
    if (!normResume.text) {
      toast.error("Run the Alignment Engine first to load your resume.");
      return;
    }
    if (normResume.text.length < 300) {
      setDirectorError("Your resume input is too short. Go back to the Alignment Engine and paste a fuller resume.");
      return;
    }
    if (normResume.truncated) setInputTruncated(true);
    setDirectorExperience(normResume.text);
    setDirectorLoading(true);
    setDirectorResult(null);
    setDirectorError(null);
    // telemetry: positioning_run_clicked

    try {
      const data = await invokeResilient(
        "director",
        "director-calibration",
        { experience: normResume.text, jd: jd?.trim() || undefined, deterministic: false },
        90_000,
      );

      // Capture debug info from response
      const debug: DebugInfo = {
        request_id: data?.request_id,
        error_code: data?.error_code,
        message: data?.message || data?.error,
        payload_length: normResume.text.length,
        timestamp: new Date().toISOString(),
        status_code: 200,
      };
      setLastDebug(debug);

      if (data?.error) throw new Error(data.error);

      const result = data as DirectorCalibrationResult;

      // Validate the result has minimum required fields
      if (!result || !result.dimensions || !result.director_signal_tier) {
        throw new Error("Your Signal Positioning Report couldn't render. This can happen with complex resumes — click retry to regenerate.");
      }

      setDirectorResult(result);
    } catch (err: any) {
      const msg = err.message || FRIENDLY_FAIL_MSG;
      setDirectorError(msg);
    } finally {
      setDirectorLoading(false);
    }
  };

  // NOTE: Do NOT restore directorResult from localStorage.
  // The Signal Positioning Report must only show current-session data.

  const saveToHistory = async (res: OptimizationResult) => {
    if (!user) return;
    try {
      await supabase.from("alignment_history").insert({
        user_id: user.id,
        inferred_role: res.signal_model?.role?.title || res.inferred_role_title || "",
        score: res.match_score,
        strength_label: getStrengthLabel(res.match_score),
        top_gap: res.signal_model?.gaps?.[0] || res.top_missing_signal || null,
        full_result_json: { ...res, jd_text: jd.trim() } as any,
      });
    } catch {}
  };

  const handleOptimize = async () => {
    // 2s debounce
    const now = Date.now();
    if (now - lastClickRef.current < 2000) return;
    lastClickRef.current = now;

    if (!validate()) return;
    setLoading(true);
    setResult(null);
    setDirectorResult(null);
    setSessionResumeAssembled(false);
    setAlignmentError(null);
    setInputTruncated(false);
    setShowSamples(false);
    const startTime = Date.now();
    const engineMode = effectiveIsPro ? "multi_bullet" : "single_bullet";

    // Client-side normalization
    const normResume = normalizeClientInput(bullet.trim(), MAX_RESUME_CHARS);
    const normJd = normalizeClientInput(jd.trim(), MAX_JD_CHARS);
    if (normResume.truncated || normJd.truncated) {
      setInputTruncated(true);
    }
    const payloadLength = normResume.text.length + normJd.text.length;
    const bulletWithContext = additionalContext.trim()
      ? `${normResume.text}\n\nAdditional context: ${additionalContext.trim()}`
      : normResume.text;
    const sessionToken = user ? undefined : getSessionToken();

    const invokeAlignment = (attempt = 1) =>
      invokeResilient(
        attempt === 1 ? "alignment" : "alignment-retry",
        "optimize-bullet",
        { bullet: bulletWithContext, jd: normJd.text, userId: user?.id ?? null, mode: engineMode, sessionToken },
        120_000, // 120s timeout to accommodate cold starts
      );

    // Track error codes locally (not via React state, which is async)
    let localErrorCode: string | null = null;

    const processResult = async (data: any) => {
      const debug: DebugInfo = {
        request_id: data?.request_id,
        error_code: data?.error_code,
        message: data?.message || data?.error,
        payload_length: payloadLength,
        timestamp: new Date().toISOString(),
        status_code: 200,
      };
      setLastDebug(debug);

      if (data?.error) {
        if (data.limit_reached || data.error_code === "RATE_LIMIT") {
          debug.error_code = "DAILY_LIMIT";
          localErrorCode = "DAILY_LIMIT";
        }
        localErrorCode = localErrorCode || data.error_code || null;
        setAlignmentError(debug);
        throw new Error(data.error);
      }

      const res = data as OptimizationResult;
      setResult(res);
      setAnalysisTime(Math.round((Date.now() - startTime) / 1000));

      try {
        const jdFingerprint = normJd.text.replace(/\s+/g, " ").toLowerCase().slice(0, 150);
        sessionStorage.setItem("resumix_alignment_score", JSON.stringify({
          score: res.match_score,
          jd_fingerprint: jdFingerprint,
          ts: Date.now(),
        }));
      } catch {}
      increment();
      if (isTrialPro) incrementTrialRun();
      if (user) {
        try { await supabase.rpc("increment_run_count", { p_user_id: user.id }); } catch {}
        refreshSub();
      }
      saveToHistory(res);
      if (!user) {
        toast("Save your results and track your progress", {
          description: "Create a free account to keep your alignment history.",
          action: { label: "Sign up", onClick: () => { window.location.href = "/auth"; } },
          duration: 8000,
        });
      }
    };

    try {
      const data = await invokeAlignment();
      await processResult(data);
    } catch (firstErr: any) {
      // Don't retry daily-limit or credential errors — those are intentional gates
      const isIntentionalBlock = localErrorCode === "DAILY_LIMIT" || localErrorCode === "CREDENTIAL_MISMATCH";
      if (isIntentionalBlock) {
        console.info("[Alignment] Intentional block, not retrying:", localErrorCode);
        // Already set by processResult, just stop
      } else {
        // Silent retry once for cold-start / transient failures
        console.warn("[Alignment] Attempt 1 failed — retrying silently.", {
          error: firstErr.message,
          errorCode: localErrorCode,
          timestamp: new Date().toISOString(),
        });
        try {
          localErrorCode = null;
          setAlignmentError(null);
          const data = await invokeAlignment(2);
          await processResult(data);
        } catch (retryErr: any) {
          console.error("[Alignment] Attempt 2 also failed.", {
            error: retryErr.message,
            errorCode: localErrorCode,
            timestamp: new Date().toISOString(),
          });
          const msg = retryErr.message || FRIENDLY_FAIL_MSG;
          setResult(null);
          // Use localErrorCode to determine display, not stale React state
          if (localErrorCode === "DAILY_LIMIT") {
            setAlignmentError({ message: msg, error_code: "DAILY_LIMIT" });
          } else {
            setAlignmentError({ message: msg, error_code: localErrorCode || undefined });
          }
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const fillSample = (roleIndex = selectedSampleRole) => {
    const role = SAMPLE_ROLES[roleIndex];
    setBullet(role.bullet);
    setJd(role.jd);
  };

  const role = SAMPLE_ROLES[selectedSampleRole];

  const usedCount = DAILY_FREE_LIMIT - remaining;

  return (
    <div className="min-h-screen">
      {/* DebugPanel removed — debug info logged to console only */}
      
      <OnboardingModal />

      {/* Hero — deep navy */}
      <section className="py-20 bg-[#0F1C2E] relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0F1C2E] via-[#132438] to-[#0F1C2E] opacity-80" />
        <div className="container max-w-[780px] text-center relative z-10">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl leading-tight">
            You already qualify. You just don't <span className="text-primary">read like it</span> yet.
          </h1>
          <p className="mt-4 text-base text-white/70 leading-relaxed max-w-xl mx-auto">
            Resumix analyzes your resume against real job descriptions and repositions your signal so hiring systems and recruiters read your experience the way it was meant to be read.
          </p>
          <Button
            size="lg"
            className="mt-6 shadow-md hover:shadow-lg transition-all duration-150 hover:-translate-y-px active:translate-y-0 hover:scale-[1.03] active:scale-[0.97]"
            onClick={() => document.getElementById("alignment-tool")?.scrollIntoView({ behavior: "smooth" })}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Run Your Signal Analysis
          </Button>
        </div>
      </section>

      {/* What you walk away with */}
      <section className="pt-16 md:pt-20 pb-12 container max-w-[780px]">
        <h2 className="text-xl font-bold tracking-tight text-foreground mb-8 text-center">What you walk away with.</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { title: "Signal Diagnosis", body: "A scored read of how hiring systems and managers actually interpret your experience — not how you intended it." },
            { title: "Gap Map", body: "The exact signals preventing callbacks, ranked by impact. Specific, not general." },
            { title: "Reframed Bullets", body: "Your own language repositioned to hit what the role actually weights. Zero fabrication." },
            { title: "Calibrated Resume", body: "A submission-ready version built from your signal map — not a template rewrite." },
          ].map((card) => (
            <div key={card.title} className="rounded-lg border border-l-[3px] border-l-primary bg-card p-5 space-y-2">
              <p className="text-sm font-semibold text-foreground">{card.title}</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{card.body}</p>
            </div>
          ))}
        </div>
        <div className="flex justify-center mt-10">
          <Button className="w-full sm:w-auto shadow-md hover:shadow-lg transition-all duration-150 hover:-translate-y-px active:translate-y-0 hover:scale-[1.03] active:scale-[0.97]" onClick={() => document.getElementById("alignment-tool")?.scrollIntoView({ behavior: "smooth" })}>
            <Sparkles className="h-4 w-4 mr-2" />
            Run Your Signal Analysis →
          </Button>
        </div>
      </section>

      {/* Before/After Transformation Showcase */}
      <section className="py-12 container max-w-[780px]" style={{ backgroundColor: "hsl(210, 17%, 97%)" }}>
        <div className="text-center mb-8">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Same experience. Different signal.</h2>
          <p className="mt-2 text-sm text-muted-foreground">Resumix doesn't invent. It repositions what you already have.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-xl bg-[#2A2A2A] p-6 space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">BEFORE — ORIGINAL LANGUAGE</p>
            <p className="text-sm text-gray-300 leading-relaxed">
              Managed customer inquiries and helped resolve issues for business clients while maintaining documentation.
            </p>
          </div>
          <div className="flex justify-center md:hidden">
            <ArrowDown className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="rounded-xl bg-card border-l-4 border-l-primary p-6 space-y-3" style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.08)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">AFTER — REPOSITIONED BY RESUMIX</p>
            <p className="text-sm text-foreground leading-relaxed">
              Served as primary resolution contact for 40-70 concurrent B2B cases under strict SLA requirements — translating compliance and procedural complexity into clear, actionable guidance for business owners and HR administrators.
            </p>
          </div>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-4 italic opacity-70">Zero fabrication — every detail came from the original resume. Only the framing changed.</p>
      </section>


      {/* WAS/NOW Transformation Section */}
      <section className="py-12 container max-w-[780px]" style={{ backgroundColor: "hsl(210, 17%, 97%)" }}>
        <div className="text-center mb-8">
          <h2 className="font-bold tracking-tight text-foreground" style={{ fontSize: "28px" }}>This is what repositioning looks like.</h2>
          <p className="mt-2 text-muted-foreground" style={{ fontSize: "16px" }}>Not reframing with synonyms. Recalibrating. Every word came from the original resume.</p>
        </div>
        <div className="space-y-4">
          {[
            {
              was: "Executed complaint routing and escalation triage across a high-volume state-managed caseload — managing 40-70 concurrent cases with 8-15 resolved daily under strict SLA requirements.",
              now: "Managed 40–70 concurrent cases with 8–15 daily resolutions under strict SLA requirements — owning triage decisions and handoff accountability across a state-managed caseload.",
              signal: "Ownership language + SLA accountability framing",
            },
            {
              was: "Built internal intake guides and complaint clarification protocols that standardized the routing decision process.",
              now: "Architected procedural enhancements — intake guides and clarification protocols — that optimized client issue routing, significantly reducing repeat inquiries and elevating first-contact resolution efficiency.",
              signal: "Strategic authorship + measurable outcome framing",
            },
            {
              was: "Supported executive-level clients and institutional account managers through complex procedural questions.",
              now: "Advised executive and institutional clientele on complex procedural and regulatory matters, distilling intricate information into actionable guidance that upheld brand standards and compliance.",
              signal: "Client elevation + brand alignment",
            },
          ].map((card, i) => (
            <div key={i} className="rounded-xl border bg-card p-4 space-y-3 shadow-sm" style={{ borderRadius: "12px" }}>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">WAS</p>
                <p className="text-muted-foreground line-through leading-relaxed" style={{ fontSize: "13px" }}>{card.was}</p>
              </div>
              <hr className="border-border/40" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-primary mb-1.5">NOW</p>
                <p className="font-medium text-foreground leading-relaxed" style={{ fontSize: "14px" }}>{card.now}</p>
              </div>
              <span className="inline-block text-[10px] font-semibold uppercase tracking-widest text-primary bg-primary/10 rounded-full px-3 py-1">
                Signal Applied: {card.signal}
              </span>
            </div>
          ))}
        </div>
        <p className="text-center text-sm font-semibold text-foreground mt-6">Same experience. Different signal.</p>
        <div className="flex justify-center mt-4">
          <Button className="w-full sm:w-auto shadow-md hover:shadow-lg transition-all duration-150 hover:-translate-y-px active:translate-y-0 hover:scale-[1.03] active:scale-[0.97]" onClick={() => document.getElementById("alignment-tool")?.scrollIntoView({ behavior: "smooth" })}>
            <Sparkles className="h-4 w-4 mr-2" />
            Run Your Signal Analysis
          </Button>
        </div>
      </section>

      {/* Differentiation Statement */}
      <section className="py-12 bg-[#0F1C2E]">
        <div className="container max-w-[780px] text-center">
          <h2 className="text-2xl font-bold text-white tracking-tight sm:text-3xl">This isn't resume tailoring.</h2>
          <p className="mt-4 text-sm text-white/70 leading-relaxed max-w-xl mx-auto">
            Most tools reframe your bullets with synonyms. Resumix diagnoses where your signal breaks — at the recruiter filter, the hiring manager review, the panel interview — and recalibrates your positioning from the threshold up.
          </p>
        </div>
      </section>

      {/* Feature Cards */}
      <section className="py-12 container max-w-[780px]" style={{ backgroundColor: "hsl(210, 17%, 97%)" }}>
        <div className="grid gap-4 md:grid-cols-3">
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
      <section className="py-12 container max-w-[780px]">
        <h2 className="text-xl font-semibold tracking-tight text-foreground mb-6" style={{ letterSpacing: "0.02em" }}>How Resumix Works</h2>
        <div className="space-y-5">
          {[
            { step: "1. Detect Employer Priority Signals", desc: "Surface what the role actually weights — ownership scope, strategic depth, cross-functional complexity, and business impact thresholds." },
            { step: "2. Map Your Experience to Weighted Themes", desc: "Compare how your background reads against each priority signal, identifying where alignment is strong and where perception gaps exist." },
            { step: "3. Refine for Strategic Alignment", desc: "Sharpen language to reflect ownership, decision authority, and measurable outcomes — without fabrication or inflation." },
          ].map((item, i) => (
            <div key={i} className="flex gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">{item.step}</p>
                <p className="mt-1 text-sm text-muted-foreground">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Mode toggle + Tool */}
      <section id="alignment-tool" className="py-12 container max-w-5xl">

        {/* Sub-navigation tabs */}
        {/* Sub-navigation tabs */}
        <div className="mb-6 flex justify-center mt-3">
          {/* Mobile layout */}
          <div className="flex flex-col w-full lg:hidden gap-1">
            <div className="grid grid-cols-2 gap-1">
              {([
                { id: "alignment" as const, label: "Alignment Engine", proOnly: false },
                { id: "director" as const, label: "Signal Positioning Report", proOnly: false },
              ] as const).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (tab.proOnly && !effectiveIsPro) { setShowUpgrade(true); return; }
                    const scrollY = window.scrollY;
                    setMode(tab.id);
                    requestAnimationFrame(() => window.scrollTo(0, scrollY));
                  }}
                  className={`px-3 py-2.5 text-[11px] font-medium transition-colors text-center rounded-md border ${
                    mode === tab.id
                      ? "bg-primary/10 border-primary text-primary"
                      : "bg-muted/40 border-border text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
              {([
                { id: "calibrated" as const, label: "Calibrated Resume" },
                { id: "coverletter" as const, label: "Cover Letter" },
              ] as const).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (!effectiveIsPro) { setShowUpgrade(true); return; }
                    const scrollY = window.scrollY;
                    setMode(tab.id);
                    requestAnimationFrame(() => window.scrollTo(0, scrollY));
                  }}
                  className={`px-3 py-2.5 text-[11px] font-medium transition-colors text-center rounded-md border ${
                    mode === tab.id
                      ? "bg-primary/10 border-primary text-primary"
                      : "bg-muted/40 border-border text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {/* Profile Tools divider */}
            <div className="flex items-center gap-2 my-1.5">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Profile Tools</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <button
              onClick={() => {
                if (!effectiveIsPro) { setShowUpgrade(true); return; }
                const scrollY = window.scrollY;
                setMode("linkedin");
                requestAnimationFrame(() => window.scrollTo(0, scrollY));
              }}
              className={`w-full px-3 py-2.5 text-[11px] font-normal transition-colors text-center rounded-md border ${
                mode === "linkedin"
                  ? "bg-primary/10 border-primary text-primary"
                  : "bg-muted/40 border-border text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
            >
              LinkedIn Signal
            </button>
          </div>

          {/* Desktop layout */}
          <div className="hidden lg:inline-flex lg:flex-nowrap items-center gap-1">
            {([
              { id: "alignment" as const, label: "Alignment Engine", proOnly: false },
              { id: "director" as const, label: "Signal Positioning Report", proOnly: false },
              { id: "calibrated" as const, label: "Calibrated Resume", proOnly: true },
              { id: "coverletter" as const, label: "Cover Letter", proOnly: true },
              { id: "linkedin" as const, label: "LinkedIn Signal", proOnly: true },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  if (tab.proOnly && !effectiveIsPro) { setShowUpgrade(true); return; }
                  const scrollY = window.scrollY;
                  setMode(tab.id);
                  requestAnimationFrame(() => window.scrollTo(0, scrollY));
                }}
                className={`px-4 py-2.5 text-sm font-medium transition-colors text-center border-b-2 ${
                  mode === tab.id
                    ? "text-primary border-primary"
                    : "text-muted-foreground border-transparent hover:text-foreground hover:border-muted-foreground/30"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* LinkedIn Signal Tab */}
        {mode === "linkedin" && (
          <div className="max-w-2xl mx-auto">
            <LinkedInSignalTab
              experience={bullet}
              inferredRole={result?.inferred_role_title || ""}
              signalKeywords={result?.missing_keywords || result?.signal_model?.gaps || []}
              onRunAlignment={() => setMode("alignment")}
            />
          </div>
        )}

        {/* Calibrated Resume Tab */}
        {mode === "calibrated" && (
          <CalibratedResumeTab
            isPro={effectiveIsPro}
            onUpgrade={() => setShowUpgrade(true)}
            directorResult={directorResult}
            originalResume={bullet}
            onSwitchToReport={() => setMode("director")}
            hasCurrentSessionAlignment={!!result}
            onRunAlignment={() => setMode("alignment")}
            onAssembled={() => setSessionResumeAssembled(true)}
            alignmentResult={result as unknown as Record<string, unknown> || undefined}
          />
        )}

        {/* Cover Letter Tab */}
        {mode === "coverletter" && (
          <CoverLetterTab
            isPro={effectiveIsPro}
            onUpgrade={() => setShowUpgrade(true)}
            experience={bullet}
            jd={jd}
            alignmentResult={result as any || {}}
            inferredRole={result?.inferred_role_title || ""}
            hasCurrentSessionAlignment={!!result}
            onRunAlignment={() => setMode("alignment")}
          />
        )}

      {/* Executive Signal Audit Mode */}
        {mode === "director" && (
            <DirectorModeContent
              result={result}
              bullet={bullet}
              jd={jd}
              directorResult={directorResult}
              directorLoading={directorLoading}
              directorError={directorError}
              onRunAlignment={() => setMode("alignment")}
              onRunDirector={handleDirectorCalibrate}
              isPro={effectiveIsPro}
              onUpgrade={() => setShowUpgrade(true)}
              isAuthenticated={!!user}
            />
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
                  {bullet.trim().length > 20 && (
                    <div className="mt-1.5">
                      <ResumePasteQuality quality={getPasteQuality(parseResumeIntake(bullet))} />
                    </div>
                  )}
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

                <div className="flex items-center gap-3 flex-wrap">
                  {!effectiveIsPro && dailyRunsRemaining <= 0 ? (
                    <div className="w-full space-y-2">
                      {user ? (
                        <>
                          <Button onClick={() => setShowUpgrade(true)} className="w-full sm:w-auto transition-transform hover:scale-[1.03] active:scale-[0.97]">
                            Upgrade to Pro for Unlimited Runs
                          </Button>
                          <p className="text-xs text-muted-foreground">
                            You've used your 3 free analyses today. Upgrade to Pro for unlimited runs.
                          </p>
                        </>
                      ) : (
                        <>
                          <Button className="w-full sm:w-auto transition-transform hover:scale-[1.03] active:scale-[0.97]" asChild>
                            <a href="/auth">Get Started Free</a>
                          </Button>
                          <p className="text-xs text-muted-foreground">
                            Sign up to get 3 free analyses.
                          </p>
                        </>
                      )}
                    </div>
                  ) : (
                    <Button onClick={handleOptimize} disabled={loading || subLoading} className="gap-2 w-full sm:w-auto sticky bottom-4 z-10 sm:static transition-transform hover:scale-[1.03] active:scale-[0.97]">
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : subLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      {subLoading ? "Initializing…" : "Run Alignment"}
                    </Button>
                  )}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Try sample:</span>
                    {SAMPLE_ROLES.map((r, i) => (
                      <button key={i} onClick={() => fillSample(i)} className="text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground transition-colors">
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Free tier counter — only show when 1 remaining */}
                {!effectiveIsPro && dailyRunsRemaining === 1 && (
                  <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium" style={{ backgroundColor: "hsl(38, 92%, 50%, 0.15)", color: "hsl(38, 72%, 45%)" }}>
                    1 free analysis remaining today
                  </span>
                )}
                <p className="text-[11px] text-muted-foreground/70">Zero fabrication — we only work with what you give us.</p>
              </div>

              {/* Right — Results */}
              <div className="space-y-4 md:space-y-6">
                {loading && <AlignmentLoader minHeight="260px" />}

                {!loading && inputTruncated && (
                  <div className="rounded-md border border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
                    Input trimmed for reliability. Paste Experience + Skills for best results.
                  </div>
                )}

                {!loading && !result && alignmentError && (
                  alignmentError.error_code === "CREDENTIAL_MISMATCH" ? (
                    <div className="rounded-lg border border-border bg-muted/30 p-5 my-6 flex items-start gap-3">
                      <div className="shrink-0 mt-0.5 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <Shield className="h-4 w-4 text-primary" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">Credential Mismatch Detected</p>
                        <p className="text-sm text-muted-foreground">{alignmentError.message}</p>
                      </div>
                    </div>
                  ) : alignmentError.error_code === "DAILY_LIMIT" ? (
                    <div className="rounded-lg border border-border bg-card p-5 space-y-4 my-6">
                      <div className="flex items-start gap-3">
                        <div className="shrink-0 mt-0.5 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-primary text-sm font-bold">3</span>
                        </div>
                        <div className="space-y-1 flex-1">
                          <p className="text-sm font-semibold text-foreground">Daily limit reached</p>
                          <p className="text-sm text-muted-foreground">
                            {user ? "You've used your 3 free alignments for today. Upgrade to continue with unlimited alignments." : "Sign up to get 3 free analyses."}
                          </p>
                        </div>
                      </div>
                      {user ? (
                        <Button
                          size="sm"
                          className="w-full gap-2 transition-transform hover:scale-[1.03] active:scale-[0.97]"
                          onClick={() => initiateCheckout()}
                        >
                          Unlock Resumix Pro — $19/month
                        </Button>
                      ) : (
                        <Button size="sm" className="w-full gap-2" asChild>
                          <a href="/auth">Get Started Free</a>
                        </Button>
                      )}
                    </div>
                  ) : (
                    <EngineErrorCard message={alignmentError.message} onRetry={handleOptimize} />
                  )
                )}

                {!loading && !result && !alignmentError && showSamples && (
                  <div className="space-y-6">
                    <div>
                      <p className="text-xs font-semibold text-foreground mb-0.5">{role.label}</p>
                      <p className="text-xs text-muted-foreground">Diagnostic preview based on the original bullet.</p>
                    </div>
                    <div className="rounded-xl border bg-card p-5 space-y-3">
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mt-2">Perception Snapshot</h3>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(role.perceptionSnapshot).map(([dimension, level]) => (
                          <div key={dimension} className="rounded-md border bg-background p-2.5 space-y-1">
                            <p className="text-xs text-muted-foreground leading-tight">{dimension}</p>
                            <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${SIGNAL_LEVEL_STYLES[level]}`}>{level}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl border bg-card p-5 space-y-2">
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mt-2">What This Role Actually Weighs Most</h3>
                      <ul className="space-y-1.5">
                        {role.roleWeightsMost.map((theme, i) => (
                          <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50 mt-1.5" />{theme}
                          </li>
                        ))}
                      </ul>
                    </div>
                    {user ? (
                      <>
                        <div className="rounded-xl border bg-card p-5 space-y-2">
                          <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mt-2">Perception Insight</h3>
                          <ul className="space-y-2">
                            {role.perceptionInsights.map((insight, i) => (
                              <li key={i} className="text-xs text-muted-foreground border-l-2 border-border pl-3 leading-relaxed">{insight}</li>
                            ))}
                          </ul>
                        </div>
                        <ResultSection title="Repositioned Version A — Ownership Elevation" content={role.sampleA} />
                        {effectiveIsPro ? (
                          <ResultSection title="Repositioned Version B — Strategic Depth Expansion" content={role.sampleB} />
                        ) : (
                          <div className="rounded-xl border border-border bg-card p-5 text-center space-y-3">
                            <p className="text-sm font-semibold text-foreground">Unlock All Variants — Resumix Pro</p>
                            <p className="text-xs text-muted-foreground">Additional repositioned versions are available with Pro.</p>
                            <Button onClick={() => setShowUpgrade(true)} className="w-full sm:w-auto">Unlock Resumix Pro — $19/month</Button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="rounded-xl border border-primary/20 bg-card p-6 text-center space-y-3">
                        <p className="text-sm font-medium text-foreground">Create a free account to run your own alignment — 3 free analyses included.</p>
                        <Button asChild className="w-full sm:w-auto"><a href="/auth">Get Started Free</a></Button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground italic text-center pt-2">This is a sample preview — paste your own experience to see your actual signal read.</p>
                  </div>
                )}

                {result && (
                  <>
                    {/* Professional Signal Diagnosis headline */}
                    <div className="text-center space-y-1">
                      <h2 className="text-lg font-semibold tracking-tight text-foreground">Professional Signal Diagnosis</h2>
                      <p className="text-xs text-muted-foreground">How hiring managers interpret your experience.</p>
                    </div>

                    {/* Analysis banner */}
                    {analysisTime > 0 && (
                      <p className="text-xs text-muted-foreground text-center">
                        Analyzed in {analysisTime}s · Zero fabrication · Your data stays private
                      </p>
                    )}

                    {/* Section 1: Signal Diagnosis with glow */}
                    <div className={`rounded-xl border bg-card p-5 md:p-6 space-y-4 transition-shadow duration-500 ${scoreRevealed ? "" : "shadow-[0_0_30px_-5px_hsl(var(--primary)/0.4)]"}`}>
                      <div className="flex items-center gap-2">
                        <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mt-2" style={{ letterSpacing: "0.15em" }}>Signal Diagnosis</h3>
                        <ScoreExplanation score={result.match_score} />
                      </div>
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

                      {/* Structured diagnosis insights from SignalModel */}
                      <div className="space-y-2 border-t border-border/40 pt-3">
                        {(result.signal_model?.gaps?.[0] || result.top_missing_signal) && (
                          <p className="text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">Top gap:</span> {result.signal_model?.gaps?.[0] || result.top_missing_signal}
                          </p>
                        )}
                        {(result.signal_model?.executive_insight_summary?.primary_strength || (result as any).executive_insight_summary?.primary_strength) && (
                          <p className="text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">Primary strength:</span> {result.signal_model?.executive_insight_summary?.primary_strength || (result as any).executive_insight_summary?.primary_strength}
                          </p>
                        )}
                        {(result.signal_model?.executive_insight_summary?.strategic_repositioning_opportunity || (result as any).executive_insight_summary?.strategic_repositioning_opportunity) && (
                          <p className="text-sm text-muted-foreground">
                            <span className="font-medium text-primary">Repositioning opportunity:</span> {result.signal_model?.executive_insight_summary?.strategic_repositioning_opportunity || (result as any).executive_insight_summary?.strategic_repositioning_opportunity}
                          </p>
                        )}
                      </div>

                      {result.score_rationale && result.score_rationale.length > 0 && (() => {
                        // Classification: use AI prefix tags first, then fallback heuristics
                        const strengths: string[] = [];
                        const gaps: string[] = [];
                        for (const r of result.score_rationale) {
                          const cleaned = r.replace(/^\[(STRENGTH|GAP)\]\s*/i, "");
                          if (/^\[STRENGTH\]/i.test(r)) {
                            strengths.push(cleaned);
                          } else if (/^\[GAP\]/i.test(r)) {
                            gaps.push(cleaned);
                          } else if (
                            /missing|lacks?|absent|no evidence|weak|gap|not\s|without|insufficient|unclear|not\s+demonstrated|under-?signal/i.test(r) &&
                            !/aligns?\s+with|translates?\s+to|demonstrates?|shows?|detected|evidenced/i.test(r)
                          ) {
                            gaps.push(cleaned);
                          } else {
                            strengths.push(cleaned);
                          }
                        }
                        return (
                          <div className="space-y-3">
                            {strengths.length > 0 && (
                              <div className="space-y-1">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground" style={{ letterSpacing: "0.15em" }}>What's Working</p>
                                <ul className="space-y-0.5">
                                  {strengths.map((r, i) => (
                                    <li key={i} className="text-xs text-muted-foreground">• {r}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {gaps.length > 0 && (
                              <div className="space-y-1">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground" style={{ letterSpacing: "0.15em" }}>What's Missing</p>
                                <ul className="space-y-0.5">
                                  {gaps.map((r, i) => (
                                    <li key={i} className="text-xs text-muted-foreground">• {r}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Signal Diagnostic Modules — free sections only (Why You're Not Getting Interviews) */}
                    <SignalDiagnosticModules
                      data={{
                        jd_signal_extraction: result.signal_model?.jd_signal_extraction || (result as any).jd_signal_extraction,
                        resume_signal_profile: result.signal_model?.resume_signal_profile || (result as any).resume_signal_profile,
                        signal_alignment_analysis: result.signal_model?.signal_alignment_analysis || (result as any).signal_alignment_analysis,
                        hiring_pipeline_simulation: result.signal_model?.risk_projection?.stages || (result as any).hiring_pipeline_simulation,
                        executive_insight_summary: result.signal_model?.executive_insight_summary || (result as any).executive_insight_summary,
                        transferable_signal_detection: result.signal_model?.transferable_signal_detection || (result as any).transferable_signal_detection,
                        signal_shift_estimates: result.signal_model?.signal_shift_estimates || (result as any).signal_shift_estimates,
                        signal_map: result.signal_model?.signal_map || (result as any).signal_map,
                        evidence_ledger: result.signal_model?.evidence_ledger,
                        career_signal_map: result.signal_model?.career_signal_map || (result as any).career_signal_map,
                        hiring_signal_benchmark: result.signal_model?.hiring_signal_benchmark || (result as any).hiring_signal_benchmark,
                        interview_gap_diagnosis: result.signal_model?.interview_gap_diagnosis || (result as any).interview_gap_diagnosis,
                        predicted_signal_lift: result.signal_model?.predicted_signal_lift || (result as any).predicted_signal_lift,
                        isPro: effectiveIsPro,
                        onUpgrade: () => setShowUpgrade(true),
                      }}
                      matchScore={result.match_score}
                    />

                    {/* Section 2: Calibrated Bullets */}
                    <CalibratedBulletsSection
                      bullet={bullet}
                      result={result}
                      effectiveIsPro={effectiveIsPro}
                      onUpgrade={() => setShowUpgrade(true)}
                    />

                    {/* Single unified Pro gate card for all gated sections */}
                    {!effectiveIsPro && (
                      <div className="rounded-lg border border-border bg-card p-6 text-center space-y-3">
                        <Lock className="h-5 w-5 text-muted-foreground mx-auto" />
                        <p className="text-sm font-semibold text-foreground">Unlock the full Signal Calibration Report — Resumix Pro</p>
                        <p className="text-xs text-muted-foreground">Signal Gap Actions, Calibrated Summary, Identity Strength Index, ATS Signal Panel, Interview Preparation, Cover Letter Engine, and more.</p>
                        {user ? (
                          <Button onClick={() => setShowUpgrade(true)} size="sm">Unlock Resumix Pro — $19/month</Button>
                        ) : (
                          <Button size="sm" asChild><a href="/auth">Get Started Free</a></Button>
                        )}
                      </div>
                    )}

                    {/* Pro-only sections — only render when Pro */}
                    {effectiveIsPro && (
                      <>
                        {/* Calibrated Summary */}
                        <CalibratedSummary
                          experience={bullet}
                          jd={jd}
                          isPro={effectiveIsPro}
                          onUpgrade={() => setShowUpgrade(true)}
                        />

                        {/* Signal Gap Actions */}
                        <SignalGapActions
                          experience={bullet}
                          jd={jd}
                          alignmentResult={result as any}
                          isPro={effectiveIsPro}
                          onUpgrade={() => setShowUpgrade(true)}
                        />

                        {result.identity_strength_index && (
                          <IdentityStrengthIndex
                            data={result.identity_strength_index}
                            isPro={effectiveIsPro}
                            onUpgrade={() => setShowUpgrade(true)}
                            inferredRoleTitle={result.inferred_role_title}
                          />
                        )}

                        {/* ATS Signal Panel */}
                        <ATSSignalPanel
                          experience={bullet}
                          jd={jd}
                          isPro={effectiveIsPro}
                          onUpgrade={() => setShowUpgrade(true)}
                        />

                        {(result.alignment_notes || result.gap_suggestions) && (
                          <LevelDeterminationBlock
                            score={result.match_score}
                            alignmentNotes={result.alignment_notes}
                            gapSuggestions={result.gap_suggestions}
                            confidenceLevel={result.alignment_confidence_level}
                            inferredRoleTitle={result.inferred_role_title}
                            isPro={effectiveIsPro}
                            isAuthenticated={!!user}
                            onUpgrade={() => setShowUpgrade(true)}
                          />
                        )}

                      </>
                    )}

                    {/* Interview Intelligence — visible to all users, internally gates questions 2+ */}
                    <InterviewIntelligence
                      experience={bullet}
                      jd={jd}
                      alignmentResult={result as any}
                      isPro={effectiveIsPro}
                      onUpgrade={() => setShowUpgrade(true)}
                    />

                    <KeywordChips keywords={result.missing_keywords} />

                    {result.match_score < 60 && (
                      <WeakAlignmentNudge
                        additionalContext={additionalContext}
                        onContextChange={setAdditionalContext}
                      />
                    )}

                    {/* Export — Copy Calibration Report */}
                    <ExportResults result={result} />
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </section>

      {/* FAQ */}
      <section className="py-12 container max-w-[780px]">
        <h2 className="text-xl font-semibold tracking-tight text-foreground mb-6 text-center" style={{ letterSpacing: "0.02em" }}>
          Frequently Asked Questions
        </h2>
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="who-is-it-for">
            <AccordionTrigger className="text-sm text-foreground hover:no-underline">Who is Resumix for?</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
              Resumix is built for professionals actively applying to jobs who want to understand how hiring managers actually read their experience — and fix it before it costs them interviews. It works best for people with real work history who are targeting specific roles and want signal-level feedback, not generic resume tips. It is not a resume writer. It is a signal calibration engine.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="fabrication">
            <AccordionTrigger className="text-sm text-foreground hover:no-underline">Does Resumix make things up?</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
              No. Resumix never invents experience, metrics, or achievements. All insights are derived from the information you provide.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="chatgpt">
            <AccordionTrigger className="text-sm text-foreground hover:no-underline">How is this different from ChatGPT?</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
              ChatGPT generates text. Resumix models how hiring managers interpret professional signals across the hiring pipeline. Instead of simply reframing resumes, Resumix diagnoses perception gaps and shows how to reposition your experience without fabricating anything.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="ats">
            <AccordionTrigger className="text-sm text-foreground hover:no-underline">Is this just ATS keyword stuffing?</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
              No. Resumix calibrates how your actual experience reads to a human reviewer — the recruiter scanning for ownership signal, the hiring manager assessing strategic depth. Keywords are one output. Perception is the goal.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="full-analysis">
            <AccordionTrigger className="text-sm text-foreground hover:no-underline">What does a full analysis give me?</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
              A Signal Diagnosis score showing exactly where your resume breaks down across the hiring process. Calibrated bullet repositioning. An Identity Strength Index across four hiring pillars. A 5-stage Signal Risk Projection showing where you'll face friction at each interview stage. And on Pro — a complete 12-section Signal Positioning Report including gap strategy, bullet recalibration, interview script, cover letter, and match score forecast. All from your actual experience. Nothing invented.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="pricing">
            <AccordionTrigger className="text-sm text-foreground hover:no-underline">How much does Resumix cost?</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
              You can run up to 3 free alignments per day at no cost. Resumix Pro is $19/month and unlocks unlimited alignments, the full Signal Positioning Report, Calibrated Resume builder, and all advanced features. You can cancel anytime — no contracts, no commitments.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="data-privacy">
            <AccordionTrigger className="text-sm text-foreground hover:no-underline">What happens to my data?</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
              Your resume and job description data are processed only to generate your analysis. We never share your data with third parties and it is never used to train AI models. You can review our full privacy practices on our Privacy Policy page.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="cancel">
            <AccordionTrigger className="text-sm text-foreground hover:no-underline">Can I cancel my subscription?</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
              Yes. You can cancel anytime and your Pro access will remain active through the end of your billing period. No refunds are issued for partial months, but you will never be charged again after cancellation.
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
        isAuthenticated={!!user}
      />
    </div>
  );
};

export default Index;
