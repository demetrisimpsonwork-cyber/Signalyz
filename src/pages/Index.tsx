import { useState, useEffect, useRef, useCallback, useMemo, Component, type ReactNode, type ErrorInfo } from "react";
import {
  trackEvent,
  ga4ScoreBucket,
  trackReliabilityError,
  trackAnalysisStarted,
  trackAnalysisCompleted,
  trackCheckoutSuccess,
  type PlanTier,
} from "@/lib/analytics";
import { clearUpgradeIntent, parseUpgradeIntent, readStoredUpgradeIntent } from "@/lib/upgradeIntent";
import {
  durationBucket,
  signalStrengthEvent,
} from "@/lib/analyticsHelpers";
import { consumeHistoryAnalyzeHandoff } from "@/lib/alignmentHistoryHandoff";
import { detectRoleCategory } from "@signalyz/coverLetterRoleStyle";
import { clearLinkedInOutputCache } from "@/lib/linkedInOutputCache";
import { sanitizeResumeText } from "@/lib/sanitize";
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
import SignalActionPlan, { deriveActions } from "@/components/SignalActionPlan";
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
import { Loader2, Sparkles, Layers, Shield, LockKeyhole, Quote, Lock, RefreshCw, Check, X } from "lucide-react";
import AlignmentLoader from "@/components/AlignmentLoader";
import { computeDeterministicScore } from "@/lib/deterministicScore";
import { evaluateCredentialGate } from "@/lib/credentialGate";
import { parseScoreRationale } from "@/lib/scoreEvidence";
import { buildScoringEvidence } from "@/lib/scoringEvidenceBuilder";
import {
  getDirectorReportEnrichmentKey,
  logDirectorRawRenderedMs,
  markDirectorEnrichmentSuperseded,
  runBackgroundDirectorEvidenceEnrichment,
} from "@/lib/evidenceRetrieval";
import type { ScoringEvidence } from "@/lib/scoringEvidenceTypes";
import ScoreEvidencePanel from "@/components/ScoreEvidencePanel";
import LevelDeterminationBlock from "@/components/LevelDeterminationBlock";
import DirectorCalibrationBlock, { type DirectorCalibrationResult } from "@/components/DirectorCalibrationBlock";
import { supabase } from "@/integrations/supabase/client";
import { invokeResilient, FRIENDLY_FAIL_MSG, StructuredEdgeError } from "@/lib/resilientEdgeFn";
import { DIRECTOR_CALIBRATION_TIMEOUT_MS, ALIGNMENT_TIMEOUT_MS } from "@/lib/hiringReportConfig";
import { compactJdForHiringReport } from "@signalyz/hiringReportJdCompaction";
import {
  classifyHiringReportErrorCode,
  mapHiringReportErrorToUserMessage,
  HIRING_REPORT_USER_MESSAGE,
} from "@/lib/hiringReportErrors";
import { useAuth } from "@/hooks/useAuth";
import { useDailyUsage } from "@/hooks/useDailyUsage";
import { useResumeRetrievalIngestion } from "@/hooks/useResumeRetrievalIngestion";
import {
  extractPrimaryResumeBullet,
  getResumeSessionId,
  retrieveCalibrationEvidencePackage,
  type EvidencePackageItem,
} from "@/services/rag/groundedCalibrationClient";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useSubscription } from "@/hooks/useSubscription";
import { useReportRunAccess } from "@/hooks/useReportRunAccess";
import { withReportRunFields } from "@/lib/reportRunSession";
import { runClientSourceResumeAstShadow } from "@/lib/resumeAstShadow";
import { ProGate } from "@/components/ProGate";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { ANALYSIS_CLEARED_EVENT, GO_TO_ALIGNMENT_EVENT } from "@/lib/clearSession";
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
    label: "AI Engineer",
    bullet: `Alex Rivera\nFull Stack Engineer | Brooklyn, NY\n\nExperience\n\nSoftware Engineer | Signalyz | 2023 - Present\n- Built a production AI resume intelligence platform using React, TypeScript, Supabase, and PostgreSQL.\n- Integrated Claude API and LLM orchestration for grounded calibration workflows with evaluation guardrails.\n- Implemented Stripe subscriptions and one-time checkout for tiered product access.\n- Shipped DOCX/PDF export pipeline with QA checks, observability logging, and regression validation.\n- Added RAG/vector search for resume-to-role signal matching and shadow evaluation tooling.\n\nSkills: TypeScript, React, Supabase, PostgreSQL, Stripe, LLM APIs, DOCX/PDF export, QA automation`,
    jd: `Applied AI Engineer / Full Stack AI Engineer\n\nWe are hiring an engineer to build LLM-powered product workflows end to end. You will ship TypeScript/React features, design reliable APIs, integrate model orchestration, and own evaluation, observability, and production quality.\n\nRequirements: TypeScript, React, API design, LLM workflow integration, testing/evaluation discipline, production reliability, PostgreSQL or similar, comfort with shipping user-facing AI features.`,
    sampleA: "Built and shipped a production AI resume intelligence platform in React and TypeScript — integrating Claude API workflows, Stripe monetization, and DOCX/PDF export with QA and observability guardrails.",
    sampleB: "Owned full-stack delivery for LLM calibration features — PostgreSQL data models, Supabase edge orchestration, vector/RAG matching, and evaluation tooling for production reliability.",
    perceptionSnapshot: { "Production Engineering Signal": "High", "LLM Workflow Depth": "Moderate", "Evaluation & QA Rigor": "Moderate", "Seniority Weight": "Moderate" },
    roleWeightsMost: ["End-to-end ownership of LLM product workflows", "TypeScript/React delivery with production reliability", "Evaluation, observability, and regression discipline", "API design and grounded output quality"],
    perceptionInsights: ['"Built a production AI resume intelligence platform" anchors real shipped product work — strong signal for applied AI engineering.', '"Integrated Claude API and LLM orchestration" shows workflow depth but evaluation methodology could be more explicit.', '"Added RAG/vector search" is relevant — tie it more directly to hiring-manager outcomes like match quality and failure detection.'],
  },
  {
    label: "Customer Success",
    bullet: `Jordan Lee\nCustomer Success Manager | Austin, TX\n\nExperience\n\nCustomer Success Manager | Relay SaaS | 2021 - Present\n- Managed a SaaS customer portfolio across onboarding, adoption check-ins, renewal planning, and escalation resolution.\n- Led quarterly business reviews with account stakeholders to surface risk signals and coordinate remediation plans.\n- Partnered with product and support on recurring issue patterns, improving handoff clarity and response consistency.\n- Tracked customer health indicators in CRM and flagged at-risk accounts before renewal cycles.\n\nSkills: Customer onboarding, renewals, QBRs, CRM, escalation management, cross-functional communication`,
    jd: `Customer Success Manager\n\nOwn a portfolio of mid-market SaaS accounts. Drive onboarding, adoption, renewals, and escalation resolution. Lead QBRs, monitor customer health, and partner with product and support on retention improvements.\n\nRequirements: portfolio ownership, renewal conversations, QBR facilitation, CRM proficiency, clear written communication, escalation judgment, customer health tracking.`,
    sampleA: "Owned portfolio outcomes across onboarding, adoption, and renewal planning — leading QBRs that surfaced risk signals early and coordinating remediation with product and support.",
    sampleB: "Managed SaaS account health end to end — tracking CRM indicators, flagging at-risk renewals, and tightening escalation handoffs to improve response consistency.",
    perceptionSnapshot: { "Portfolio Ownership Signal": "Moderate", "Retention & Risk Read": "Moderate", "Executive Communication": "Low", "Seniority Weight": "Moderate" },
    roleWeightsMost: ["Portfolio ownership with renewal accountability", "Proactive customer health and risk detection", "QBR facilitation with clear business framing", "Cross-functional escalation and adoption coaching"],
    perceptionInsights: ['"Managed a SaaS customer portfolio" reads as scope ownership — strengthen renewal outcome language for hiring managers.', '"Led quarterly business reviews" signals facilitation; frame QBRs around risk, adoption, and renewal decisions.', '"Partnered with product and support" is collaborative — elevate to retention impact without inventing metrics.'],
  },
  {
    label: "Career Pivot",
    bullet: `Morgan Patel\nClaims Operations Specialist | Newark, NJ\n\nExperience\n\nClaims Operations Specialist | Horizon Benefits Group | 2019 - Present\n- Managed high-volume caseloads involving eligibility review, documentation checks, and compliance-sensitive processing.\n- Coordinated workflow handoffs across operations, support, and policy teams to resolve case blockers.\n- Drafted clear customer-facing updates and internal notes for complex claim status scenarios.\n- Identified recurring documentation gaps and proposed process checklists to reduce rework.\n\nPrior: Customer Support Associate | Horizon Benefits Group | 2017 - 2019\n- Handled inbound support requests, triaged issues, and documented resolution patterns for operations review.\n\nSkills: Case management, documentation, compliance awareness, customer communication, process improvement, cross-functional coordination`,
    jd: `AI Operations Analyst / Technical Support Operations\n\nSupport our product operations team with process thinking, issue triage, documentation quality, and cross-functional resolution. Partner with support, engineering, and QA to improve tooling, workflows, and reliability.\n\nRequirements: operations or support background, high-volume casework, documentation discipline, QA-minded problem solving, comfort with technical products, stakeholder communication.`,
    sampleA: "Managed high-volume eligibility and documentation casework — coordinating cross-functional handoffs and drafting customer updates that reduced confusion on complex claim statuses.",
    sampleB: "Repositioned operations experience for technical support workflows — triaging issues, documenting resolution patterns, and proposing checklists that cut rework across support and policy teams.",
    perceptionSnapshot: { "Process & Documentation Signal": "High", "Technical Product Fluency": "Low", "Cross-Functional Coordination": "Moderate", "Pivot Readiness": "Moderate" },
    roleWeightsMost: ["Operations rigor with documentation discipline", "Issue triage and root-cause thinking", "QA-minded process improvement", "Clear communication across technical and non-technical teams"],
    perceptionInsights: ['"Managed high-volume caseloads" shows operational stamina — map this to support ops throughput and queue discipline.', '"Coordinated workflow handoffs" is transferable but needs technical product vocabulary for the pivot.', '"Proposed process checklists" is a strong QA/process signal — connect it to tooling and workflow reliability language.'],
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
  calibrated_bullets?: Array<{
    text: string;
    original_bullet?: string;
    variant?: string;
    used_evidence: EvidencePackageItem[];
    grounding_status: "grounded" | "low_confidence" | "ungrounded_blocked";
  }>;
  grounding_context?: {
    evidence_count: number;
    original_bullet: string | null;
    missing_signal: string | null;
  };
  scoring_evidence?: ScoringEvidence;
}

function getSessionToken(): string {
  const key = "signalyz_session_token";
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
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[DirectorCalibrationErrorBoundary]", error.message, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <p className="text-sm text-foreground leading-relaxed">
            Your Hiring Report couldn't be generated. This can happen with very long or complex resumes — please click retry.
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
  // Strip HTML/entities, invisible Unicode, smart quotes, and paste artifacts
  // before the lighter control-character/whitespace normalization.
  let cleaned = sanitizeResumeText(text)
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
  if (score >= 70) return "Interview Range";
  if (score >= 60) return "Strong";
  if (score >= 40) return "Moderate";
  return "Low Signal";
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
  directorRequestId,
  reportRunFingerprint,
  planTier,
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
  directorRequestId?: string;
  reportRunFingerprint?: string;
  planTier?: PlanTier;
}) {
  // HARD GATE: If no current-session alignment result, render ONLY the empty state
  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <p className="text-sm text-muted-foreground">Run your resume analysis first to generate your Hiring Report</p>
        <Button variant="outline" size="sm" onClick={onRunAlignment}>
          Analyze My Resume →
        </Button>
      </div>
    );
  }

  // Full report UI — only mounts when result exists
  return (
    <div className="grid gap-8 lg:grid-cols-2 w-full min-w-0 overflow-hidden">
      <div className="space-y-4 min-w-0 overflow-hidden">
        <div>
          <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-1">Hiring Report</p>
          <h2 className="text-base font-semibold text-foreground mb-1">See exactly how recruiters and hiring managers read your resume</h2>
          <p className="text-xs text-muted-foreground leading-relaxed mb-4">
            Find out where you get screened out and how to fix it — using only the experience you already have. Built from your real experience — no invented employers, titles, or credentials. Private analysis.
          </p>

          {/* Confirmed inputs cards */}
          <div className="space-y-3 mb-5">
            <div className="rounded-lg border bg-card px-4 py-3 flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Resume detected from your analysis</p>
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
          Generate My Hiring Report
        </Button>
        <p className="text-[11px] text-muted-foreground/70">This usually takes 1–3 minutes for longer reports. Built from your real experience • Your data stays private.</p>
      </div>
      <div className="space-y-4 min-w-0 overflow-hidden">
        {directorLoading && <PositioningLoader minHeight="300px" />}
        {directorError && !directorLoading && (
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <p className="text-sm text-foreground leading-relaxed">{directorError}</p>
            <Button onClick={onRunDirector} variant="outline" className="w-full gap-2">
              <RefreshCw className="h-4 w-4" />
              Retry Analysis
            </Button>
          </div>
        )}
        {directorResult && !directorLoading && !directorError && (
          <DirectorCalibrationErrorBoundary onRetry={onRunDirector}>
            <DirectorCalibrationBlock
              result={directorResult}
              isPro={isPro}
              onUpgrade={onUpgrade}
              isAuthenticated={isAuthenticated}
              targetRoleTitle={result.inferred_role_title}
              resumeText={bullet}
              jdText={jd}
              requestId={directorRequestId}
              reportRunFingerprint={reportRunFingerprint}
              planTier={planTier}
            />
          </DirectorCalibrationErrorBoundary>
        )}
      </div>
    </div>
  );
}

const Index = () => {
  const [mode, setMode] = useState<"alignment" | "linkedin" | "director" | "calibrated" | "coverletter">("alignment");
  const [bullet, setBullet] = useState("");
  const [inputSource, setInputSource] = useState<"paste" | "pdf" | "docx">("paste");
  const [isResumeFromCalibrated, setIsResumeFromCalibrated] = useState(false);
  const [resultRunType, setResultRunType] = useState<"original" | "calibrated">("original");
  const calibratedRunPendingRef = useRef(false);
  const overrideResumeRef = useRef<string | null>(null);
  // Session restore tracking: true when bullet/jd came from localStorage, false once user edits
  const sessionRestoredRef = useRef(false);
  const userDirtyRef = useRef(false); // true once user manually changes input
  const [originalResumeBeforeCalibration, setOriginalResumeBeforeCalibration] = useState<string | null>(() => {
    try { return localStorage.getItem("signalyz_original_resume_baseline"); } catch { return null; }
  });
  const [originalBaselineScore, setOriginalBaselineScore] = useState<number | null>(() => {
    try { const v = localStorage.getItem("signalyz_original_baseline_score"); return v ? Number(v) : null; } catch { return null; }
  });
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
  const [paymentActivating, setPaymentActivating] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("upgrade") === "success" || params.get("purchase") === "success";
  });

  // Executive Audit state
  const [directorExperience, setDirectorExperience] = useState("");
  const [directorResult, setDirectorResult] = useState<DirectorCalibrationResult | null>(null);
  const [directorRequestId, setDirectorRequestId] = useState<string | undefined>(undefined);
  const [directorLoading, setDirectorLoading] = useState(false);
  const [directorError, setDirectorError] = useState<string | null>(null);
  const [lastDebug, setLastDebug] = useState<DebugInfo | null>(null);
  const [alignmentError, setAlignmentError] = useState<DebugInfo | null>(null);
  const [inputTruncated, setInputTruncated] = useState(false);
  const lastClickRef = useRef(0);
  const directorEnrichmentKeyRef = useRef<string | null>(null);

  const { user } = useAuth();
  const { isPro, isFree, hasOneTimeCredit, hasConsumedOneTimeCredit, dailyRunsRemaining, loading: subLoading, refresh: refreshSub } = useSubscription();
  const isAdmin = useIsAdmin();
  const { activeRunMatch, hasRedeemedCurrentRun, accessLookupPending, reportRunFields, rememberActiveRun } = useReportRunAccess(
    user?.id,
    bullet,
    jd,
  );
  const effectiveIsPro =
    isPro || isAdmin || hasOneTimeCredit || activeRunMatch || hasRedeemedCurrentRun;
  const planTier: PlanTier =
    isPro || isAdmin
      ? "pro"
      : hasOneTimeCredit || activeRunMatch || hasRedeemedCurrentRun
        ? "one_time"
        : "free";
  const { remaining, limitReached, increment, DAILY_FREE_LIMIT } = useDailyUsage(effectiveIsPro);
  useResumeRetrievalIngestion(bullet, inputSource);
  const [searchParams, setSearchParams] = useSearchParams();
  const [analysisSessionKey, setAnalysisSessionKey] = useState(0);
  const [assemblySessionKey, setAssemblySessionKey] = useState(0);
  const runSessionKey = `${analysisSessionKey}-${assemblySessionKey}`;
  const jdInputTrackedRef = useRef(false);
  const jdPastedTrackedRef = useRef(false);
  const resumePasteTrackedRef = useRef(false);
  const lastInputStrengthRef = useRef<PasteQuality | null>(null);
  const [upgradeContext, setUpgradeContext] = useState<{ feature_name?: string; output_type?: string }>({});
  const [showRestoredBanner, setShowRestoredBanner] = useState(false);
  const prevUserRef = useRef<typeof user>(undefined);

  const resetAllAnalysisState = useCallback(() => {
    sessionRestoredRef.current = false;
    userDirtyRef.current = false;
    setShowRestoredBanner(false);
    setMode("alignment");
    setBullet("");
    setJd("");
    setResult(null);
    setDirectorResult(null);
    setDirectorRequestId(undefined);
    setDirectorExperience("");
    setDirectorLoading(false);
    setDirectorError(null);
    setSessionResumeAssembled(false);
    setResultRunType("original");
    setOriginalResumeBeforeCalibration(null);
    setOriginalBaselineScore(null);
    setAlignmentError(null);
    setErrors({});
    setShowSamples(false);
    setScoreRevealed(false);
    setAnalysisTime(0);
    setIsResumeFromCalibrated(false);
    setInputSource("paste");
    calibratedRunPendingRef.current = false;
    overrideResumeRef.current = null;
    jdInputTrackedRef.current = false;
    jdPastedTrackedRef.current = false;
    resumePasteTrackedRef.current = false;
    lastInputStrengthRef.current = null;
    clearLinkedInOutputCache();
    setAnalysisSessionKey((k) => k + 1);
  }, []);

  // Handle ?tab= query param for deep-linking (e.g. /position redirect, Align nav)
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "director" || tabParam === "alignment" || tabParam === "calibrated" || tabParam === "coverletter" || tabParam === "linkedin") {
      setMode(tabParam);
      const next = new URLSearchParams(searchParams);
      next.delete("tab");
      setSearchParams(next, { replace: true });
      if (tabParam === "alignment") {
        setTimeout(() => {
          document.getElementById("alignment-tool")?.scrollIntoView({ behavior: "smooth" });
        }, 100);
      }
    }
  }, [searchParams, setSearchParams]);

  // Align nav while already on home — switch tab without losing session data
  useEffect(() => {
    const handler = () => {
      setMode("alignment");
      requestAnimationFrame(() => {
        document.getElementById("alignment-tool")?.scrollIntoView({ behavior: "smooth" });
      });
    };
    window.addEventListener(GO_TO_ALIGNMENT_EVENT, handler);
    return () => window.removeEventListener(GO_TO_ALIGNMENT_EVENT, handler);
  }, []);

  // Sign-out / explicit session clear — reset in-memory analysis UI
  useEffect(() => {
    const onCleared = () => resetAllAnalysisState();
    window.addEventListener(ANALYSIS_CLEARED_EVENT, onCleared);
    return () => window.removeEventListener(ANALYSIS_CLEARED_EVENT, onCleared);
  }, [resetAllAnalysisState]);

  useEffect(() => {
    if (prevUserRef.current && !user) {
      resetAllAnalysisState();
    }
    prevUserRef.current = user;
  }, [user, resetAllAnalysisState]);

  // Post-upgrade / post-purchase success toast + payment_completed tracking
  useEffect(() => {
    if (searchParams.get("upgrade") === "success") {
      trackCheckoutSuccess({ payment_mode: "subscription", success: true });
      toast("Your calibrated export is unlocked — scroll to see your changes", {
        icon: "✦",
        duration: 5000,
        style: { background: "linear-gradient(135deg, hsl(174, 62%, 47%), hsl(174, 62%, 35%))", color: "white", border: "none" },
      });
      searchParams.delete("upgrade");
      setSearchParams(searchParams, { replace: true });
      refreshSub();
      // Scroll to results if they exist
      setTimeout(() => {
        document.getElementById("alignment-tool")?.scrollIntoView({ behavior: "smooth" });
      }, 500);
    }
    if (searchParams.get("purchase") === "success") {
      trackCheckoutSuccess({ payment_mode: "one_time", success: true });
      toast("Your calibrated export is unlocked — scroll to see your changes", {
        icon: "✦",
        duration: 5000,
        style: { background: "linear-gradient(135deg, hsl(174, 62%, 47%), hsl(174, 62%, 35%))", color: "white", border: "none" },
      });
      searchParams.delete("purchase");
      setSearchParams(searchParams, { replace: true });
      refreshSub();
      // Scroll to results if they exist
      setTimeout(() => {
        document.getElementById("alignment-tool")?.scrollIntoView({ behavior: "smooth" });
      }, 500);
    }
  }, []);

  // Clear payment activating state once subscription resolves or after max timeout
  useEffect(() => {
    if (!paymentActivating) return;
    if (isPro || hasOneTimeCredit) {
      setPaymentActivating(false);
      setTimeout(() => {
        document.getElementById("alignment-tool")?.scrollIntoView({ behavior: "smooth" });
      }, 300);
      return;
    }
    const timeout = setTimeout(() => setPaymentActivating(false), 15000);
    return () => clearTimeout(timeout);
  }, [paymentActivating, isPro, hasOneTimeCredit]);

  // Session recovery modal state
  const SESSION_KEY = "signalyz_last_analysis";
  const SESSION_VERSION = 2;
  // Session recovery modal state removed — sessions now auto-restore silently

  // Check for saved session on mount — only restore if user hasn't started new input
  // and the session is recent and this isn't a fresh login
  const MAX_SESSION_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours

  useEffect(() => {
    if (result) return; // already have results
    // If user already typed something before this effect runs, don't overwrite
    if (userDirtyRef.current) return;
    if (bullet.trim() || jd.trim()) return; // user already has input in fields

    const historyHandoff = consumeHistoryAnalyzeHandoff();
    if (historyHandoff) {
      setBullet(historyHandoff.resume_text);
      setJd(historyHandoff.jd_text);
      setTimeout(() => {
        document.getElementById("alignment-tool")?.scrollIntoView({ behavior: "smooth" });
      }, 300);
      return;
    }

    // Fresh login flag: don't auto-restore stale input on fresh sign-in
    // Check both sessionStorage (survives same-tab nav) and localStorage (survives OAuth redirect)
    const FRESH_LOGIN_TTL_MS = 2 * 60 * 1000; // 2 minutes
    try {
      const sessionFlag = sessionStorage.getItem("signalyz_fresh_login");
      const localFlag = localStorage.getItem("signalyz_fresh_login");
      const isFreshLogin = !!sessionFlag || (!!localFlag && Date.now() - Number(localFlag) < FRESH_LOGIN_TTL_MS);
      if (isFreshLogin) {
        // Consume both flags so future restores aren't blocked
        sessionStorage.removeItem("signalyz_fresh_login");
        localStorage.removeItem("signalyz_fresh_login");
        return;
      }
      // Clean up any expired localStorage flag
      if (localFlag) localStorage.removeItem("signalyz_fresh_login");
    } catch {}

    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (parsed.v !== SESSION_VERSION || !parsed.result || !parsed.bullet || !parsed.jd) {
        localStorage.removeItem(SESSION_KEY);
        return;
      }
      // Reject stale sessions older than 4 hours
      if (parsed.ts && Date.now() - parsed.ts > MAX_SESSION_AGE_MS) {
        localStorage.removeItem(SESSION_KEY);
        return;
      }
      // Mark as restored so we can invalidate if user edits
      sessionRestoredRef.current = true;
      setShowRestoredBanner(true);
      trackEvent("prior_run_restored", { plan_tier: planTier });
      setResult(parsed.result);
      setBullet(typeof parsed.bullet === "string" ? parsed.bullet : String(parsed.bullet ?? ""));
      setJd(typeof parsed.jd === "string" ? parsed.jd : String(parsed.jd ?? ""));
      if (parsed.runType === "calibrated") setResultRunType("calibrated");
      if (parsed.originalBaseline && !originalResumeBeforeCalibration) {
        setOriginalResumeBeforeCalibration(parsed.originalBaseline);
        try { localStorage.setItem("signalyz_original_resume_baseline", parsed.originalBaseline); } catch {}
      }
      // Scroll to results after restore (skip if post-payment overlay is active)
      const isPostPayment = searchParams.get("upgrade") === "success" || searchParams.get("purchase") === "success";
      if (!isPostPayment) {
        setTimeout(() => {
          document.getElementById("alignment-tool")?.scrollIntoView({ behavior: "smooth" });
        }, 400);
      }
    } catch {
      localStorage.removeItem(SESSION_KEY);
    }
  }, []);

  // Score is computed deterministically inside handleOptimize and stored on result — no reactive recomputation
  const displayScore = result?.match_score ?? 0;
  const displayBreakdown = result?.scoring_breakdown;

  const animatedScore = useCountUp(displayScore, 1200);

  // Invalidate stale restored results when user edits input
  const invalidateStaleSession = useCallback(() => {
    if (sessionRestoredRef.current) {
      trackEvent("new_analysis_started_after_history", { plan_tier: planTier });
      // User changed input after a restore — clear old results
      sessionRestoredRef.current = false;
      setShowRestoredBanner(false);
      setResult(null);
      setDirectorResult(null);
      setDirectorRequestId(undefined);
      setSessionResumeAssembled(false);
      setAlignmentError(null);
    }
    clearLinkedInOutputCache();
    userDirtyRef.current = true;
  }, []);

  // Tab view analytics — fires when user switches output surfaces
  useEffect(() => {
    if (!result) return;
    const base = { plan_tier: planTier, auth_state: user ? "signed_in" as const : "anonymous" as const };
    if (mode === "director") {
      trackEvent("report_tab_viewed", { ...base, source_tab: "director" });
      trackEvent("hiring_report_viewed", { ...base, output_type: "report" });
      trackEvent("report_viewed", { ...base, output_type: "report" });
    } else if (mode === "calibrated") {
      trackEvent("calibrated_resume_viewed", { ...base, source_tab: "calibrated", output_type: "calibrated_resume" });
    } else if (mode === "coverletter") {
      trackEvent("cover_letter_viewed", { ...base, source_tab: "coverletter", output_type: "cover_letter" });
    } else if (mode === "linkedin") {
      trackEvent("linkedin_viewed", { ...base, source_tab: "linkedin", output_type: "linkedin" });
    } else if (mode === "alignment") {
      trackEvent("resume_analysis_viewed", { ...base, source_tab: "alignment", output_type: "resume" });
    }
  }, [mode, result, planTier, user]);

  const inputStrength = useMemo(() => {
    if (bullet.trim().length <= 20) return null;
    return getPasteQuality(parseResumeIntake(bullet));
  }, [bullet]);

  useEffect(() => {
    if (!inputStrength || inputStrength === lastInputStrengthRef.current) return;
    lastInputStrengthRef.current = inputStrength;
    trackEvent("input_strength_changed", {
      input_strength: inputStrength,
      plan_tier: planTier,
    });
  }, [inputStrength, planTier]);

  const openUpgradeModal = useCallback(
    (ctx?: { feature_name?: string; output_type?: string }) => {
      if (ctx?.feature_name) {
        trackEvent("pro_feature_blocked", {
          feature_name: ctx.feature_name,
          output_type: ctx.output_type,
          plan_tier: planTier,
        });
      }
      setUpgradeContext(ctx ?? {});
      setShowUpgrade(true);
    },
    [planTier],
  );

  // Post-auth upgrade intent — open modal with both tier options
  useEffect(() => {
    if (!user) return;
    if (searchParams.get("upgrade") !== "open") return;

    const intent = parseUpgradeIntent(window.location.search) ?? readStoredUpgradeIntent();
    openUpgradeModal({
      feature_name: intent === "one_time" ? "final_apply_check" : "active_job_search",
      output_type: intent === "one_time" ? "one_time" : "subscription",
    });
    clearUpgradeIntent();
    searchParams.delete("upgrade");
    searchParams.delete("intent");
    setSearchParams(searchParams, { replace: true });
  }, [user, searchParams, setSearchParams, openUpgradeModal]);

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
        label: "Resume Analysis",
        shortLabel: "Analysis",
        sublabel: "Your match score + diagnosis",
        status: alignmentDone ? "complete" as const : "active" as const,
        completedAt: null,
      },
      {
        id: "report",
        label: "Hiring Report",
        shortLabel: "Report",
        sublabel: "Deep recruiter + hiring-manager read",
        status: getStatus("report", reportDone, alignmentDone),
        completedAt: null,
        lockedReason: "Complete your Resume Analysis first",
      },
      {
        id: "resume",
        label: "Calibrated Resume",
        shortLabel: "Resume",
        sublabel: "Assembled + export ready",
        status: getStatus("resume", resumeDone, reportDone),
        completedAt: null,
        lockedReason: "Run your Hiring Report first",
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


  const CREDENTIAL_BLOCK_MSG =
    "This role requires credentials not found in your resume. Signalyz works best when your experience already qualifies you — the signal just needs repositioning.";

  const looksLikeResume = (text: string): boolean => {
    const t = text.toLowerCase();
    let signals = 0;
    // Date patterns (2019, 01/2020, Jan 2021, 2020–2022, etc.)
    if (/\b(19|20)\d{2}\b/.test(text)) signals++;
    // Action verbs common in resumes
    if (/\b(managed|led|developed|created|built|improved|directed|implemented|designed|delivered|coordinated|analyzed|organized|supported|oversaw|spearheaded|launched|trained|maintained|executed|reduced|increased|streamlined|automated|facilitated|negotiated)\b/i.test(text)) signals++;
    // Job-title-like words
    if (/\b(manager|director|engineer|analyst|coordinator|specialist|associate|lead|intern|consultant|developer|designer|administrator|supervisor|assistant|executive|officer|representative)\b/i.test(t)) signals++;
    // Contact patterns (email or phone)
    if (/[\w.+-]+@[\w.-]+\.\w{2,}/.test(text) || /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.test(text)) signals++;
    // Company/education indicators
    if (/\b(inc\.|llc|ltd|corp|university|college|school|bachelor|master|mba|b\.?s\.?|m\.?s\.?|ph\.?d)\b/i.test(text)) signals++;
    // Bullet-like patterns (• or -)
    if (/^[\s]*[•\-–—]\s/m.test(text)) signals++;
    return signals >= 2;
  };

  const looksLikeJobDescription = (text: string): boolean => {
    const t = text.toLowerCase();
    let signals = 0;
    // Requirement/qualification language
    if (/\b(requirements?|qualifications?|responsibilities|experience required|must have|preferred|required|nice to have|what you.?ll do|about the role|we are looking for|you will|ideal candidate)\b/i.test(text)) signals++;
    // Job-title-like words
    if (/\b(manager|director|engineer|analyst|coordinator|specialist|lead|developer|designer|consultant|associate)\b/i.test(t)) signals++;
    // Years of experience
    if (/\d+\+?\s*years?\s*(of\s+)?experience/i.test(text)) signals++;
    // Skills/tools
    if (/\b(proficien|experienc|knowledge of|familiar with|ability to|strong|excellent|skills?|track record)\b/i.test(text)) signals++;
    // Bullet-like patterns
    if (/^[\s]*[•\-–—]\s/m.test(text)) signals++;
    return signals >= 2;
  };

  const validate = () => {
    if (sampleLoadedRef.current) {
      sampleLoadedRef.current = false;
      setErrors({});
      return true;
    }
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
    if (!looksLikeResume(bullet.trim())) {
      errs.bullet = "This doesn't look like a resume. Paste your work experience or upload a file to get your signal read.";
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
    if (!looksLikeJobDescription(jd.trim())) {
      errs.jd = "Paste a real job description to run your alignment.";
      setErrors(errs);
      return false;
    }
    // Credential gate — hardened regex + context; structured matches for transparency
    const credentialGate = evaluateCredentialGate(bullet.trim(), jd.trim());
    if (credentialGate.blocked) {
      setAlignmentError({
        message: CREDENTIAL_BLOCK_MSG,
        error_code: "CREDENTIAL_MISMATCH",
        credential_matches: credentialGate.matches.map((m) => ({
          label: m.label,
          matchedText: m.matchedText,
          jdExcerpt: m.jdExcerpt,
        })),
      });
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
      toast.error("Run your resume analysis first to load your resume.");
      return;
    }
    if (normResume.text.length < 300) {
      setDirectorError("Your resume is too short to analyze. Go back to Resume Analysis and paste your full resume.");
      return;
    }
    if (normResume.truncated) setInputTruncated(true);
    setDirectorExperience(normResume.text);
    runClientSourceResumeAstShadow({ sourceResumeText: normResume.text });
    setDirectorLoading(true);
    // Don't clear directorResult eagerly — preserve as fallback if this run fails
    setDirectorError(null);
    // telemetry: positioning_run_clicked

    const requestStartedAt = new Date().toISOString();
    const requestStartMs = Date.now();
    markDirectorEnrichmentSuperseded(directorEnrichmentKeyRef, requestStartMs);
    let requestSucceeded = false;

    try {
      const rawJd = jd?.trim() || "";
      const compactedJd = rawJd ? compactJdForHiringReport(rawJd).compacted : undefined;

      const data = await invokeResilient(
        "director",
        "director-calibration",
        withReportRunFields(
          {
            experience: normResume.text,
            jd: compactedJd || undefined,
            deterministic: false,
          },
          reportRunFields,
        ),
        DIRECTOR_CALIBRATION_TIMEOUT_MS,
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

      const directorData = data as DirectorCalibrationResult;

      // Validate the result has minimum required fields
      if (!directorData || !directorData.dimensions || !directorData.director_signal_tier) {
        throw new Error(HIRING_REPORT_USER_MESSAGE);
      }

      const enrichmentKey = getDirectorReportEnrichmentKey(
        directorData,
        data?.request_id,
        requestStartMs,
      );
      directorEnrichmentKeyRef.current = enrichmentKey;

      setDirectorResult(directorData);
      setDirectorRequestId(data?.request_id);
      setDirectorLoading(false);
      void rememberActiveRun();
      logDirectorRawRenderedMs(requestStartMs, enrichmentKey);
      requestSucceeded = true;
      trackEvent("report_generated", {
        output_type: "report",
        plan_tier: planTier,
        success: true,
        request_id: data?.request_id,
        pipeline_version: directorData.pipeline_version,
      });

      void runBackgroundDirectorEvidenceEnrichment({
        directorData,
        enrichmentKey,
        pipelineStartedAtMs: requestStartMs,
        getActiveEnrichmentKey: () => directorEnrichmentKeyRef.current,
        context: {
          calibratedBullets: result?.calibrated_bullets,
          sessionId: getResumeSessionId(),
          isAuthenticated: !!user,
          jdText: jd?.trim() || undefined,
          originalResumeText: normResume.text,
          alignmentGaps: {
            top_missing_signal: result?.top_missing_signal,
            missing_keywords: result?.missing_keywords,
            score_rationale: result?.score_rationale,
            primary_blocker:
              result?.signal_model?.interview_gap_diagnosis?.primary_blocker ??
              result?.signal_model?.interview_gap_diagnosis?.primary_issue,
          },
        },
        onApplyEnriched: setDirectorResult,
      });
    } catch (err: unknown) {
      const errObj = err instanceof Error ? err : new Error(String(err));
      let userMsg = HIRING_REPORT_USER_MESSAGE;
      let errorCategory = classifyHiringReportErrorCode(undefined, errObj.message);

      if (err instanceof StructuredEdgeError) {
        errorCategory = classifyHiringReportErrorCode(err.error_code, err.message);
        console.debug("[director-calibration error]", {
          category: errorCategory,
          error_code: err.error_code,
          request_id: err.request_id,
        });
        userMsg = mapHiringReportErrorToUserMessage(err);
      } else if (errObj.message === FRIENDLY_FAIL_MSG) {
        errorCategory = "timeout";
        userMsg = HIRING_REPORT_USER_MESSAGE;
      } else if (errObj.message.includes("couldn't be generated")) {
        errorCategory = "parse_validation";
        userMsg = errObj.message;
      }

      setDirectorError(userMsg);
      trackEvent("report_failed", {
        output_type: "report",
        plan_tier: planTier,
        success: false,
        error_code: errorCategory,
        request_id: err instanceof StructuredEdgeError ? err.request_id : undefined,
      });
      trackReliabilityError("edge_function_failed", errorCategory, {
        feature_name: "hiring_report",
        output_type: "report",
        plan_tier: planTier,
      });
    } finally {
      const requestEndedAt = new Date().toISOString();
      const totalDurationMs = Date.now() - requestStartMs;
      console.log(JSON.stringify({
        event: "director_calibration_client_runtime",
        started_at: requestStartedAt,
        ended_at: requestEndedAt,
        total_duration_ms: totalDurationMs,
        timeout_ms: DIRECTOR_CALIBRATION_TIMEOUT_MS,
        success: requestSucceeded,
      }));
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
        full_result_json: {
          ...res,
          jd_text: jd.trim(),
          resume_text: bullet,
          original_resume_before_calibration: originalResumeBeforeCalibration ?? undefined,
        } as any,
      });
    } catch {}
  };


  const handleOptimize = async () => {
    // 2s debounce
    const now = Date.now();
    if (now - lastClickRef.current < 2000) return;
    lastClickRef.current = now;

    if (!validate()) return;
    clearLinkedInOutputCache();
    trackEvent("analyze_clicked", { source: "alignment", plan_tier: planTier });
    const roleCategory = detectRoleCategory(jd.trim(), result?.inferred_role_title || "");
    trackAnalysisStarted({
      source: "alignment",
      plan_tier: planTier,
      role_category: roleCategory,
    });
    setLoading(true);
    // Don't clear result/directorResult/sessionResumeAssembled eagerly —
    // preserve last successful state as fallback if this run fails.
    setAlignmentError(null);
    setInputTruncated(false);
    setShowSamples(false);
    const startTime = Date.now();
    const engineMode = effectiveIsPro ? "multi_bullet" : "single_bullet";

    // Client-side normalization — use override ref if set (from Re-score Now)
    const resumeSource = overrideResumeRef.current || bullet;
    overrideResumeRef.current = null; // consume once
    const normResume = normalizeClientInput(resumeSource.trim(), MAX_RESUME_CHARS);
    const normJd = normalizeClientInput(jd.trim(), MAX_JD_CHARS);
    if (normResume.truncated || normJd.truncated) {
      setInputTruncated(true);
    }
    const payloadLength = normResume.text.length + normJd.text.length;
    const bulletWithContext = additionalContext.trim()
      ? `${normResume.text}\n\nAdditional context: ${additionalContext.trim()}`
      : normResume.text;
    runClientSourceResumeAstShadow({ sourceResumeText: normResume.text });
    const sessionToken = user ? undefined : getSessionToken();

    const isCalibratedRerun = calibratedRunPendingRef.current;
    const originalBullet = extractPrimaryResumeBullet(bulletWithContext);
    const missingSignal =
      result?.top_missing_signal ||
      result?.signal_model?.gaps?.[0] ||
      null;

    let evidencePackage: EvidencePackageItem[] = [];
    if (user) {
      try {
        evidencePackage = await retrieveCalibrationEvidencePackage({
          originalBullet,
          jd: normJd.text,
          missingSignal,
          sessionId: getResumeSessionId(),
        });
      } catch (evidenceErr) {
        if (import.meta.env.DEV) {
          console.warn("[RAG] Evidence retrieval skipped:", evidenceErr);
        }
      }
    }

    const invokeAlignment = (attempt = 1) =>
      invokeResilient(
        isCalibratedRerun ? "alignment-calibrated" : (attempt === 1 ? "alignment" : "alignment-retry"),
        "optimize-bullet",
        withReportRunFields(
          {
            bullet: bulletWithContext,
            jd: normJd.text,
            userId: user?.id ?? null,
            mode: engineMode,
            sessionToken,
            runType: isCalibratedRerun ? "calibrated" : "original",
            evidencePackage,
            calibrationContext: {
              originalBullet,
              missingSignal,
            },
          },
          reportRunFields,
        ),
        ALIGNMENT_TIMEOUT_MS, // alignment-only — not extended for Hiring Report
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
      // Apply deterministic score override before storing
      // Use the ref to determine if this specific run was triggered as a calibrated rerun
      const isCalibratedRun = calibratedRunPendingRef.current;
      calibratedRunPendingRef.current = false; // consume immediately — one-shot
      setIsResumeFromCalibrated(false); // reset state as well
      // Capture the original resume baseline and its score on the first non-calibrated run
      if (!isCalibratedRun && !originalResumeBeforeCalibration) {
        setOriginalResumeBeforeCalibration(bulletWithContext);
        try { localStorage.setItem("signalyz_original_resume_baseline", bulletWithContext); } catch {}
      }
      const runType = isCalibratedRun ? "calibrated" as const : "original" as const;
      const detScore = computeDeterministicScore(bulletWithContext, normJd.text, runType, isCalibratedRun ? (originalResumeBeforeCalibration ?? undefined) : undefined);
      // Persist baseline score on first original run
      if (!isCalibratedRun && originalBaselineScore === null) {
        setOriginalBaselineScore(detScore.finalScore);
        try { localStorage.setItem("signalyz_original_baseline_score", String(detScore.finalScore)); } catch {}
      }
      // Clear previous state now that we have a successful new result
      setDirectorResult(null);
      setDirectorRequestId(undefined);
      setSessionResumeAssembled(false);
      res.match_score = detScore.finalScore;
      res.scoring_breakdown = detScore.breakdown;
      res.scoring_evidence = buildScoringEvidence({
        evidencePackage,
        calibrated_bullets: res.calibrated_bullets,
        scoring_breakdown: detScore.breakdown,
        top_matched_signal: res.top_matched_signal,
        top_missing_signal: res.top_missing_signal,
        score_rationale: res.score_rationale,
        missing_keywords: res.missing_keywords,
      });
      setResult(res);
      setResultRunType(runType);
      if (user) void rememberActiveRun();
      setAssemblySessionKey((k) => k + 1);
      setAnalysisSessionKey((k) => k + 1);
      setAnalysisTime(Math.round((Date.now() - startTime) / 1000));
      const elapsedSec = Math.round((Date.now() - startTime) / 1000);
      const durBucket = durationBucket(elapsedSec);
      const ga4Bucket = ga4ScoreBucket(res.match_score);
      const completedRoleCategory = detectRoleCategory(normJd.text, res.inferred_role_title || "");
      const signalEvt = signalStrengthEvent(res.match_score);

      trackAnalysisCompleted({
        score_bucket: ga4Bucket,
        ga4_score_bucket: ga4Bucket,
        role_category: completedRoleCategory,
        plan_tier: planTier,
        success: true,
        duration_bucket: durBucket,
      });
      try {
        trackEvent("analysis_duration_bucketed", { duration_bucket: durBucket, plan_tier: planTier });
        trackEvent("score_bucket_recorded", {
          score_bucket: ga4Bucket,
          ga4_score_bucket: ga4Bucket,
          plan_tier: planTier,
        });
        if (signalEvt) {
          trackEvent(signalEvt, { score_bucket: ga4Bucket, plan_tier: planTier });
        }
      } catch {
        // Analytics must never crash the result UI
      }

      // Session persistence: save last analysis for returning users
      try {
        localStorage.setItem("signalyz_last_analysis", JSON.stringify({
          v: SESSION_VERSION,
          result: res,
          bullet: bulletWithContext,
          jd: normJd.text,
          originalBaseline: originalResumeBeforeCalibration ?? bulletWithContext,
          runType,
          ts: Date.now(),
        }));
        // Invalidate LinkedIn output — it was based on a previous alignment result
        clearLinkedInOutputCache();
      } catch {}

      // ─── Internal delta logging for calibration runs ──────────────────────
      if (isCalibratedRun && originalResumeBeforeCalibration && user) {
        try {
          const origScore = computeDeterministicScore(originalResumeBeforeCalibration, normJd.text, "original");
          const dims = ["Ownership Language Density", "JD Keyword Alignment", "Action Verb Lead Rate", "Outcome Framing", "Passive Language Reduction"];
          const origB = origScore.breakdown;
          const calB = detScore.breakdown;
          const origVals = [origB.role_outcomes_alignment, origB.tools_and_workflow_alignment, origB.domain_and_context_alignment, origB.context_and_scale_alignment, origB.communication_and_leadership_alignment];
          const calVals = [calB.role_outcomes_alignment, calB.tools_and_workflow_alignment, calB.domain_and_context_alignment, calB.context_and_scale_alignment, calB.communication_and_leadership_alignment];
          const improved: string[] = [];
          const unchanged: string[] = [];
          dims.forEach((d, i) => {
            if (calVals[i] > origVals[i] + 2) improved.push(d);
            else unchanged.push(d);
          });
          await supabase.from("calibration_runs").insert({
            user_id: user.id,
            original_score: origScore.finalScore,
            calibrated_score: detScore.finalScore,
            score_delta: detScore.finalScore - origScore.finalScore,
            improved_dimensions: improved,
            unchanged_dimensions: unchanged,
            dimensions_improved_count: improved.length,
            dimensions_unchanged_count: unchanged.length,
            retry_pass_triggered: detScore.retryPassTriggered,
            calibration_pass_number: 1,
          } as any);
        } catch (e) {
          console.warn("[CalibrationLog] Failed to log calibration delta:", e);
        }
      }

      try {
        const jdFingerprint = normJd.text.replace(/\s+/g, " ").toLowerCase().slice(0, 150);
        sessionStorage.setItem("signalyz_alignment_score", JSON.stringify({
          score: res.match_score,
          jd_fingerprint: jdFingerprint,
          ts: Date.now(),
        }));
      } catch {}
      try {
        increment();
      } catch {}
      // Server-side edge functions consume one-time credits; refresh subscription state after runs.
      if (user) {
        try {
          refreshSub();
        } catch {}
      }
      try {
        void saveToHistory(res);
      } catch {}
      if (!user) {
        try {
          toast("Save your results and track your progress", {
            description: "Create a free account to keep your alignment history.",
            action: { label: "Sign up", onClick: () => { window.location.href = "/auth"; } },
            duration: 5000,
            position: "top-center",
          });
        } catch {}
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
        if (localErrorCode === "DAILY_LIMIT") {
          trackReliabilityError("rate_limit_reached", "DAILY_LIMIT", { plan_tier: planTier });
        }
        trackEvent("analysis_failed", {
          error_code: localErrorCode || "BLOCKED",
          plan_tier: planTier,
          success: false,
        });
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
          // Preserve last successful result as fallback — don't clear UI
          console.warn("[Alignment] Preserving last successful result as fallback.");
          // Use localErrorCode to determine display, not stale React state
          if (localErrorCode === "DAILY_LIMIT") {
            setAlignmentError({ message: msg, error_code: "DAILY_LIMIT" });
          } else {
            setAlignmentError({ message: msg, error_code: localErrorCode || undefined });
          }
          trackEvent("analysis_failed", {
            error_code: localErrorCode || "UNKNOWN",
            plan_tier: planTier,
            success: false,
          });
          trackReliabilityError("edge_function_failed", localErrorCode || retryErr.message, {
            plan_tier: planTier,
            feature_name: "alignment",
          });
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const sampleLoadedRef = useRef(false);
  const fillSample = (roleIndex = selectedSampleRole) => {
    const role = SAMPLE_ROLES[roleIndex];
    sampleLoadedRef.current = true;
    trackEvent("sample_jd_clicked", { plan_tier: planTier });
    setSelectedSampleRole(roleIndex);
    setShowSamples(true);
    setBullet(role.bullet);
    setJd(role.jd);
    setErrors({});
  };

  const role = SAMPLE_ROLES[selectedSampleRole];

  const usedCount = DAILY_FREE_LIMIT - remaining;

  return (
    <div className="min-h-0">
      {/* DebugPanel removed — debug info logged to console only */}
      
      <OnboardingModal />

      {paymentActivating && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="text-center space-y-4 px-6">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-[3px] border-primary border-t-transparent" />
            <p className="text-lg font-semibold text-foreground">Activating your access...</p>
            <p className="text-sm text-muted-foreground">This usually takes just a few seconds.</p>
          </div>
        </div>
      )}

      {/* Hero — deep navy */}
      <section className="py-20 bg-[#0F1C2E] relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0F1C2E] via-[#132438] to-[#0F1C2E] opacity-80" />
        <div className="container max-w-5xl md:max-w-content text-center relative z-10">
          <p className="text-sm text-white/60 tracking-wide uppercase mb-3">Resume positioning for people who already qualify</p>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl leading-tight">
            You already qualify. You just don't <span className="text-primary">read like it</span> yet.
          </h1>
          
          <p className="mt-4 text-base text-white/70 leading-relaxed max-w-xl mx-auto">
            Signalyz compares your resume to the role, finds the blocker, and shows what needs to change. Unlock a calibrated export checked against the Signalyzed Standard before you apply.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-medium text-white/55">
            <span>1 · Upload your resume</span>
            <span className="text-white/25">→</span>
            <span>2 · Paste a job description</span>
            <span className="text-white/25">→</span>
            <span>3 · Get your score + signal diagnosis</span>
          </div>
          <Button
            size="lg"
            className="mt-6 shadow-md hover:shadow-lg transition-all duration-150 hover:-translate-y-px active:translate-y-0 hover:scale-[1.03] active:scale-[0.97]"
            onClick={() => document.getElementById("alignment-tool")?.scrollIntoView({ behavior: "smooth" })}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Run Free Signal Preview
          </Button>
        </div>
      </section>

      {/* What you walk away with */}
      <section className="pt-16 md:pt-20 pb-12 container max-w-5xl md:max-w-content">
        <h2 className="text-xl font-bold tracking-tight text-foreground mb-8 text-center">What you walk away with.</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { title: "Signal Diagnosis", body: "Free preview: a scored read of how hiring systems and managers interpret your experience — not how you intended it." },
            { title: "Gap Map", body: "Your top blocker free; full gap map unlocked with Final Apply Check or Active Job Search." },
            { title: "Reframed Bullets", body: "One example free; full repositioned set unlocked on paid plans. Designed to avoid unsupported claims." },
            { title: "Calibrated Resume", body: "Unlock to export — DOCX checked against the Signalyzed Standard before you apply." },
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
            Run Free Signal Preview
          </Button>
        </div>
      </section>

      {/* WAS/NOW Transformation Section */}
      <section className="py-12 container max-w-5xl md:max-w-content" style={{ backgroundColor: "hsl(210, 17%, 97%)" }}>
        <div className="text-center mb-8">
          <h2 className="font-bold tracking-tight text-foreground" style={{ fontSize: "28px" }}>This is what repositioning looks like.</h2>
          <p className="mt-2 text-muted-foreground" style={{ fontSize: "16px" }}>Not reframing with synonyms. Recalibrating. Every word came from the original resume.</p>
        </div>
        <div className="space-y-4">
          {[
            {
              was: "Managed customer inquiries and helped resolve issues for business clients while maintaining documentation.",
              now: "Owned resolution for 40–70 concurrent B2B cases under strict SLA requirements — managing escalation triage, documentation, and client follow-through across business and institutional accounts.",
              signal: "Ownership language + accountability framing",
            },
            {
              was: "Built internal intake guides and complaint clarification protocols that standardized the routing decision process.",
              now: "Created intake guides and clarification protocols that standardized routing decisions — reducing repeat inquiries and improving first-contact resolution.",
              signal: "Process ownership + measurable outcome",
            },
            {
              was: "Supported executive-level clients and institutional account managers through complex procedural questions.",
              now: "Guided executive and institutional clients through complex procedural and regulatory questions — providing clear next steps based on case-specific requirements.",
              signal: "Client seniority + advisory framing",
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
            Run Free Signal Preview
          </Button>
        </div>
      </section>

      {/* Differentiation Statement */}
      <section className="py-12 bg-[#0F1C2E]">
        <div className="container max-w-5xl md:max-w-tool text-center">
          <h2 className="text-2xl font-bold text-white tracking-tight sm:text-3xl">This isn't resume tailoring.</h2>
          <p className="mt-4 text-sm text-white/70 leading-relaxed max-w-2xl mx-auto">
            Most tools reframe your bullets with synonyms. Signalyz diagnoses where your signal breaks — at the recruiter filter, the hiring manager review, the panel interview — and recalibrates your positioning from the threshold up.
          </p>
        </div>
      </section>

      {/* Feature Cards */}
      <section className="py-12 container max-w-5xl md:max-w-tool" style={{ backgroundColor: "hsl(210, 17%, 97%)" }}>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { title: "Signal Calibration Engine", sub: "Diagnosis across every stage of the hiring pipeline.", icon: Layers },
            { title: "Hiring Pipeline Simulation", sub: "See where your resume gets filtered — at the recruiter screen, hiring manager review, and panel stage.", icon: Shield },
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
      <section className="py-12 container max-w-5xl md:max-w-content">
        <h2 className="text-xl font-semibold tracking-tight text-foreground mb-6">How Signalyz Works</h2>
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
      <section id="alignment-tool" className="py-12 container max-w-6xl md:max-w-tool overflow-x-hidden">

        {showRestoredBanner && (
          <div
            role="status"
            className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5"
          >
            <p className="text-sm text-foreground">Previous analysis restored.</p>
            <button
              type="button"
              onClick={() => setShowRestoredBanner(false)}
              className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Sub-navigation tabs */}
        <div className="mb-6 flex justify-center mt-3">
          {/* Mobile layout */}
          <div className="flex lg:hidden w-full">
            {([
              { id: "alignment" as const, label: "Analysis", proOnly: false },
              { id: "director" as const, label: "Report", proOnly: false },
              { id: "calibrated" as const, label: "Resume", proOnly: true },
              { id: "coverletter" as const, label: "Letter", proOnly: true },
              { id: "linkedin" as const, label: "LinkedIn", proOnly: false },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  if (tab.proOnly && !effectiveIsPro) {
                    if (accessLookupPending) return;
                    openUpgradeModal({
                      feature_name: tab.id === "calibrated" ? "calibrated_resume" : "cover_letter",
                      output_type: tab.id === "calibrated" ? "calibrated_resume" : "cover_letter",
                    });
                    return;
                  }
                  const scrollY = window.scrollY;
                  setMode(tab.id);
                  requestAnimationFrame(() => window.scrollTo(0, scrollY));
                }}
                aria-current={mode === tab.id ? "page" : undefined}
                className={`flex-1 min-w-0 min-h-[44px] py-2.5 text-[13px] font-medium transition-colors text-center border-b-2 ${
                  mode === tab.id
                    ? "text-primary border-primary"
                    : "text-muted-foreground border-transparent hover:text-foreground hover:border-muted-foreground/30"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Desktop layout */}
          <div className="hidden lg:inline-flex lg:flex-nowrap items-center gap-1">
            {([
              { id: "alignment" as const, label: "Resume Analysis", proOnly: false },
              { id: "director" as const, label: "Hiring Report", proOnly: false },
              { id: "calibrated" as const, label: "Calibrated Resume", proOnly: true },
              { id: "coverletter" as const, label: "Cover Letter", proOnly: true },
              { id: "linkedin" as const, label: "LinkedIn", proOnly: false },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  if (tab.proOnly && !effectiveIsPro) {
                    if (accessLookupPending) return;
                    openUpgradeModal({
                      feature_name: tab.id === "calibrated" ? "calibrated_resume" : "cover_letter",
                      output_type: tab.id === "calibrated" ? "calibrated_resume" : "cover_letter",
                    });
                    return;
                  }
                  const scrollY = window.scrollY;
                  setMode(tab.id);
                  requestAnimationFrame(() => window.scrollTo(0, scrollY));
                }}
                aria-current={mode === tab.id ? "page" : undefined}
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

        {/* Active tab description — helps first-time users understand each tab at a glance */}
        {(() => {
          const tabDescriptions: Record<string, string> = {
            alignment: "Paste your resume and a job description to see your match score and your biggest gaps.",
            director: "A deep read of how recruiters and hiring managers interpret your resume — and where you get screened out.",
            calibrated: "Your calibrated export for this role — checked against the Signalyzed Standard before you apply.",
            coverletter: "A matching cover letter, grounded in your actual experience.",
            linkedin: "Optimize your LinkedIn profile to send the same strong signal as your resume.",
          };
          const description = tabDescriptions[mode];
          return description ? (
            <p className="mb-6 -mt-1 text-center text-xs text-muted-foreground leading-relaxed max-w-xl mx-auto px-4">
              {description}
            </p>
          ) : null;
        })()}

        {/* LinkedIn Signal Tab */}
        {mode === "linkedin" && (
          <div key={runSessionKey} className="max-w-4xl md:max-w-content mx-auto">
            <LinkedInSignalTab
              experience={bullet}
              inferredRole={result?.inferred_role_title || ""}
              jdText={jd}
              runSessionKey={runSessionKey}
              signalKeywords={
                (result?.missing_keywords as string[] || []).length > 0
                  ? (result?.missing_keywords as string[])
                  : Array.isArray(result?.signal_model?.gaps)
                    ? (result.signal_model.gaps as unknown[]).map((g: unknown) => typeof g === "string" ? g : (g as any)?.name || "").filter(Boolean)
                    : []
              }
              onRunAlignment={() => setMode("alignment")}
              isPro={effectiveIsPro}
              onUpgrade={() => openUpgradeModal()}
              alignmentResult={result as unknown as Record<string, unknown> || {}}
              reportRunFields={reportRunFields}
            />
          </div>
        )}

        {/* Calibrated Resume Tab */}
        {mode === "calibrated" && (
          <CalibratedResumeTab
            key={runSessionKey}
            isPro={effectiveIsPro}
            accessLookupPending={accessLookupPending}
            onUpgrade={() => openUpgradeModal()}
            directorResult={directorResult}
            originalResume={bullet}
            jdText={jd}
            reportRunFields={reportRunFields}
            onSwitchToReport={() => setMode("director")}
            hasCurrentSessionAlignment={!!result}
            onRunAlignment={() => setMode("alignment")}
            onAssembled={() => setSessionResumeAssembled(true)}
            alignmentResult={result as unknown as Record<string, unknown> || undefined}
            inputSource={inputSource}
            onResumeTextReplaced={(text) => { setOriginalResumeBeforeCalibration(bullet); setBullet(text); setInputSource("paste"); setIsResumeFromCalibrated(true); calibratedRunPendingRef.current = true; }}
            originalResumeBeforeCalibration={originalResumeBeforeCalibration}
            onRerunSignalAnalysis={(calibratedText) => {
              if (!originalResumeBeforeCalibration) return;
              // Store the calibrated text in a ref so handleOptimize reads it immediately
              overrideResumeRef.current = calibratedText;
              setBullet(calibratedText);
              calibratedRunPendingRef.current = true;
              setIsResumeFromCalibrated(true);
              setInputSource("paste");
              // Switch to alignment tab and scroll to top so user sees the rerun
              setMode("alignment");
              window.scrollTo({ top: 0, behavior: "smooth" });
              handleOptimize();
            }}
          />
        )}

        {/* Cover Letter Tab */}
        {mode === "coverletter" && (
          <CoverLetterTab
            key={runSessionKey}
            isPro={effectiveIsPro}
            accessLookupPending={accessLookupPending}
            onUpgrade={() => openUpgradeModal()}
            experience={bullet}
            jd={jd}
            alignmentResult={result as any || {}}
            inferredRole={result?.inferred_role_title || ""}
            hasCurrentSessionAlignment={!!result}
            onRunAlignment={() => setMode("alignment")}
            reportRunFields={reportRunFields}
          />
        )}

      {/* Executive Signal Audit Mode */}
        {mode === "director" && (
            <DirectorModeContent
              key={runSessionKey}
              result={result}
              bullet={bullet}
              jd={jd}
              directorResult={directorResult}
              directorLoading={directorLoading}
              directorError={directorError}
              onRunAlignment={() => setMode("alignment")}
              onRunDirector={handleDirectorCalibrate}
              isPro={effectiveIsPro}
              onUpgrade={() => openUpgradeModal()}
              isAuthenticated={!!user}
              directorRequestId={directorRequestId}
              reportRunFingerprint={reportRunFields?.reportRunFingerprint}
              planTier={planTier}
            />
        )}

        {/* Alignment Mode */}
        {mode === "alignment" && (
          <>
            <div className={`grid gap-8 ${loading || result || alignmentError || showSamples ? "lg:grid-cols-2" : ""}`}>
              {/* Left — Inputs */}
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Your Resume</label>
                  <ResumeUpload
                    onUploadStarted={(fileType) => {
                      trackEvent("resume_upload_started", { file_type: fileType, plan_tier: planTier });
                    }}
                    onTextExtracted={(text, source) => {
                      invalidateStaleSession();
                      setBullet(text); setIsResumeFromCalibrated(false); setOriginalResumeBeforeCalibration(null); setOriginalBaselineScore(null); try { localStorage.removeItem("signalyz_original_resume_baseline"); localStorage.removeItem("signalyz_original_baseline_score"); } catch {}
                      if (source) setInputSource(source);
                      setErrors((p) => ({ ...p, bullet: undefined }));
                      trackEvent("resume_uploaded", { input_source: source || "file", file_type: source, plan_tier: planTier });
                    }}
                    onUploadFailed={(errorCode, fileType) => {
                      trackEvent("resume_upload_failed", {
                        error_code: errorCode,
                        file_type: fileType,
                        plan_tier: planTier,
                        success: false,
                      });
                      trackReliabilityError("parser_failed", errorCode, {
                        file_type: fileType,
                        plan_tier: planTier,
                      });
                    }}
                    onClear={() => {
                      invalidateStaleSession();
                      setBullet("");
                      setInputSource("paste");
                      setErrors((p) => ({ ...p, bullet: undefined }));
                      trackEvent("input_cleared", { input_type: "resume", plan_tier: planTier });
                    }}
                  />
                  <div className="relative mt-2">
                    <Textarea
                      placeholder="Paste your full resume here — or upload it above. Include your experience, titles, dates, and bullet points."
                      value={bullet}
                      onChange={(e) => {
                        invalidateStaleSession();
                        setBullet(e.target.value);
                        setInputSource("paste");
                        setIsResumeFromCalibrated(false);
                        setOriginalResumeBeforeCalibration(null);
                        setOriginalBaselineScore(null);
                        try {
                          localStorage.removeItem("signalyz_original_resume_baseline");
                          localStorage.removeItem("signalyz_original_baseline_score");
                        } catch {}
                        setErrors((p) => ({ ...p, bullet: undefined }));
                        if (!resumePasteTrackedRef.current && e.target.value.trim().length >= 50) {
                          resumePasteTrackedRef.current = true;
                          trackEvent("resume_text_pasted", { input_source: "paste", plan_tier: planTier });
                        }
                      }}
                      rows={4}
                      className={`${errors.bullet ? "border-destructive" : ""} ${bullet ? "pr-8" : ""}`}
                    />
                    {bullet && (
                      <button
                        type="button"
                        onClick={() => {
                          invalidateStaleSession();
                          setBullet("");
                          setInputSource("paste");
                          setIsResumeFromCalibrated(false);
                          setOriginalResumeBeforeCalibration(null);
                          setOriginalBaselineScore(null);
                          try {
                            localStorage.removeItem("signalyz_original_resume_baseline");
                            localStorage.removeItem("signalyz_original_baseline_score");
                          } catch {}
                          setErrors((p) => ({ ...p, bullet: undefined }));
                          setResult(null);
                          setDirectorResult(null);
                          setDirectorRequestId(undefined);
                          setSessionResumeAssembled(false);
                          trackEvent("input_cleared", { input_type: "resume", plan_tier: planTier });
                        }}
                        className="absolute top-2 right-2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                        title="Clear resume input"
                        aria-label="Clear resume input"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {bullet.trim().length > 20 && !errors.bullet && (
                    <div className="mt-1.5">
                      <ResumePasteQuality quality={getPasteQuality(parseResumeIntake(bullet))} />
                    </div>
                  )}
                  {errors.bullet && <p className="mt-1 text-xs text-destructive">{errors.bullet}</p>}
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Job Description</label>
                  <Textarea
                    placeholder="Paste the full job description for the role you're targeting..."
                    value={jd}
                    onChange={(e) => {
                      invalidateStaleSession();
                      setJd(e.target.value);
                      setErrors((p) => ({ ...p, jd: undefined }));
                      if (!jdInputTrackedRef.current && e.target.value.trim().length >= 20) {
                        jdInputTrackedRef.current = true;
                        trackEvent("jd_input_started", { plan_tier: planTier });
                      }
                      if (!jdPastedTrackedRef.current && e.target.value.trim().length >= 50) {
                        jdPastedTrackedRef.current = true;
                        trackEvent("jd_pasted", { plan_tier: planTier });
                      }
                    }}
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
                           <Button onClick={() => openUpgradeModal()} className="w-full sm:w-auto transition-transform hover:scale-[1.03] active:scale-[0.97]">
                             Active Job Search — $19/mo
                           </Button>
                            <p className="text-xs text-muted-foreground">
                             {hasConsumedOneTimeCredit
                               ? "Your Final Apply Check has been used. Upgrade for unlimited analyses."
                               : "You've used your 3 free signal previews today."}
                            </p>
                           
                        </>
                      ) : (
                        <>
                          <Button className="w-full sm:w-auto transition-transform hover:scale-[1.03] active:scale-[0.97]" asChild>
                            <a href="/auth">Get Started Free</a>
                          </Button>
                          <p className="text-xs text-muted-foreground">
                            Sign up to get 3 free signal previews per day.
                          </p>
                        </>
                      )}
                    </div>
                  ) : (
                    <Button id="run-alignment-btn" onClick={handleOptimize} disabled={loading || subLoading} className={`gap-2 w-full sm:w-auto sticky bottom-4 z-10 sm:static transition-transform hover:scale-[1.03] active:scale-[0.97] ${errors.bullet ? "opacity-40 cursor-not-allowed pointer-events-none" : ""}`}>
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : subLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      {subLoading ? "Initializing…" : "Analyze My Resume"}
                    </Button>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">Try sample:</span>
                    {SAMPLE_ROLES.map((r, i) => (
                      <button key={i} onClick={() => fillSample(i)} className="px-3 py-1.5 text-xs rounded-full border border-border bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                        {r.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground/70">Try a sample that shows how Signalyz handles technical, customer-facing, and career-pivot applications.</p>
                </div>

                {/* Free tier counter — only show when 1 remaining */}
                {!effectiveIsPro && dailyRunsRemaining === 1 && (
                  <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium" style={{ backgroundColor: "hsl(38, 92%, 50%, 0.15)", color: "hsl(38, 72%, 45%)" }}>
                    1 free analysis remaining today
                  </span>
                )}
                <p className="text-[11px] text-muted-foreground/70">Built only from what you provide — no invented employers, titles, or credentials.</p>
              </div>

              {/* Right — Results */}
              <div className={`space-y-4 md:space-y-6 ${!loading && !result && !alignmentError && !showSamples ? "hidden lg:block" : ""}`}>
                {loading && <AlignmentLoader minHeight="260px" />}

                {!loading && inputTruncated && (
                  <div className="rounded-md border border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
                    Input trimmed for reliability. Paste Experience + Skills for best results.
                  </div>
                )}

                {!loading && !result && alignmentError && (
                  alignmentError.error_code === "CREDENTIAL_MISMATCH" ? (
                    <div className="rounded-lg border border-border bg-muted/30 p-5 my-6 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="shrink-0 mt-0.5 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <Shield className="h-4 w-4 text-primary" />
                        </div>
                        <div className="space-y-1 flex-1">
                          <p className="text-sm font-semibold text-foreground">Qualification Blocker Detected</p>
                          <p className="text-sm text-muted-foreground">{alignmentError.message}</p>
                        </div>
                      </div>
                      {alignmentError.credential_matches && alignmentError.credential_matches.length > 0 && (
                        <div className="rounded-md border border-border/60 bg-background/60 p-3 space-y-2 ml-11">
                          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Why this run was blocked</p>
                          {alignmentError.credential_matches.map((m, i) => (
                            <div key={i} className="space-y-1">
                              <p className="text-xs font-medium text-foreground">
                                {m.label} <span className="text-muted-foreground font-normal">— matched “{m.matchedText}”</span>
                              </p>
                              <p className="text-[11px] text-muted-foreground italic leading-relaxed pl-2 border-l-2 border-border/50">
                                {m.jdExcerpt}
                              </p>
                            </div>
                          ))}
                          <p className="text-[10px] text-muted-foreground/70 leading-relaxed pt-1">
                            Onboarding steps, background checks, equipment specs, and state eligibility lists are excluded from this gate.
                          </p>
                        </div>
                      )}
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
                            {user
                              ? hasConsumedOneTimeCredit
                                ? "Your Final Apply Check has been used. Upgrade to Active Job Search for unlimited runs."
                                : "You've used your 3 free signal previews. Upgrade to continue."
                              : "Sign up to get 3 free signal previews per day."}
                          </p>
                        </div>
                      </div>
                       {user ? (
                         <Button
                          size="sm"
                          className="w-full gap-2 transition-transform hover:scale-[1.03] active:scale-[0.97]"
                          onClick={() => openUpgradeModal()}
                        >
                          Active Job Search — $19/mo
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
                      <h3 className="section-label mt-2">Perception Snapshot</h3>
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
                      <h3 className="section-label mt-2">What This Role Actually Weighs Most</h3>
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
                          <h3 className="section-label mt-2">Perception Insight</h3>
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
                            <p className="text-sm font-semibold text-foreground">See All Repositioned Variants</p>
                            <p className="text-xs text-muted-foreground">Additional repositioned versions are available with full access.</p>
                            <Button onClick={() => openUpgradeModal()} className="w-full sm:w-auto">Active Job Search — $19/mo</Button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="rounded-xl border border-primary/20 bg-card p-5 text-center space-y-3">
                        <p className="text-sm font-medium text-foreground">Create a free account to run your own signal preview — 3 free previews per day included.</p>
                        <Button asChild className="w-full sm:w-auto"><a href="/auth">Get Started Free</a></Button>
                      </div>
                    )}
                    <p className="context-text text-center pt-2">This is a sample preview — paste your own experience to see your actual signal read.</p>
                  </div>
                )}

                {result && (
                  <>
                    {/* Signal profile lock-in — subtle success moment */}
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-1.5 text-center animate-fade-in">
                      <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-foreground">
                        <Check className="h-4 w-4 text-primary" />
                        Resume analysis complete
                      </p>
                      <p className="text-xs text-muted-foreground">Specific to your experience and this role — built only from what you provided.</p>
                    </div>

                    {/* Professional Signal Diagnosis headline */}
                    <div className="text-center space-y-1">
                      <h2 className="text-lg font-semibold tracking-tight text-foreground">Signal Diagnosis</h2>
                      {analysisTime > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Analyzed in {analysisTime}s · Built from your real experience · Your data stays private
                        </p>
                      )}
                    </div>

                    {/* Section 1: Score + Primary Strength */}
                    <div className={`rounded-xl border bg-card p-5 space-y-3 transition-shadow duration-500 ${scoreRevealed ? "" : "shadow-[0_0_30px_-5px_hsl(var(--primary)/0.4)]"}`}>
                      <div className="flex items-center gap-2">
                        <h3 className="section-label mt-1">Score</h3>
                        <ScoreExplanation score={displayScore} />
                      </div>
                      <div className="flex items-baseline gap-3">
                        <span
                          data-score-source="deterministic"
                          className={`text-5xl font-bold tabular-nums ${
                            displayScore >= 70 ? "text-green-600 dark:text-green-400" :
                            displayScore >= 50 ? "text-orange-500" :
                            "text-destructive"
                          }`}
                        >
                          {animatedScore}%
                        </span>
                        <span className="text-sm font-medium text-muted-foreground">{getStrengthLabel(displayScore)}</span>
                        {resultRunType === "calibrated" && originalBaselineScore !== null && originalBaselineScore !== displayScore && (
                          <span className="text-sm font-semibold tabular-nums">
                            <span className="text-muted-foreground">{originalBaselineScore}% → {displayScore}%</span>
                            {" "}
                            <span className={displayScore > originalBaselineScore ? "text-green-600 dark:text-green-400" : "text-destructive"}>
                              ({displayScore > originalBaselineScore ? "+" : ""}{displayScore - originalBaselineScore})
                            </span>
                          </span>
                        )}
                      </div>
                      {displayScore < 70 && (
                        <p className="text-sm font-semibold text-destructive">Your current signal is below typical interview range (70%+)</p>
                      )}

                      {/* Why this score — run-specific scoring breakdown + signals */}
                      {displayBreakdown && (
                        <ScoreEvidencePanel
                          title="Why this score · this run"
                          breakdown={displayBreakdown}
                          topMatchedSignal={result.top_matched_signal}
                          topMissingSignal={result.top_missing_signal}
                          strengths={parseScoreRationale(result.score_rationale).strengths}
                          gaps={parseScoreRationale(result.score_rationale).gaps.slice(1)}
                          scoringEvidence={result.scoring_evidence}
                          isPro={effectiveIsPro}
                          showRationale
                        />
                      )}

                      {/* Primary strength */}
                      {(result.signal_model?.executive_insight_summary?.primary_strength || (result as any).executive_insight_summary?.primary_strength) && (
                        <div className="border-t border-border/40 pt-3">
                          <p className="text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">Primary strength:</span> {result.signal_model?.executive_insight_summary?.primary_strength || (result as any).executive_insight_summary?.primary_strength}
                          </p>
                        </div>
                      )}

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
                        const hiringManagersSee = Array.isArray(result.signal_model?.interview_gap_diagnosis?.what_hiring_managers_see)
                          ? result.signal_model.interview_gap_diagnosis.what_hiring_managers_see.filter(
                              (s): s is string => typeof s === "string" && s.trim().length > 0,
                            )
                          : [];
                        const whatThisCreates =
                          typeof result.signal_model?.interview_gap_diagnosis?.what_this_creates === "string"
                            ? result.signal_model.interview_gap_diagnosis.what_this_creates
                            : null;
                        const rawPrimaryBlocker =
                          result.signal_model?.interview_gap_diagnosis?.primary_blocker ||
                          result.signal_model?.interview_gap_diagnosis?.primary_issue ||
                          (gaps.length > 0 ? gaps[0] : null);
                        const primaryBlocker =
                          typeof rawPrimaryBlocker === "string" && rawPrimaryBlocker.trim()
                            ? rawPrimaryBlocker
                            : null;
                        // Deduplicate: remove the primary blocker from gaps list
                        const secondaryGaps = gaps.filter((g, i) => {
                          if (i === 0) return false; // first gap is the primary blocker
                          if (primaryBlocker && g.toLowerCase().includes(primaryBlocker.toLowerCase().slice(0, 30))) return false;
                          return true;
                        });
                        return (
                          <div className="space-y-4">
                            {/* Primary Blocker */}
                             {primaryBlocker && (
                              <div className="rounded-lg border border-destructive/20 bg-destructive/[0.04] p-4 space-y-2.5">
                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-destructive">{resultRunType === "calibrated" ? "Next-Level Constraint" : "Primary Blocker"}</p>
                                <p className="text-[13px] text-foreground font-semibold leading-relaxed">
                                  {resultRunType === "calibrated" && typeof primaryBlocker === "string" && primaryBlocker.toLowerCase().startsWith("you are being screened out because")
                                    ? primaryBlocker.replace(/^you are being screened out because/i, "At this signal level, the remaining constraint is")
                                    : primaryBlocker}
                                </p>
                                {hiringManagersSee.length > 0 && (
                                  <div className="pt-2 mt-1 border-t border-destructive/10">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-1.5">How this reads to hiring managers</p>
                                    <ul className="space-y-1 pl-2.5 border-l-2 border-destructive/20">
                                      {hiringManagersSee.slice(0, effectiveIsPro ? undefined : 2).map((s, i) => (
                                        <li key={i} className="text-xs text-muted-foreground leading-relaxed">{s}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                {effectiveIsPro && whatThisCreates && (
                                  <p className="text-xs text-muted-foreground leading-relaxed pt-1 border-t border-destructive/10">
                                    <span className="font-medium text-foreground">Consequence:</span> {whatThisCreates}
                                  </p>
                                )}
                              </div>
                            )}

                            {/* Repositioning Preview — after Primary Blocker, free users only */}
                            {!effectiveIsPro && primaryBlocker && (() => {
                              const previewActions = deriveActions(result);
                              const topMove = previewActions.length > 0 ? previewActions[0] : null;
                              if (!topMove) return null;
                              return (
                                <div className="space-y-3">
                                  <div className="rounded-lg border border-accent/30 bg-accent/[0.06] p-4 space-y-2">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent-foreground/70">Your top repositioning move</p>
                                    <p className="text-[13px] text-foreground leading-relaxed">{topMove}</p>
                                    <button
                                      onClick={() => user ? openUpgradeModal() : undefined}
                                      {...(!user ? { } : {})}
                                      className="text-xs text-primary hover:underline cursor-pointer mt-1 text-left"
                                    >
                                      {user ? (
                                        <>4 more moves like this in your full Signal Action Plan →</>
                                      ) : (
                                        <a href="/auth" className="text-primary hover:underline">4 more moves like this in your full Signal Action Plan →</a>
                                      )}
                                    </button>
                                  </div>

                                  {/* Conversion CTA */}
                                  <div className="rounded-lg border border-primary/20 bg-primary/[0.04] p-4 text-center space-y-2.5">
                                   <p className="text-sm font-bold text-foreground">
                                   Your positioning gaps are fixable
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    See exactly how your experience gets repositioned to match this role.
                                  </p>
                                 {user ? (
                                   <Button onClick={() => openUpgradeModal()} size="sm" className="gap-2 transition-transform hover:scale-[1.03] active:scale-[0.97]">
                                      <span style={{ color: "inherit" }}>✦</span> Active Job Search — $19/mo
                                    </Button>
                                ) : (
                                  <Button size="sm" className="gap-2" asChild>
                                    <a href="/auth">Get Started Free</a>
                                  </Button>
                                )}
                                
                                  </div>
                                </div>
                              );
                            })()}

                            {/* What's Landing — free: 1 item, Pro: all */}
                            {strengths.length > 0 && (
                              <div className="space-y-1.5">
                                <p className="section-label">What's Landing</p>
                                <ul className="space-y-1">
                                  {(effectiveIsPro ? strengths : strengths.slice(0, 2)).map((r, i) => (
                                    <li key={i} className="text-xs text-muted-foreground leading-relaxed">• {r}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Screen-Out Risks — free: max 2, Pro: all */}
                            {secondaryGaps.length > 0 && (
                              <div className="space-y-1.5">
                                <p className="section-label">Screen-Out Risks</p>
                                <ul className="space-y-1">
                                  {(effectiveIsPro ? secondaryGaps : secondaryGaps.slice(0, 2)).map((r, i) => (
                                    <li key={i} className="text-xs text-muted-foreground leading-relaxed">• {r}</li>
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
                        scoring_breakdown: result.scoring_breakdown,
                        score_rationale: result.score_rationale,
                        isPro: effectiveIsPro,
                        onUpgrade: () => openUpgradeModal(),
                      }}
                      matchScore={result.match_score}
                      isCalibratedRun={resultRunType === "calibrated"}
                    />

                    {/* Section 2: Calibrated Bullets */}
                    <CalibratedBulletsSection
                      bullet={bullet}
                      result={result}
                      effectiveIsPro={effectiveIsPro}
                      onUpgrade={() => openUpgradeModal()}
                    />

                    {/* Signal Action Plan preview + unified Pro gate for non-Pro users */}
                    {!effectiveIsPro && (() => {
                      const liftData = result?.signal_model?.predicted_signal_lift || (result as any)?.predicted_signal_lift;
                      const liftPoints = liftData?.predicted_score
                        ? Math.round(liftData.predicted_score - (result?.match_score ?? 0))
                        : null;
                      const liftDisplay = liftPoints && liftPoints > 0 ? `${liftPoints}` : "15–20";
                        return (
                        <div className="relative rounded-xl border border-border bg-card overflow-hidden">
                          {/* Blurred preview content */}
                          <div className="pointer-events-none select-none blur-sm opacity-40 p-5 space-y-4">
                            <div className="space-y-1">
                              <h3 className="text-sm font-semibold tracking-tight text-foreground">Your Signal Action Plan</h3>
                              <p className="text-xs text-muted-foreground">Prioritized actions to strengthen your signal</p>
                            </div>
                            <ol className="space-y-2">
                              {[1, 2, 3].map((i) => (
                                <li key={i} className="flex items-start gap-2.5">
                                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">{i}</span>
                                  <div className="flex-1 space-y-1.5">
                                    <div className="h-3 bg-muted rounded w-full" />
                                    <div className="h-3 bg-muted rounded w-3/4" />
                                  </div>
                                </li>
                              ))}
                            </ol>
                            <div className="space-y-3 pt-2">
                              <p className="text-xs font-semibold text-foreground">Signal Gap Actions</p>
                              {[1, 2].map((i) => (
                                <div key={i} className="rounded-lg border bg-card p-4 space-y-2">
                                  <div className="h-3 bg-muted rounded w-2/3" />
                                  <div className="h-3 bg-muted rounded w-full" />
                                  <div className="h-3 bg-muted rounded w-1/2" />
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Gate card overlay */}
                          <div className="absolute inset-0 flex items-center justify-center bg-card/60 backdrop-blur-[1px]">
                            <div className="text-center space-y-4 max-w-sm px-4">
                              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                                <span className="text-xl text-primary">✦</span>
                              </div>
                               <p className="text-sm font-bold text-foreground">
                                 See exactly what's holding your signal back
                               </p>
                               <p className="text-xs text-muted-foreground">You're closer than you think — the gap is positioning, not experience.</p>
                               <p className="text-xs text-muted-foreground italic">Your full action plan shows exactly what to change and why.</p>
                              {user ? (
                                <Button onClick={() => openUpgradeModal()} className="w-full" size="sm">
                                  Active Job Search — $19/mo
                                </Button>
                              ) : (
                                <Button size="sm" className="w-full" asChild>
                                  <a href="/auth">Get Started Free</a>
                                </Button>
                              )}
                              
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Pro-only sections — only render when Pro */}
                    {effectiveIsPro && (
                      <>
                        {/* Signal Action Plan — top of Pro section */}
                        <SignalActionPlan alignmentResult={result} />

                        {/* Calibrated Summary */}
                        <CalibratedSummary
                          experience={bullet}
                          jd={jd}
                          isPro={effectiveIsPro}
                          onUpgrade={() => openUpgradeModal()}
                          reportRunFields={reportRunFields}
                        />

                        {/* Signal Gap Actions */}
                        <SignalGapActions
                          experience={bullet}
                          jd={jd}
                          alignmentResult={result as any}
                          isPro={effectiveIsPro}
                          onUpgrade={() => openUpgradeModal()}
                          reportRunFields={reportRunFields}
                        />

                        {result.identity_strength_index && (
                          <IdentityStrengthIndex
                            data={result.identity_strength_index}
                            isPro={effectiveIsPro}
                            onUpgrade={() => openUpgradeModal()}
                            inferredRoleTitle={result.inferred_role_title}
                          />
                        )}

                        {/* ATS Signal Panel */}
                        <ATSSignalPanel
                          experience={bullet}
                          jd={jd}
                          isPro={effectiveIsPro}
                          onUpgrade={() => openUpgradeModal()}
                          reportRunFields={reportRunFields}
                        />

                        {(result.alignment_notes || result.gap_suggestions) && (
                          <LevelDeterminationBlock
                            score={result.match_score}
                            alignmentNotes={result.alignment_notes}
                            gapSuggestions={result.gap_suggestions}
                            confidenceLevel={getStrengthLabel(result.match_score)}
                            inferredRoleTitle={result.inferred_role_title}
                            isPro={effectiveIsPro}
                            isAuthenticated={!!user}
                            onUpgrade={() => openUpgradeModal()}
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
                      onUpgrade={() => openUpgradeModal()}
                      reportRunFields={reportRunFields}
                    />

                    {/* Terminal Conversion Block — free users only */}
                    {!effectiveIsPro && (
                      <div className="rounded-xl border border-primary/20 bg-card p-6 text-center space-y-3">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                          <Check className="h-5 w-5 text-primary" />
                        </div>
                        <p className="text-lg font-bold text-foreground tracking-tight">Your diagnosis is complete.</p>
                        <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">
                          Your signal gaps are mapped. Now see the exact repositioning moves that close them.
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Unlock the full Signal Action Plan, calibrated bullets, and role-specific positioning.
                        </p>
                        {user ? (
                          <Button onClick={() => openUpgradeModal()} size="lg" className="gap-2 w-full sm:w-auto transition-transform hover:scale-[1.03] active:scale-[0.97]">
                            <span style={{ color: "inherit" }}>✦</span> Active Job Search — $19/mo
                          </Button>
                        ) : (
                          <Button size="lg" className="gap-2" asChild>
                            <a href="/auth">Get Started Free</a>
                          </Button>
                        )}
                      </div>
                    )}

                    <KeywordChips keywords={result.missing_keywords ?? []} />

                    {result.match_score < 60 && (
                      <WeakAlignmentNudge
                        additionalContext={additionalContext}
                        onContextChange={setAdditionalContext}
                        onRerun={() => handleOptimize()}
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

      {/* FAQ — only visible when no analysis has been run */}
      {!result && !directorResult && (
        <section className="py-12 container max-w-5xl md:max-w-content">
          <h2 className="text-xl font-semibold tracking-tight text-foreground mb-6 text-center">
            Frequently Asked Questions
          </h2>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="who-is-it-for">
              <AccordionTrigger className="text-sm text-foreground hover:no-underline">Who is Signalyz for?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                Signalyz is built for professionals actively applying to jobs who want to understand how hiring managers actually read their experience — and fix it before it costs them interviews. It works best for people with real work history who are targeting specific roles and want precise, role-specific feedback instead of generic resume tips. You get a clear diagnosis and a rewritten resume — built only from your real experience.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="fabrication">
              <AccordionTrigger className="text-sm text-foreground hover:no-underline">Does Signalyz make things up?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                No. Signalyz never invents experience, metrics, or achievements. All insights are derived from the information you provide.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="chatgpt">
              <AccordionTrigger className="text-sm text-foreground hover:no-underline">How is this different from ChatGPT?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                ChatGPT generates text. Signalyz models how hiring managers interpret professional signals across the hiring pipeline. Instead of simply reframing resumes, Signalyz diagnoses perception gaps and shows how to reposition your experience without fabricating anything.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="ats">
              <AccordionTrigger className="text-sm text-foreground hover:no-underline">Is this just ATS keyword stuffing?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                No. Signalyz calibrates how your actual experience reads to a human reviewer — the recruiter scanning for ownership signal, the hiring manager assessing strategic depth. Keywords are one output. Perception is the goal.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="full-analysis">
              <AccordionTrigger className="text-sm text-foreground hover:no-underline">What does a full analysis give me?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                A signal preview with match score, primary blocker, and limited insights. With Final Apply Check ($9) or Active Job Search ($19/mo), you unlock the full Hiring Report, calibrated export checked against the Signalyzed Standard, repositioned bullets, interview questions tied to your gaps, and a matching cover letter — all from your actual experience. Nothing invented.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="pricing">
              <AccordionTrigger className="text-sm text-foreground hover:no-underline">How much does Signalyz cost?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                Free users get 3 signal previews per day: match score, primary blocker, and limited insights. Final Apply Check ($9) unlocks one full role run — full report and calibrated export for that resume + job description; return anytime with the same inputs. Active Job Search ($19/mo) unlocks unlimited analyses, exports, and saved history. Cancel anytime.
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
                Yes. You can cancel anytime and your Active Job Search access will remain active through the end of your billing period. No refunds are issued for partial months, but you will never be charged again after cancellation.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>
      )}


      <UpgradeModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        isAuthenticated={!!user}
        hasConsumedOneTimeCredit={hasConsumedOneTimeCredit}
        hasOneTimeCredit={hasOneTimeCredit}
        featureName={upgradeContext.feature_name}
        outputType={upgradeContext.output_type}
      />

    </div>
  );
};

export default Index;
