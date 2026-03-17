import { useState, useEffect, useRef } from "react";
import AlignmentLoader from "@/components/AlignmentLoader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, Copy, Check, Download, Lock, AlertTriangle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useReverseTrial } from "@/hooks/useReverseTrial";
import { useSubscription } from "@/hooks/useSubscription";
import ResumeUpload from "@/components/ResumeUpload";
import UpgradeModal from "@/components/UpgradeModal";

// ─── Types ───────────────────────────────────────────────────────────────────

interface RolePillar {
  pillar: string;
  weight: "High" | "Medium" | "Low";
  description: string;
}

interface RepositioningEntry {
  pillar: string;
  matching_experience: string;
  role_native_language: string;
  transferable_complexity: string;
}

interface CommercialConversion {
  original_framing: string;
  commercial_reframe: string;
  quantified_impact: string;
}

interface GapMitigation {
  gap: string;
  resume_edit: string;
  interview_narrative: string;
  micro_credential: string;
}

interface GapStrategy {
  hard_gaps: string[];
  perception_gaps: string[];
  mitigation: GapMitigation[];
}

interface BulletRewrite {
  original: string;
  rewritten: string;
}

interface MatchScoreForecast {
  before_percent: number;
  after_percent: number;
  rationale: string;
}

interface MarketPositionAssessment {
  level: "Support-Level" | "Operational-Level" | "Mid-Level Professional" | "Strategic-Level" | "Leadership-Level";
  explanation: string;
  under_positioned: boolean;
  under_positioned_explanation: string;
}

interface CompetitiveRiskSignal {
  area: string;
  explanation: string;
}

interface InterviewTrajectory {
  likely_focus_areas: string[];
  likely_objection: string;
  strategic_angle: string;
}

type CalibrationStatus = "Aligned" | "Under-Signaled" | "Authority Gap" | "Execution Bias" | "Executive Deficit";
type HiringStage = "Stage 1 — Recruiter Pattern Match" | "Stage 2 — Hiring Manager Authority Audit" | "Stage 3 — Executive Calibration";

interface RiskPerceptionItem {
  category: string;
  rating: "Low" | "Medium" | "High";
  explanation: string;
  mitigation: string;
  // PM Hiring Calibration Report fields (mapped from existing data)
  calibration_status?: CalibrationStatus;
  panel_read?: string;
  signal_deficiency?: string;
  hiring_risk_stage?: HiringStage;
}

interface PositioningResult {
  role_dna: RolePillar[];
  repositioning_matrix: RepositioningEntry[];
  commercial_value_conversion: CommercialConversion[];
  gap_strategy: GapStrategy;
  optimized_summary: string;
  bullet_rewrites: BulletRewrite[];
  interview_dominance_script: string;
  match_score_forecast: MatchScoreForecast;
  market_position_assessment?: MarketPositionAssessment;
  competitive_risk_signals?: CompetitiveRiskSignal[];
  interview_trajectory?: InterviewTrajectory;
  employer_risk_perception?: RiskPerceptionItem[];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const CopyButton = ({ text, label }: { text: string; label: string }) => {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={handle}
      aria-label={`Copy ${label}`}
      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
};

const Section = ({
  title,
  children,
  copyText,
  badge,
  proLabel,
}: {
  title: string;
  children: React.ReactNode;
  copyText?: string;
  badge?: React.ReactNode;
  proLabel?: boolean;
}) => (
  <div className="rounded-lg border bg-card p-5 space-y-3">
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {badge}
        {proLabel && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wide">
            Pro
          </span>
        )}
      </div>
      {copyText && <CopyButton text={copyText} label={title} />}
    </div>
    {children}
  </div>
);

const BulletList = ({ items }: { items: string[] }) => (
  <ul className="space-y-1.5 mt-1">
    {items.map((item, i) => (
      <li key={i} className="flex gap-2 text-sm text-muted-foreground leading-relaxed">
        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary opacity-60" />
        {item}
      </li>
    ))}
  </ul>
);

const weightColor = (w: string) => {
  if (w === "High") return "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400";
  if (w === "Medium") return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400";
  return "bg-muted text-muted-foreground";
};

const levelColor = (level: string) => {
  if (level === "Leadership-Level") return "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400";
  if (level === "Strategic-Level") return "bg-primary/10 text-primary";
  if (level === "Mid-Level Professional") return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400";
  return "bg-muted text-muted-foreground";
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const riskRatingColor = (r: string) => {
  if (r === "High") return "bg-destructive/10 text-destructive border border-destructive/20";
  if (r === "Medium") return "bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/40";
  return "bg-green-100 text-green-700 border border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-800/40";
};

const calibrationStatusColor = (s: CalibrationStatus) => {
  if (s === "Aligned") return "bg-green-100 text-green-700 border border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-800/40";
  if (s === "Under-Signaled") return "bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/40";
  if (s === "Authority Gap") return "bg-destructive/10 text-destructive border border-destructive/20";
  if (s === "Execution Bias") return "bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800/40";
  if (s === "Executive Deficit") return "bg-destructive/20 text-destructive border border-destructive/30";
  return "bg-muted text-muted-foreground border border-border";
};

// Derive calibration status from rating when not explicitly provided
const deriveCalibrationStatus = (rating: string, category: string): CalibrationStatus => {
  if (rating === "Low") return "Aligned";
  const cat = category.toLowerCase();
  if (rating === "High") {
    if (cat.includes("capabilit") || cat.includes("signal")) return "Authority Gap";
    if (cat.includes("commercial") || cat.includes("impact")) return "Executive Deficit";
    return "Under-Signaled";
  }
  if (cat.includes("context") || cat.includes("stability")) return "Execution Bias";
  return "Under-Signaled";
};

// Derive hiring stage from rating
const deriveHiringStage = (rating: string): HiringStage => {
  if (rating === "Low") return "Stage 1 — Recruiter Pattern Match";
  if (rating === "High") return "Stage 3 — Executive Calibration";
  return "Stage 2 — Hiring Manager Authority Audit";
};

// ─── Pillar Threshold Standards ──────────────────────────────────────────────

interface ThresholdPattern {
  type: "below" | "threshold";
  examples: string[];
}

interface PillarStandard {
  pillarKey: string; // matches item.category (case-insensitive partial)
  title: string;
  calibrationRule: string;
  seniorThreshold: string;
  thresholdCriteria: string[];
  patterns: ThresholdPattern[];
  signalLogic: string[];
}

const PILLAR_STANDARDS: PillarStandard[] = [
  {
    pillarKey: "capability",
    title: "Pillar 1 — Ownership Scope",
    calibrationRule: "Senior PM Threshold Standard",
    seniorThreshold:
      "A candidate meets Senior PM calibration when ownership scope is demonstrated end-to-end, roadmap sequencing is self-directed, and accountability is tied to measurable outcomes — not participation.",
    thresholdCriteria: [
      "Owns an end-to-end product or major initiative",
      "Defines roadmap sequencing — not just contributes to it",
      "Accountable for measurable outcomes",
      "Demonstrates scope beyond feature execution",
      "Signals initiative origination",
    ],
    patterns: [
      {
        type: "below",
        examples: [
          '"Worked on roadmap"',
          '"Contributed to feature delivery"',
          '"Partnered with PM"',
        ],
      },
      {
        type: "threshold",
        examples: [
          '"Owned product lifecycle"',
          '"Defined roadmap priorities"',
          '"Accountable for adoption metrics"',
          '"Led initiative end-to-end"',
        ],
      },
    ],
    signalLogic: [
      "If 3+ threshold signals are absent → calibration status: Under-Signaled",
      "If no end-to-end ownership language is present → calibration status: Authority Gap",
    ],
  },
  {
    pillarKey: "context",
    title: "Pillar 2 — Strategic Definition",
    calibrationRule: "Senior PM Threshold Standard",
    seniorThreshold:
      "A candidate meets Senior PM calibration when strategic definition is evident: problem framing is self-directed, prioritization is grounded in business objectives, and initiative sequencing connects to market or user strategy — not feature throughput.",
    thresholdCriteria: [
      "Defines problem framing — not just solves assigned problems",
      "Prioritizes based on business objectives and tradeoff logic",
      "Articulates sequencing rationale with strategic justification",
      "Connects initiatives to market positioning or user strategy",
      "Shows evidence of opportunity identification, not just execution",
    ],
    patterns: [
      {
        type: "below",
        examples: [
          "Feature-level execution focus only",
          "No prioritization logic present",
          "No business framing or tradeoff evidence",
        ],
      },
      {
        type: "threshold",
        examples: [
          '"Defined success metrics"',
          '"Prioritized against revenue targets"',
          '"Sequenced roadmap to align with market strategy"',
        ],
      },
    ],
    signalLogic: [
      "If prioritization logic is absent → calibration status: Strategic Deficit",
      "If execution dominates without strategic framing → calibration status: Execution Bias",
    ],
  },
  {
    pillarKey: "commercial",
    title: "Pillar 3 — Commercial Impact",
    calibrationRule: "Senior PM Threshold Standard",
    seniorThreshold:
      "A candidate meets Senior PM calibration when product work is translated into quantified business outcomes — revenue, retention, adoption, or cost — and commercial reasoning is explicit, not implied.",
    thresholdCriteria: [
      "Quantifies impact in business terms (revenue, retention, adoption, cost)",
      "Translates product decisions into measurable business consequences",
      "Demonstrates commercial reasoning behind prioritization",
      "Links feature or initiative output to downstream business metrics",
    ],
    patterns: [
      {
        type: "below",
        examples: [
          "Feature shipped — no measurable outcome stated",
          "Engagement metrics only, no business tie-in",
          "Output described without consequence",
        ],
      },
      {
        type: "threshold",
        examples: [
          '"Increased retention by X%"',
          '"Drove revenue growth through…"',
          '"Reduced churn by…"',
        ],
      },
    ],
    signalLogic: [
      "If business consequence is absent from outcomes → calibration status: Commercial Gap",
      "If impact is stated in activity terms only → calibration status: Under-Signaled",
    ],
  },
  {
    pillarKey: "stability",
    title: "Pillar 4 — Organizational Influence",
    calibrationRule: "Senior PM Threshold Standard",
    seniorThreshold:
      "A candidate meets Senior PM calibration when cross-functional authority is demonstrated through influence over engineering and GTM direction, navigation of tradeoffs across teams, and communication at the executive level — not coordination or participation.",
    thresholdCriteria: [
      "Influences engineering and GTM direction — not just aligns",
      "Navigates tradeoffs across competing team priorities",
      "Demonstrates cross-functional authority beyond project coordination",
      "Communicates and presents at the executive level",
    ],
    patterns: [
      {
        type: "below",
        examples: [
          "Lists stakeholders without influence evidence",
          '"Collaborated with" — no leadership or decision language',
          "Coordination described, authority absent",
        ],
      },
      {
        type: "threshold",
        examples: [
          '"Aligned engineering and GTM"',
          '"Negotiated roadmap tradeoffs"',
          '"Presented roadmap to executive leadership"',
        ],
      },
    ],
    signalLogic: [
      "If executive-facing signal is absent → calibration status: Executive Deficit",
      "If influence language is limited to coordination → calibration status: Authority Gap",
    ],
  },
];

const PillarThresholdStandard = ({ standard }: { standard: PillarStandard }) => {
  const belowPatterns = standard.patterns.find((p) => p.type === "below");
  const thresholdPatterns = standard.patterns.find((p) => p.type === "threshold");

  return (
    <div className="mt-3 rounded-md border border-border/70 bg-muted/10 overflow-hidden">
      {/* Title row */}
      <div className="px-3 py-2.5 border-b border-border/50 bg-muted/20 flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-foreground">{standard.title}</p>
        <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground border border-border/60 rounded px-1.5 py-0.5">
          {standard.calibrationRule}
        </span>
      </div>

      {/* Threshold definition */}
      <div className="px-3 pt-3 pb-2">
        <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-1.5">Threshold Definition</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{standard.seniorThreshold}</p>
      </div>

      {/* Threshold criteria */}
      <div className="px-3 py-2 border-t border-border/40">
        <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-1.5">Threshold Criteria</p>
        <ul className="space-y-1">
          {standard.thresholdCriteria.map((criterion, i) => (
            <li key={i} className="flex gap-2 text-[11px] text-muted-foreground leading-snug">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/50" />
              {criterion}
            </li>
          ))}
        </ul>
      </div>

      {/* Pattern comparison */}
      <div className="grid grid-cols-2 divide-x divide-border/40 border-t border-border/40">
        {/* Below threshold */}
        <div className="px-3 py-2.5">
          <p className="text-[9px] font-bold uppercase tracking-widest text-destructive/70 mb-1.5">Below Threshold</p>
          <ul className="space-y-1">
            {belowPatterns?.examples.map((ex, i) => (
              <li key={i} className="text-[10px] text-muted-foreground leading-snug font-mono">{ex}</li>
            ))}
          </ul>
        </div>
        {/* Threshold language */}
        <div className="px-3 py-2.5">
          <p className="text-[9px] font-bold uppercase tracking-widest text-green-700 dark:text-green-400 mb-1.5">Threshold Language</p>
          <ul className="space-y-1">
            {thresholdPatterns?.examples.map((ex, i) => (
              <li key={i} className="text-[10px] text-foreground leading-snug font-mono">{ex}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Signal evaluation logic */}
      <div className="px-3 py-2.5 border-t border-border/40 bg-muted/20">
        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Evaluation Logic</p>
        <ul className="space-y-1">
          {standard.signalLogic.map((rule, i) => (
            <li key={i} className="text-[10px] text-muted-foreground leading-snug">
              <span className="text-foreground font-medium">→ </span>{rule}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

// ─── Blurred Pro Teaser ───────────────────────────────────────────────────────

const LockedSection = ({ title, lockLabel = "Unlock Strategic Interview Forecasting with Pro" }: { title: string; lockLabel?: string }) => (
  <div className="rounded-lg border bg-card overflow-hidden relative">
    <div className="p-4 space-y-3 select-none pointer-events-none" aria-hidden>
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="space-y-2 blur-sm opacity-60">
        <div className="h-3 w-3/4 rounded bg-muted" />
        <div className="h-3 w-full rounded bg-muted" />
        <div className="h-3 w-2/3 rounded bg-muted" />
        <div className="h-3 w-5/6 rounded bg-muted" />
        <div className="h-3 w-1/2 rounded bg-muted" />
      </div>
    </div>
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-card/60 backdrop-blur-[2px]">
      <Lock className="h-4 w-4 text-muted-foreground" />
      <p className="text-xs font-medium text-foreground text-center px-6">{lockLabel}</p>
    </div>
  </div>
);

const LockedRiskCard = ({ category }: { category: string }) => (
  <div className="rounded-md border bg-background overflow-hidden relative min-h-[88px]">
    <div className="p-4 space-y-2 select-none pointer-events-none blur-sm opacity-40" aria-hidden>
      <div className="flex items-center gap-2">
        <span className="rounded-sm px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase bg-muted text-muted-foreground">MEDIUM</span>
      </div>
      <p className="text-xs font-semibold text-foreground">{category}</p>
      <div className="h-2.5 w-full rounded bg-muted" />
      <div className="h-2.5 w-4/5 rounded bg-muted" />
      <div className="h-2 w-1/2 rounded bg-muted" />
    </div>
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-background/80 backdrop-blur-[2px]">
      <Lock className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-[11px] text-muted-foreground font-medium tracking-wide">PRO ONLY</span>
    </div>
  </div>
);

// ─── Role Category Detection for Calibration Template ─────────────────────────

type CalibrationTemplate = "pm" | "operations_supervisor" | "general";

function detectCalibrationTemplate(result: PositioningResult): CalibrationTemplate {
  // Check role_dna pillars and all text signals for operations/supervisor patterns
  const allText = [
    ...result.role_dna.map(p => p.pillar + " " + p.description),
    result.optimized_summary || "",
    ...(result.gap_strategy?.hard_gaps || []),
  ].join(" ").toLowerCase();

  const opsPatterns = /\b(retail|store|team member|labor utilization|physical operations|floor|schedule|in-store|supervisory experience|supervisor|shift lead|crew|warehouse|fulfillment|inventory)\b/;
  const pmPatterns = /\b(product|roadmap|sprint|user story|stakeholder alignment|go-to-market|product lifecycle|product manager|product management)\b/;

  if (opsPatterns.test(allText)) return "operations_supervisor";
  if (pmPatterns.test(allText)) return "pm";
  return "general";
}

const OPS_PILLAR_STANDARDS: PillarStandard[] = [
  {
    pillarKey: "capability",
    title: "Pillar 1 — Team Leadership Evidence",
    calibrationRule: "Operations Supervisor Threshold Standard",
    seniorThreshold: "A candidate meets Supervisor calibration when team leadership is demonstrated through direct report management, shift coordination, and performance accountability — not peer collaboration.",
    thresholdCriteria: [
      "Manages direct reports or team members",
      "Coordinates shift scheduling and coverage",
      "Handles team performance conversations",
      "Demonstrates hiring or onboarding responsibility",
    ],
    patterns: [
      { type: "below", examples: ['"Worked with team"', '"Helped train new hires"', '"Supported operations"'] },
      { type: "threshold", examples: ['"Managed team of 8"', '"Owned shift scheduling"', '"Conducted performance reviews"'] },
    ],
    signalLogic: [
      "If no direct report evidence → calibration status: Under-Signaled",
      "If team language is peer-level only → calibration status: Authority Gap",
    ],
  },
  {
    pillarKey: "context",
    title: "Pillar 2 — Operational Execution Scope",
    calibrationRule: "Operations Supervisor Threshold Standard",
    seniorThreshold: "A candidate meets Supervisor calibration when operational ownership spans daily execution decisions, process adherence, and throughput accountability.",
    thresholdCriteria: [
      "Owns daily operational workflow",
      "Maintains compliance and safety standards",
      "Manages inventory, scheduling, or labor allocation",
      "Accountable for operational KPIs",
    ],
    patterns: [
      { type: "below", examples: ["Follows procedures", "Assists with inventory", "Participates in operations"] },
      { type: "threshold", examples: ['"Owned daily operations for department"', '"Managed labor budget"', '"Reduced shrink by X%"'] },
    ],
    signalLogic: [
      "If operational ownership is implied not stated → calibration status: Under-Signaled",
      "If execution scope is task-level only → calibration status: Execution Bias",
    ],
  },
  {
    pillarKey: "commercial",
    title: "Pillar 3 — Customer Experience Ownership",
    calibrationRule: "Operations Supervisor Threshold Standard",
    seniorThreshold: "A candidate meets Supervisor calibration when customer experience outcomes are tied to team actions and measurable service metrics.",
    thresholdCriteria: [
      "Connects team performance to customer satisfaction",
      "Owns service quality for their area",
      "Resolves escalated customer issues",
      "Tracks and improves customer-facing metrics",
    ],
    patterns: [
      { type: "below", examples: ["Helped customers", "Responded to complaints", "Provided service"] },
      { type: "threshold", examples: ['"Maintained 95% CSAT score"', '"Reduced customer complaints by X%"', '"Owned service recovery process"'] },
    ],
    signalLogic: [
      "If customer outcomes are described without metrics → calibration status: Under-Signaled",
      "If service language is reactive only → calibration status: Authority Gap",
    ],
  },
  {
    pillarKey: "stability",
    title: "Pillar 4 — Process & Compliance Discipline",
    calibrationRule: "Operations Supervisor Threshold Standard",
    seniorThreshold: "A candidate meets Supervisor calibration when compliance and process adherence is actively owned — not passively followed.",
    thresholdCriteria: [
      "Enforces safety, food safety, or regulatory compliance",
      "Owns process improvement within their area",
      "Trains team on procedures and standards",
      "Documents and audits operational compliance",
    ],
    patterns: [
      { type: "below", examples: ["Followed safety procedures", "Completed checklists", "Met compliance requirements"] },
      { type: "threshold", examples: ['"Trained team on food safety protocols"', '"Led compliance audit preparation"', '"Redesigned closing procedures"'] },
    ],
    signalLogic: [
      "If compliance is described as following not enforcing → calibration status: Under-Signaled",
      "If process improvement is absent → calibration status: Execution Bias",
    ],
  },
];

const CalibrationLogicSummary = ({ template }: { template: CalibrationTemplate }) => {
  const isOps = template === "operations_supervisor";
  const title = isOps ? "Operations Supervisor Calibration Logic" : "Senior PM Calibration Logic";
  const subTitle = isOps ? "Operations Supervisor Calibration — All Four Pillars at Threshold" : "Senior PM Calibration — All Four Pillars at Threshold";
  const pillars = isOps
    ? ["Team Leadership ≥ Threshold", "Operational Execution ≥ Threshold", "Customer Experience ≥ Threshold", "Process & Compliance ≥ Threshold"]
    : ["Ownership Scope ≥ Threshold", "Strategic Definition ≥ Threshold", "Commercial Impact ≥ Threshold", "Organizational Influence ≥ Threshold"];

  return (
    <div className="rounded-md border bg-background overflow-hidden">
      <div className="px-4 py-3 border-b border-border/50 bg-muted/20 flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-foreground">{title}</p>
        <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground border border-border/60 rounded px-1.5 py-0.5">Evaluation Standard</span>
      </div>
      <div className="px-4 py-3 border-b border-border/40">
        <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-2">{subTitle}</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {pillars.map((criterion, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-green-500 dark:bg-green-400 shrink-0" />
              <span className="text-[10px] text-muted-foreground">{criterion}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="divide-y divide-border/40">
        {[
          { condition: "2+ Pillars Below Threshold", verdict: "Level Gap — 1 Tier Below", severity: "amber" },
          { condition: "3+ Pillars Below Threshold", verdict: "Execution Bias", severity: "orange" },
          { condition: "4 Pillars Below Threshold", verdict: "Contributor-Level Calibration", severity: "red" },
        ].map(({ condition, verdict, severity }) => (
          <div key={condition} className="px-4 py-2.5 flex items-center justify-between gap-3">
            <span className="text-[10px] text-muted-foreground">{condition}</span>
            <span className={`shrink-0 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${
              severity === "amber" ? "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/40"
              : severity === "orange" ? "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800/40"
              : "bg-destructive/10 text-destructive border-destructive/20"
            }`}>{verdict}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Timeout Error Card ───────────────────────────────────────────────────────

const TimeoutErrorCard = ({
  onRetry,
  experienceLen,
  jdLen,
}: {
  onRetry: () => void;
  experienceLen: number;
  jdLen: number;
}) => {
  const handleCopyDebug = () => {
    const info = JSON.stringify({
      timestamp: new Date().toISOString(),
      route: "/position",
      resume_chars: experienceLen,
      jd_chars: jdLen,
    }, null, 2);
    navigator.clipboard.writeText(info);
    toast.success("Debug info copied");
  };
  return (
    <div className="rounded-lg border border-destructive/30 bg-card p-5 space-y-4 animate-fade-in">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Generation timed out</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            This took longer than 60 seconds. This can happen with very large resumes or high server load. Try again — it usually works on the second attempt.
          </p>
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" onClick={onRetry} className="gap-1.5 h-8 text-xs">
          <RefreshCw className="h-3 w-3" />
          Retry
        </Button>
        <Button size="sm" variant="outline" onClick={handleCopyDebug} className="gap-1.5 h-8 text-xs">
          <Copy className="h-3 w-3" />
          Copy Debug Info
        </Button>
      </div>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const CHAR_LIMIT_TIP = 12000;
const TIMEOUT_MS = 60000;
// Steps advance at 0s, 12s (step 2 after ~12s), 25s (step 3 after ~25s)
// Each step internally cycles its label every STEP_CYCLE_MS
const STEP_TIMINGS = [0, 12000, 25000];
const STEP_CYCLE_MS = 3000;

// ─── Client-side cache (sessionStorage) ──────────────────────────────────────

async function hashInputs(experience: string, jd: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(experience + "|||" + jd));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getCached(key: string): PositioningResult | null {
  try {
    const raw = sessionStorage.getItem(`titan_cache_${key}`);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > 30 * 60 * 1000) { sessionStorage.removeItem(`titan_cache_${key}`); return null; }
    return data as PositioningResult;
  } catch { return null; }
}

function setCached(key: string, data: PositioningResult) {
  try {
    sessionStorage.setItem(`titan_cache_${key}`, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* ignore quota errors */ }
}


const Position = () => {
  const [experience, setExperience] = useState("");
  const [jd, setJd] = useState("");
  const [result, setResult] = useState<PositioningResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [errors, setErrors] = useState<{ experience?: string; jd?: string }>({});
  const [showUpgrade, setShowUpgrade] = useState(false);

  const stepTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(0);

  const isAdmin = useIsAdmin();
  const { isTrialPro, trialStarted, trialRunsUsed, trialExhausted, startTrial, TRIAL_LIMIT } = useReverseTrial();
  const { isPro, loading: subLoading } = useSubscription();
  const effectiveIsPro = isPro || isAdmin || isTrialPro;

  const clearTimers = () => {
    stepTimers.current.forEach(clearTimeout);
    stepTimers.current = [];
    if (elapsedTimer.current) { clearInterval(elapsedTimer.current); elapsedTimer.current = null; }
    if (timeoutTimer.current) { clearTimeout(timeoutTimer.current); timeoutTimer.current = null; }
  };

  const startProgressTimers = () => {
    setActiveStep(0);
    setElapsed(0);
    startTimeRef.current = Date.now();

    // Elapsed counter (seconds)
    elapsedTimer.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    // Step transitions
    STEP_TIMINGS.forEach((delay, i) => {
      const t = setTimeout(() => setActiveStep(i), delay);
      stepTimers.current.push(t);
    });
  };

  const completeProgress = () => {
    clearTimers();
    setActiveStep(3); // 3 steps total — mark all done
  };


  const validate = () => {
    const errs: typeof errors = {};
    if (!experience.trim()) errs.experience = "Please paste your experience or resume section.";
    if (!jd.trim()) errs.jd = "Please paste a job description.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleRun = async () => {
    if (!validate()) return;

    // ── Client-side cache check ──────────────────────────────────────────────
    const cacheKey = await hashInputs(experience.trim(), jd.trim());
    const cached = getCached(cacheKey);
    if (cached) {
      setResult(cached);
      toast.success("Results loaded instantly from cache.", { duration: 2000 });
      return;
    }

    setLoading(true);
    setTimedOut(false);
    setResult(null);
    clearTimers();
    startProgressTimers();

    // Client-side 60s timeout
    timeoutTimer.current = setTimeout(() => {
      setLoading(false);
      setTimedOut(true);
      clearTimers();
    }, TIMEOUT_MS);

    try {
      // ── Resolve alignment score: sessionStorage → DB → undefined ──────────
      const normalizedJd = jd.trim()
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
        .replace(/[^\S\n]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      const jdFingerprint = normalizedJd.replace(/\s+/g, " ").toLowerCase().slice(0, 150);

      let existingScore: number | undefined;

      // 1) Try sessionStorage (same-session passthrough)
      try {
        const raw = sessionStorage.getItem("signalyz_alignment_score");
        if (raw) {
          const stored = JSON.parse(raw);
          if (stored.jd_fingerprint === jdFingerprint && Date.now() - stored.ts < 30 * 60 * 1000) {
            existingScore = stored.score;
            console.log("[Position] Using sessionStorage alignment score:", existingScore);
          }
        }
      } catch {}

      // 2) If no session match, query alignment_history for a recent score (last 24h)
      if (existingScore === undefined) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const { data: historyRows } = await supabase
              .from("alignment_history")
              .select("score, full_result_json, created_at")
              .eq("user_id", user.id)
              .gte("created_at", cutoff)
              .order("created_at", { ascending: false })
              .limit(10);

            if (historyRows && historyRows.length > 0) {
              // Match by JD fingerprint stored in full_result_json
              for (const row of historyRows) {
                try {
                  const fullResult = row.full_result_json as any;
                  // The full_result_json contains the original JD in the input
                  // We need to check if the stored result matches this JD
                  const storedJd = fullResult?.jd_text || fullResult?.input_jd || "";
                  if (storedJd) {
                    const storedFingerprint = storedJd.trim()
                      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
                      .replace(/[^\S\n]+/g, " ")
                      .replace(/\n{3,}/g, "\n\n")
                      .trim()
                      .replace(/\s+/g, " ")
                      .toLowerCase()
                      .slice(0, 150);
                    if (storedFingerprint === jdFingerprint) {
                      existingScore = row.score;
                      console.log("[Position] Using alignment_history DB score:", existingScore);
                      break;
                    }
                  }
                  // Fallback: if full_result_json has match_score, use most recent
                  if (!existingScore && typeof fullResult?.match_score === "number") {
                    // Can't fingerprint-match without stored JD, skip
                  }
                } catch {}
              }
            }
          }
        } catch {}
      }

      const { data, error } = await supabase.functions.invoke("titan-position", {
        body: { experience: experience.trim(), jd: jd.trim(), existing_alignment_score: existingScore },
      });
      clearTimeout(timeoutTimer.current!);
      timeoutTimer.current = null;
      completeProgress();
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const posResult = data as PositioningResult;

      // Client-side override: force before_percent to match alignment score
      if (typeof existingScore === "number" && posResult.match_score_forecast) {
        posResult.match_score_forecast.before_percent = existingScore;
        // Ensure after_percent is always higher than before
        if (posResult.match_score_forecast.after_percent <= existingScore) {
          posResult.match_score_forecast.after_percent = Math.min(100, existingScore + 15);
        }
      }

      setCached(cacheKey, posResult);
      setResult(posResult);
    } catch (err: any) {
      completeProgress();
      if (!timedOut) toast.error(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };


  const handleDownload = () => {
    if (!result) return;
    const lines: string[] = [
      "SIGNALYZ — STRATEGIC POSITIONING ENGINE (ROLE DNA)",
      "===================================================",
      "",
      "1. ROLE DNA EXTRACTION",
      ...result.role_dna.map((p) => `  [${p.weight}] ${p.pillar}: ${p.description}`),
      "",
      "2. EXPERIENCE REPOSITIONING MATRIX",
      ...result.repositioning_matrix.map(
        (m) =>
          `  ${m.pillar}\n  → Real Experience: ${m.matching_experience}\n  → Role Language: ${m.role_native_language}\n  → Transferable Complexity: ${m.transferable_complexity}`
      ),
      "",
      "3. COMMERCIAL VALUE CONVERSION",
      ...result.commercial_value_conversion.map(
        (c) => `  Original: ${c.original_framing}\n  Reframe: ${c.commercial_reframe}\n  Impact: ${c.quantified_impact}`
      ),
      "",
      "4. GAP STRATEGY",
      "Hard Gaps:",
      ...result.gap_strategy.hard_gaps.map((g) => `  • ${g}`),
      "Perception Gaps:",
      ...result.gap_strategy.perception_gaps.map((g) => `  • ${g}`),
      "Mitigation:",
      ...result.gap_strategy.mitigation.map(
        (m) =>
          `  Gap: ${m.gap}\n  Resume Edit: ${m.resume_edit}\n  Interview: ${m.interview_narrative}\n  Credential: ${m.micro_credential}`
      ),
      "",
      "5. OPTIMIZED SUMMARY",
      result.optimized_summary,
      "",
      "6. CALIBRATED BULLET REPOSITIONING",
      ...result.bullet_rewrites.map((b) => `  Before: ${b.original}\n  After:  ${b.rewritten}`),
      "",
      "7. INTERVIEW DOMINANCE SCRIPT",
      result.interview_dominance_script,
      "",
      "8. MATCH SCORE FORECAST",
      `  Before: ${result.match_score_forecast.before_percent}%`,
      `  After:  ${result.match_score_forecast.after_percent}%`,
      `  Rationale: ${result.match_score_forecast.rationale}`,
    ];

    if (result.market_position_assessment) {
      const mpa = result.market_position_assessment;
      lines.push(
        "",
        "9. MARKET POSITION ASSESSMENT",
        `  Level: ${mpa.level}`,
        `  ${mpa.explanation}`,
        ...(mpa.under_positioned ? [`  Under-Positioned: ${mpa.under_positioned_explanation}`] : [])
      );
    }

    if (result.competitive_risk_signals?.length) {
      lines.push("", "10. COMPETITIVE RISK SIGNALS");
      result.competitive_risk_signals.forEach((s) => {
        lines.push(`  • ${s.area}: ${s.explanation}`);
      });
    }

    if (effectiveIsPro && result.interview_trajectory) {
      const it = result.interview_trajectory;
      lines.push(
        "",
        "11. INTERVIEW TRAJECTORY PREVIEW",
        "  Likely Focus Areas:",
        ...it.likely_focus_areas.map((f) => `    • ${f}`),
        `  Likely Objection: ${it.likely_objection}`,
        `  Strategic Angle: ${it.strategic_angle}`
      );
    }

    if (result.employer_risk_perception?.length) {
      lines.push("", "12. EMPLOYER RISK PERCEPTION ANALYSIS");
      const visibleItems = effectiveIsPro ? result.employer_risk_perception : result.employer_risk_perception.slice(0, 1);
      visibleItems.forEach((r) => {
        lines.push(`  ${r.category} — ${r.rating} Risk`);
        lines.push(`  ${r.explanation}`);
        lines.push(`  Mitigation: ${r.mitigation}`);
        lines.push("");
      });
    }

    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "signalyz-positioning.txt";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Download started", { duration: 1500 });
  };

  return (
    <div className="container max-w-6xl md:max-w-tool py-8">
      {/* Header — clearly differentiated from Alignment Engine */}
      <div className="mb-8 text-center max-w-2xl mx-auto">
        <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-primary mb-2">Strategic Interpretation Layer</p>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Signal Positioning Report
        </h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-lg mx-auto">
          The Alignment Engine scores where you stand. This report tells you <span className="font-medium text-foreground">exactly how to close the gap</span> — role identity deconstruction, commercial reframing, and strategic repositioning.
        </p>
      </div>

      {/* How it works — differentiates from AE */}
      <div className="mb-10 mx-auto max-w-2xl">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { step: "1", title: "Deconstruct", desc: "Extracts the 5 identity pillars the employer is actually hiring for — not keywords." },
            { step: "2", title: "Reposition", desc: "Maps your real experience into the role's commercial language with zero fabrication." },
            { step: "3", title: "Equip", desc: "Gap mitigation, calibrated bullets, interview scripts, and market position assessment." },
          ].map((item) => (
            <div key={item.step} className="rounded-lg border bg-card p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {item.step}
                </span>
                <p className="text-sm font-semibold text-foreground">{item.title}</p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Left — Inputs */}
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="block text-sm font-medium text-foreground">Your Resume / Experience</label>
              <span className={`text-[11px] tabular-nums ${experience.length > CHAR_LIMIT_TIP ? "text-warning font-medium" : "text-muted-foreground"}`}>
                {experience.length.toLocaleString()} chars
              </span>
            </div>
            <p className="mb-1.5 text-xs text-muted-foreground">
              Paste your full resume, summary, or most relevant role. More context yields stronger output.
            </p>
            <Textarea
              placeholder="Paste your experience here..."
              value={experience}
              onChange={(e) => { setExperience(e.target.value); setErrors((p) => ({ ...p, experience: undefined })); }}
              rows={9}
              disabled={loading}
              className={errors.experience ? "border-destructive" : ""}
            />
            {errors.experience && <p className="mt-1 text-xs text-destructive">{errors.experience}</p>}
            {experience.length > CHAR_LIMIT_TIP && (
              <p className="mt-1 text-[11px] text-warning leading-relaxed">
                💡 For best speed, paste your most recent 1–2 roles or a shortened resume.
              </p>
            )}
            <ResumeUpload onTextExtracted={(text) => { setExperience(text); setErrors((p) => ({ ...p, experience: undefined })); }} onClear={() => { setExperience(""); setErrors((p) => ({ ...p, experience: undefined })); }} />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="block text-sm font-medium text-foreground">Target Job Description</label>
              <span className={`text-[11px] tabular-nums ${jd.length > CHAR_LIMIT_TIP ? "text-warning font-medium" : "text-muted-foreground"}`}>
                {jd.length.toLocaleString()} chars
              </span>
            </div>
            <p className="mb-1.5 text-xs text-muted-foreground">
              Paste the full job description. We extract the employer's identity priorities, not just keywords.
            </p>
            <Textarea
              placeholder="Paste the job description..."
              value={jd}
              onChange={(e) => { setJd(e.target.value); setErrors((p) => ({ ...p, jd: undefined })); }}
              rows={9}
              disabled={loading}
              className={errors.jd ? "border-destructive" : ""}
            />
            {errors.jd && <p className="mt-1 text-xs text-destructive">{errors.jd}</p>}
            {jd.length > CHAR_LIMIT_TIP && (
              <p className="mt-1 text-[11px] text-warning leading-relaxed">
                💡 For best speed, paste your most recent 1–2 roles or a shortened resume.
              </p>
            )}
          </div>

          {!effectiveIsPro ? (
            <Button onClick={() => setShowUpgrade(true)} className="gap-2" size="lg">
              <Lock className="h-4 w-4" />
              Generate Positioning Report
            </Button>
          ) : (
            <Button onClick={handleRun} disabled={loading} className="gap-2" size="lg">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate Positioning Report
            </Button>
          )}
          <p className="text-[11px] text-muted-foreground">
            Full 12-section strategic report · 30–60 seconds · Zero fabrication
          </p>

          <UpgradeModal
            open={showUpgrade}
            onClose={() => setShowUpgrade(false)}
            trialStarted={trialStarted}
            trialRunsUsed={trialRunsUsed}
            trialLimit={TRIAL_LIMIT}
            onStartTrial={startTrial}
          />
        </div>

        {/* Right — Results */}
        <div className="space-y-4 min-w-0">
          {/* Three mutually exclusive display states: IDLE, RUNNING, COMPLETE */}
          {loading ? (
            /* RUNNING — generation in progress */
            <AlignmentLoader minHeight="320px" />
          ) : timedOut ? (
            <TimeoutErrorCard
              onRetry={handleRun}
              experienceLen={experience.length}
              jdLen={jd.length}
            />
          ) : !result ? (
            /* IDLE — premium diagnostic intro */
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card min-h-[320px] p-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-4">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-1.5">Your positioning report will appear here</h3>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
                This goes deeper than signal scoring — it deconstructs the role's identity requirements and rebuilds your narrative to match them.
              </p>
            </div>
          ) : null}

          {/* COMPLETE — only render output when not loading and result exists */}
          {!loading && !timedOut && result && (
            <>
              {/* ── INTELLIGENCE LAYER ── */}
              <div className="pt-1">
                <p className="text-[10px] uppercase tracking-[0.15em] font-semibold text-primary/70 mb-3">Intelligence Layer — Role Deconstruction</p>
              </div>

              {/* 1 — Role DNA */}
              <Section title="Role DNA Extraction">
                <div className="space-y-2">
                  {result.role_dna.map((p, i) => (
                    <div key={i} className="rounded-md border bg-background p-3 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">{p.pillar}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${weightColor(p.weight)}`}>
                          {p.weight}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{p.description}</p>
                    </div>
                  ))}
                </div>
              </Section>

              {/* 2 — Hiring Calibration Report (role-aware) */}
              {result.employer_risk_perception && result.employer_risk_perception.length > 0 && (() => {
                const calTemplate = detectCalibrationTemplate(result);
                const sectionTitle = calTemplate === "operations_supervisor"
                  ? "Hiring Calibration — Operations Supervisor"
                  : "Hiring Calibration Report";
                const activeStandards = calTemplate === "operations_supervisor" ? OPS_PILLAR_STANDARDS : PILLAR_STANDARDS;
                return (
                <Section title={sectionTitle} proLabel>
                  <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed border-l-2 border-border pl-3">
                    Structured evaluation of how each identity pillar reads across hiring stages. Grounded strictly in resume signal relative to JD weighting.
                  </p>
                  <CalibrationLogicSummary template={calTemplate} />
                  <div className="space-y-3 mt-3">

                    {result.employer_risk_perception.map((item, i) => {
                      const isVisible = effectiveIsPro || i === 0;
                      if (!isVisible) {
                        return <LockedRiskCard key={i} category={item.category} />;
                      }
                      const status = item.calibration_status ?? deriveCalibrationStatus(item.rating, item.category);
                      const stage = item.hiring_risk_stage ?? deriveHiringStage(item.rating);
                      const panelRead = item.panel_read ?? item.explanation;
                      const signalDeficiency = item.signal_deficiency ?? item.mitigation;
                      return (
                        <div key={i} className="rounded-md border bg-background overflow-hidden">
                          {/* Header row */}
                          <div className="px-4 pt-4 pb-3 space-y-2">
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-xs font-semibold text-foreground leading-snug">{item.category}</p>
                              <span className={`shrink-0 inline-flex items-center rounded-sm px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase whitespace-nowrap ${calibrationStatusColor(status)}`}>
                                {status}
                              </span>
                            </div>
                            {/* Hiring Stage */}
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Hiring Risk:</span>
                              <span className="text-[10px] font-semibold text-foreground">{stage}</span>
                            </div>
                          </div>
                          {/* Panel Read */}
                          <div className="px-4 pb-3 border-t border-border/40 pt-3">
                            <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-1.5">Panel Read</p>
                            <p className="text-xs text-muted-foreground leading-relaxed">{panelRead}</p>
                          </div>
                          {/* Signal Deficiency */}
                          <div className="px-4 py-3 border-t border-border/60 bg-muted/20">
                            <p className="text-[10px] uppercase tracking-widest font-semibold text-primary mb-1.5">
                              Primary Signal Deficiency
                            </p>
                            <p className="text-xs text-foreground leading-relaxed">{signalDeficiency}</p>
                          </div>
                          {/* Pillar Threshold Standard — rendered when available */}
                          {(() => {
                            const std = activeStandards.find((s) =>
                              item.category.toLowerCase().includes(s.pillarKey)
                            );
                            return std ? (
                              <div className="px-4 pb-4">
                                <PillarThresholdStandard standard={std} />
                              </div>
                            ) : null;
                          })()}
                        </div>
                      );
                    })}
                  </div>
                  {!effectiveIsPro && (
                    <div className="mt-4 pt-4 border-t border-border/50 flex flex-col items-start gap-3">
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        4 calibration pillars — Context, Signal, Stability, and Commercial Impact — are restricted to Employer Intelligence™.
                      </p>
                      <Button size="sm" className="gap-1.5 text-xs h-8 px-3">
                        <Lock className="h-3 w-3" />
                        See My Exact Fix
                      </Button>
                      <p className="text-[11px] text-destructive/70 italic">Every application without fixing this risks being ignored.</p>
                    </div>
                  )}
                </Section>
                );
              })()}

              {/* ── CONVERSION LAYER ── */}
              <div className="pt-2">
                <p className="text-[10px] uppercase tracking-[0.15em] font-semibold text-primary/70 mb-3">Conversion Layer — Repositioning & Reframing</p>
              </div>

              {/* 3 — Repositioning Matrix */}
              <Section title="Experience Repositioning Matrix">
                <div className="space-y-3">
                  {result.repositioning_matrix.map((m, i) => (
                    <div key={i} className="rounded-md border bg-background p-3 space-y-2">
                      <p className="text-xs font-semibold text-foreground">{m.pillar}</p>
                      <div className="grid grid-cols-1 gap-1.5">
                        <div>
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Real Experience</span>
                          <p className="text-xs text-muted-foreground mt-0.5">{m.matching_experience}</p>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase tracking-wide text-primary font-medium">Role-Native Language</span>
                          <p className="text-xs text-foreground mt-0.5">{m.role_native_language}</p>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Transferable Complexity</span>
                          <p className="text-xs text-muted-foreground mt-0.5 italic">{m.transferable_complexity}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              {/* 4 — Commercial Value */}
              <Section title="Commercial Value Conversion">
                <div className="space-y-3">
                  {result.commercial_value_conversion.map((c, i) => (
                    <div key={i} className="rounded-md border bg-background p-3 space-y-1.5">
                      <div className="flex items-start gap-1.5">
                        <span className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground shrink-0 mt-0.5">Was:</span>
                        <p className="text-xs text-muted-foreground line-through">{c.original_framing}</p>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <span className="text-[10px] uppercase tracking-wide font-medium text-primary shrink-0 mt-0.5">Now:</span>
                        <p className="text-xs text-foreground font-medium">{c.commercial_reframe}</p>
                      </div>
                      {c.quantified_impact && (
                        <p className="text-[11px] text-muted-foreground italic">{c.quantified_impact}</p>
                      )}
                    </div>
                  ))}
                </div>
              </Section>

              {/* 5 — Gap Strategy */}
              <Section title="Gap Strategy">
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-destructive/70 mb-1.5">Hard Gaps</p>
                    <BulletList items={result.gap_strategy.hard_gaps} />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-amber-600 dark:text-amber-400 mb-1.5">Perception Gaps</p>
                    <BulletList items={result.gap_strategy.perception_gaps} />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Mitigation Playbook</p>
                    <div className="space-y-2">
                      {result.gap_strategy.mitigation.map((m, i) => (
                        <div key={i} className="rounded-md border bg-background p-3 space-y-1.5">
                          <p className="text-xs font-semibold text-foreground">{m.gap}</p>
                          <p className="text-[11px] text-muted-foreground"><span className="font-medium text-foreground">Resume:</span> {m.resume_edit}</p>
                          <p className="text-[11px] text-muted-foreground"><span className="font-medium text-foreground">Interview:</span> {m.interview_narrative}</p>
                          {m.micro_credential !== "N/A" && (
                            <p className="text-[11px] text-muted-foreground"><span className="font-medium text-foreground">Credential:</span> {m.micro_credential}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Section>

              {/* 6 — Optimized Summary */}
              <Section title="Optimized Summary" copyText={result.optimized_summary}>
                <p className="text-sm leading-relaxed text-muted-foreground">{result.optimized_summary}</p>
              </Section>

              {/* 7 — Bullet Rewrites */}
              <Section title="Calibrated Bullet Repositioning">
                <div className="space-y-3">
                  {result.bullet_rewrites.map((b, i) => (
                    <div key={i} className="rounded-md border bg-background p-3 space-y-2">
                      <p className="text-[11px] text-muted-foreground line-through leading-relaxed">{b.original}</p>
                      <div className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        <div className="flex-1 flex items-start justify-between gap-2">
                          <p className="text-xs font-medium text-foreground leading-relaxed">{b.rewritten}</p>
                          <CopyButton text={b.rewritten} label={`Bullet ${i + 1}`} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              {/* 8 — Interview Dominance Script */}
              <Section title="Interview Dominance Script" copyText={result.interview_dominance_script}>
                <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
                  {result.interview_dominance_script}
                </p>
              </Section>

              {/* ── AUTHORITY LAYER ── */}
              <div className="pt-2">
                <p className="text-[10px] uppercase tracking-[0.15em] font-semibold text-primary/70 mb-3">Authority Layer — Strategic Assessment</p>
              </div>

              {/* 9 — Match Score Forecast */}
              <Section title="Match Score Forecast">
                <div className="flex items-center gap-4 sm:gap-6">
                  <div className="text-center">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Before</p>
                    <span className="text-2xl font-bold text-destructive tabular-nums">{result.match_score_forecast.before_percent}%</span>
                  </div>
                  <div className="flex-1 relative">
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-destructive to-primary transition-all" style={{ width: `${result.match_score_forecast.after_percent}%` }} />
                    </div>
                    <div className="absolute top-3 left-0 right-0 flex justify-between">
                      <span className="text-[9px] text-muted-foreground">0%</span>
                      <span className="text-[9px] text-muted-foreground">Interview range →</span>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">After</p>
                    <span className="text-2xl font-bold text-primary tabular-nums">{result.match_score_forecast.after_percent}%</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed mt-3">{result.match_score_forecast.rationale}</p>
              </Section>

              {/* ── STRATEGIC AUTHORITY LAYER ── */}

              {/* 10 — Market Position Assessment (always visible) */}
              {result.market_position_assessment && (
                <Section title="Market Position Assessment">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${levelColor(result.market_position_assessment.level)}`}>
                        {result.market_position_assessment.level}
                      </span>
                      {result.market_position_assessment.under_positioned && (
                        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive uppercase tracking-wide">
                          Under-positioned
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {result.market_position_assessment.explanation}
                    </p>
                    {result.market_position_assessment.under_positioned && result.market_position_assessment.under_positioned_explanation && (
                      <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3">
                        <p className="text-xs text-destructive/80 leading-relaxed">
                          {result.market_position_assessment.under_positioned_explanation}
                        </p>
                      </div>
                    )}
                  </div>
                </Section>
              )}

              {/* 11 — Competitive Risk Signals (free: 1–2, pro: all) */}
              {result.competitive_risk_signals && result.competitive_risk_signals.length > 0 && (
                <Section title="Competitive Risk Signals">
                  <div className="space-y-2">
                    {(effectiveIsPro
                      ? result.competitive_risk_signals
                      : result.competitive_risk_signals.slice(0, 2)
                    ).map((s, i) => (
                      <div key={i} className="rounded-md border bg-background p-3 space-y-1">
                        <p className="text-xs font-semibold text-foreground">{s.area}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{s.explanation}</p>
                      </div>
                    ))}
                    {!effectiveIsPro && result.competitive_risk_signals.length > 2 && (
                      <p className="text-[11px] text-muted-foreground pt-1">
                        {result.competitive_risk_signals.length - 2} additional risk signal{result.competitive_risk_signals.length - 2 !== 1 ? "s" : ""} available on Pro.
                      </p>
                    )}
                  </div>
                </Section>
              )}

              {/* 12 — Interview Trajectory (pro: full, free: locked) */}
              {result.interview_trajectory && (
                (effectiveIsPro || subLoading) ? (
                  <Section title="12. Interview Trajectory Preview" proLabel>
                    <div className="space-y-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">
                          Likely Focus Areas
                        </p>
                        <BulletList items={result.interview_trajectory.likely_focus_areas} />
                      </div>
                      <div className="rounded-md border bg-background p-3 space-y-1">
                        <p className="text-[10px] uppercase tracking-wide text-destructive/70 font-medium">
                          Likely Objection
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {result.interview_trajectory.likely_objection}
                        </p>
                      </div>
                      <div className="rounded-md border bg-background p-3 space-y-1">
                        <p className="text-[10px] uppercase tracking-wide text-primary font-medium">
                          Strategic Angle to Emphasize
                        </p>
                        <p className="text-xs text-foreground leading-relaxed">
                          {result.interview_trajectory.strategic_angle}
                        </p>
                      </div>
                    </div>
                  </Section>
                ) : (
                  <LockedSection title="12. Interview Trajectory Preview" />
                )
              )}

              {/* Download */}
              <div className="flex items-center gap-3 pt-2">
                <Button variant="outline" size="sm" onClick={handleDownload} className="gap-2">
                  <Download className="h-3.5 w-3.5" />
                  Download Full Package
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Position;
