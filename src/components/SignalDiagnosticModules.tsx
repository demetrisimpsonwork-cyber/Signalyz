import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Info, ChevronDown, ChevronUp, ArrowRight, TrendingUp, Lock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import EvidenceLedger from "@/components/EvidenceLedger";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/* ─── Dimension display label map ─── */
const DIMENSION_DISPLAY_LABELS: Record<string, string> = {
  role_identity: "Role Identity Clarity",
  commercial_impact: "Commercial Impact",
  domain_expertise: "Domain Expertise",
  ownership_framing: "Ownership Framing",
  stakeholder_influence: "Stakeholder Influence",
  operational_execution: "Operational Execution",
};

function dimensionDisplayLabel(raw: string): string {
  const key = raw.toLowerCase().replace(/\s+/g, "_");
  return DIMENSION_DISPLAY_LABELS[key] || raw.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

/* ─── Types ─── */
interface SignalCategory {
  strength: "Strong" | "Moderate" | "Weak" | "Missing";
  evidence: string[];
}

interface AlignmentEntry {
  category: string;
  alignment_level: "Strong" | "Moderate" | "Weak" | "Missing";
  current_signal: string;
  perception_gap: string;
  threshold_expectation: string;
}

interface PipelineStage {
  stage: string;
  status: "PASS" | "MODERATE RISK" | "HIGH RISK";
  criteria: string[];
  explanation: string;
}

interface SignalShift {
  before: number;
  after: number;
}

export interface SignalDiagnosticData {
  jd_signal_extraction?: {
    role_identity_signals?: string[];
    strategic_signals?: string[];
    relationship_signals?: string[];
    operational_signals?: string[];
    leadership_signals?: string[];
    priority_summary?: string;
  };
  resume_signal_profile?: {
    operational_execution?: SignalCategory;
    stakeholder_coordination?: SignalCategory;
    strategic_influence?: SignalCategory;
    performance_improvement?: SignalCategory;
    domain_expertise?: SignalCategory;
  };
  signal_alignment_analysis?: AlignmentEntry[];
  hiring_pipeline_simulation?: PipelineStage[];
  executive_insight_summary?: {
    primary_insight?: string;
    primary_strength?: string;
    why_it_matters?: string;
    strategic_repositioning_opportunity?: string;
  };
  transferable_signal_detection?: {
    detected_capability?: string;
    why_it_transfers?: string;
    elevation_opportunity?: string;
  };
  signal_map?: {
    role_identity?: number;
    ownership_framing?: number;
    commercial_impact?: number;
    domain_expertise?: number;
    stakeholder_influence?: number;
    operational_execution?: number;
  };
  signal_shift_estimates?: {
    ownership_signal?: SignalShift;
    commercial_impact_signal?: SignalShift;
    role_identity_clarity?: SignalShift;
    domain_alignment?: SignalShift;
  };
  evidence_ledger?: Array<{ claim: string; source: string; evidence: string }>;
  career_signal_map?: {
    primary_alignment?: Array<{
      role: string;
      score: number;
      signals: string[];
      explanation: string;
    }>;
    secondary_alignment?: Array<{
      role: string;
      score: number;
      signals: string[];
      explanation: string;
    }>;
  };
  hiring_signal_benchmark?: {
    user_score?: number;
    median_candidate_score?: number;
    top_candidate_threshold?: number;
    dimension_comparison?: Array<{
      dimension: string;
      user_score: number;
      median_score: number;
      gap_explanation: string;
    }>;
  };
  interview_gap_diagnosis?: {
    primary_blocker?: string;
    primary_issue?: string; // legacy fallback
    what_hiring_managers_see?: string[];
    what_this_creates?: string;
    strategic_fixes?: string[];
    current_score?: number;
    predicted_score?: number;
  };
  predicted_signal_lift?: {
    dimensions?: Array<{
      dimension: string;
      lift: number;
    }>;
    current_score?: number;
    predicted_score?: number;
  };
  isPro?: boolean;
  onUpgrade?: () => void;
}

const STRENGTH_STYLES: Record<string, string> = {
  Strong: "bg-green-500/10 text-green-700 dark:text-green-400",
  Moderate: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  Weak: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  Missing: "bg-destructive/10 text-destructive",
};

const STATUS_STYLES: Record<string, string> = {
  PASS: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  "MODERATE RISK": "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
  "HIGH RISK": "bg-destructive/10 text-destructive border-destructive/20",
};

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="section-label">
    {children}
  </p>
);

const SectionSub = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs text-muted-foreground mt-1">{children}</p>
);

/* ─── MODULE 6: Executive Insight Summary ─── */
function ExecutiveInsight({ data, evidenceLedger }: { data: NonNullable<SignalDiagnosticData["executive_insight_summary"]>; evidenceLedger?: SignalDiagnosticData["evidence_ledger"] }) {
  const evidenceEntries = evidenceLedger?.filter(e => e.source === "resume").slice(0, 3).map(e => ({
    claim: e.evidence || e.claim,
    resume_snippet: e.evidence || e.claim,
    source_section: "Resume",
    confidence: "High" as const,
  }));

  // Split first sentence from the rest for typographic emphasis
  const insight = data.primary_insight || "";
  const firstSentenceMatch = insight.match(/^(.+?[.!?])\s*(.*)/s);
  const firstSentence = firstSentenceMatch ? firstSentenceMatch[1] : insight;
  const remainingText = firstSentenceMatch ? firstSentenceMatch[2] : "";

  return (
    <div className="mt-8 rounded-xl border-l-4 border-l-primary bg-card p-6 space-y-3">
      <div className="flex items-center gap-2 pb-1 border-b border-border/30 mb-1">
        <SectionLabel>Executive Insight</SectionLabel>
        <span className="text-[10px] text-muted-foreground/60 tracking-wide uppercase">Final Synthesis</span>
      </div>
      <p className="text-[15px] font-semibold text-foreground leading-relaxed tracking-[-0.01em]">{firstSentence}</p>
      {remainingText && (
        <p className="text-sm text-muted-foreground leading-relaxed">{remainingText}</p>
      )}
      {data.strategic_repositioning_opportunity && (
        <p className="text-xs text-muted-foreground pt-1">
          <span className="font-semibold text-primary">Repositioning opportunity:</span> {data.strategic_repositioning_opportunity}
        </p>
      )}
      <EvidenceLedger entries={evidenceEntries} />
    </div>
  );
}

/* ─── MODULE 1: Transferable Signal Detection ─── */
function TransferableSignal({ data, evidenceLedger }: { data: NonNullable<SignalDiagnosticData["transferable_signal_detection"]>; evidenceLedger?: SignalDiagnosticData["evidence_ledger"] }) {
  const evidenceEntries = evidenceLedger?.filter(e => e.source === "resume").slice(0, 2).map(e => ({
    claim: e.evidence || e.claim,
    resume_snippet: e.evidence || e.claim,
    source_section: "Resume",
    confidence: "Moderate" as const,
  }));

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <SectionLabel>Transferable Signal Detected</SectionLabel>
      </div>
      <p className="text-sm font-medium text-foreground">{data.detected_capability}</p>
      <div className="space-y-2 text-xs text-muted-foreground">
        <p><span className="font-semibold text-foreground">Why it transfers:</span> {data.why_it_transfers}</p>
        <p><span className="font-semibold text-primary">Elevation opportunity:</span> {data.elevation_opportunity}</p>
      </div>
      <EvidenceLedger entries={evidenceEntries} />
    </div>
  );
}

/* ─── MODULE 2: Resume Signal Profile ─── */
function ResumeSignalProfile({ data }: { data: NonNullable<SignalDiagnosticData["resume_signal_profile"]> }) {
  const categories = [
    { key: "operational_execution", label: "Operational Execution" },
    { key: "stakeholder_coordination", label: "Stakeholder Coordination" },
    { key: "strategic_influence", label: "Strategic Influence" },
    { key: "performance_improvement", label: "Performance Improvement" },
    { key: "domain_expertise", label: "Domain Expertise" },
  ] as const;

  return (
    <div className="rounded-xl border bg-card p-5 space-y-3">
      <SectionLabel>Resume Signal Profile</SectionLabel>
      <SectionSub>Your detected signal strength across five dimensions</SectionSub>
      <div className="space-y-2.5">
        {categories.map(({ key, label }) => {
          const cat = data[key];
          if (!cat) return null;
          return (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-foreground">{label}</p>
                <Badge variant="secondary" className={`text-[10px] ${STRENGTH_STYLES[cat.strength] || ""}`}>
                  {cat.strength}
                </Badge>
              </div>
              <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    cat.strength === "Strong" ? "bg-green-500 w-full" :
                    cat.strength === "Moderate" ? "bg-yellow-500 w-3/5" :
                    cat.strength === "Weak" ? "bg-orange-500 w-2/5" :
                    "bg-destructive/40 w-1/6"
                  }`}
                />
              </div>
              {cat.evidence.length > 0 && (
                <p className="text-[11px] text-muted-foreground italic pl-1">
                  {cat.evidence[0]}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── MODULE 3: JD Signal Extraction ─── */
function EmployerPrioritySignals({ data }: { data: NonNullable<SignalDiagnosticData["jd_signal_extraction"]> }) {
  const signalGroups = [
    { key: "role_identity_signals" as const, label: "Role Identity", color: "bg-primary/10 text-primary" },
    { key: "strategic_signals" as const, label: "Strategic", color: "bg-purple-500/10 text-purple-700 dark:text-purple-400" },
    { key: "relationship_signals" as const, label: "Relationship", color: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
    { key: "operational_signals" as const, label: "Operational", color: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400" },
    { key: "leadership_signals" as const, label: "Leadership", color: "bg-green-500/10 text-green-700 dark:text-green-400" },
  ];

  return (
    <div className="rounded-xl border bg-card p-5 space-y-3">
      <SectionLabel>Employer Priority Signals</SectionLabel>
      <SectionSub>What this job description actually weights</SectionSub>
      <div className="space-y-3">
        {signalGroups.map(({ key, label, color }) => {
          const signals = data[key];
          if (!signals || signals.length === 0) return null;
          return (
            <div key={key}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">{label}</p>
              <div className="flex flex-wrap gap-1.5">
                {signals.map((s, i) => (
                  <span key={i} className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${color}`}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {data.priority_summary && (
        <p className="text-xs text-muted-foreground pt-2 border-t border-border/40 leading-relaxed">{data.priority_summary}</p>
      )}
    </div>
  );
}

/* ─── MODULE 4: Signal Alignment Analysis ─── */
function SignalAlignmentAnalysis({ data }: { data: AlignmentEntry[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="rounded-xl border bg-card p-5 space-y-3">
      <SectionLabel>Signal Alignment Analysis</SectionLabel>
      <SectionSub>How your signal maps to what this role requires</SectionSub>
      <div className="space-y-2">
        {data.map((entry, i) => (
          <div key={i} className="rounded-lg border bg-background p-3 space-y-2">
            <button
              onClick={() => setExpanded(expanded === i ? null : i)}
              className="flex items-center justify-between w-full text-left"
            >
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-foreground">{entry.category}</p>
                <Badge variant="secondary" className={`text-[10px] ${STRENGTH_STYLES[entry.alignment_level] || ""}`}>
                  {entry.alignment_level}
                </Badge>
              </div>
              {expanded === i ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
            {expanded === i && (
              <div className="space-y-2 text-xs text-muted-foreground pt-1 border-t border-border/30">
                <p><span className="font-medium text-foreground">Current signal:</span> {entry.current_signal}</p>
                <p><span className="font-medium text-orange-600 dark:text-orange-400">Perception gap:</span> {entry.perception_gap}</p>
                <p><span className="font-medium text-primary">Threshold expectation:</span> {entry.threshold_expectation}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── MODULE 5: Hiring Pipeline Simulation ─── */
function HiringPipelineSimulation({ data }: { data: PipelineStage[] }) {
  return (
    <div className="rounded-xl border bg-card p-5 space-y-3">
      <SectionLabel>Hiring Pipeline Simulation</SectionLabel>
      <SectionSub>How your resume performs at each hiring stage</SectionSub>
      <div className="space-y-2.5">
        {data.map((stage, i) => (
          <div key={i} className={`rounded-lg border p-3 space-y-2 ${STATUS_STYLES[stage.status] || ""}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-muted-foreground">STAGE {i + 1}</span>
                <p className="text-xs font-semibold text-foreground">{stage.stage}</p>
              </div>
              <Badge variant="secondary" className={`text-[10px] font-bold ${STATUS_STYLES[stage.status] || ""}`}>
                {stage.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{stage.explanation}</p>
            <div className="flex flex-wrap gap-1">
              {stage.criteria.map((c, j) => (
                <span key={j} className="text-[10px] text-muted-foreground/70 bg-background rounded px-1.5 py-0.5">{c}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── MODULE 7: Score Explanation ─── */
function ScoreExplanation({ score }: { score: number }) {
  const tier = score >= 91 ? "Exceptional signal clarity" :
    score >= 71 ? "Strong alignment signal" :
    score >= 41 ? "Moderate alignment signal" :
    "Weak alignment signal";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors" aria-label="Score explanation">
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="max-w-xs p-3 space-y-2">
        <p className="text-xs font-semibold">Score: {score}% — {tier}</p>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Your signal score measures how clearly your experience communicates fit for this specific role — not how qualified you are. It reads ownership language, domain vocabulary, operational evidence, and stakeholder framing across six dimensions. The predicted score shows how much improvement is possible by repositioning your existing experience without fabricating anything new.
        </p>
        <p className="text-[10px] text-muted-foreground/70 italic">
          Signalyz never fabricates experience. It only recalibrates how your existing experience signals value.
        </p>
      </PopoverContent>
    </Popover>
  );
}

/* ─── MODULE 8: Signal Shift Visualization ─── */
function SignalShiftVisualization({ data }: { data: NonNullable<SignalDiagnosticData["signal_shift_estimates"]> }) {
  const shifts = [
    { key: "ownership_signal" as const, label: "Ownership Signal" },
    { key: "commercial_impact_signal" as const, label: "Commercial Impact" },
    { key: "role_identity_clarity" as const, label: "Role Identity Clarity" },
    { key: "domain_alignment" as const, label: "Domain Alignment" },
  ];

  return (
    <div className="rounded-xl border bg-card p-5 space-y-3">
      <SectionLabel>Signal Shift Projection</SectionLabel>
      <SectionSub>Estimated signal improvement after repositioning</SectionSub>
      <div className="space-y-3">
        {shifts.map(({ key, label }) => {
          const shift = data[key];
          if (!shift) return null;
          // Values are already on 0-100 percentage scale (independent from signal_map)
          const beforePct = shift.before;
          // Apply 95% ceiling to "after" only
          const afterPct = Math.min(shift.after, 95);
          const deltaPct = afterPct - beforePct;
          return (
            <div key={key} className="space-y-1">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 sm:gap-0">
                <p className="text-xs font-medium text-foreground">{label}</p>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground tabular-nums">{beforePct}%</span>
                  <ArrowRight className="h-3 w-3 text-primary" />
                  <span className="font-semibold text-primary tabular-nums">{afterPct}%</span>
                  {deltaPct > 0 && (
                    <span className="text-[10px] font-bold text-green-600 dark:text-green-400">+{deltaPct}</span>
                  )}
                </div>
              </div>
              <div className="relative w-full h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-muted-foreground/20 transition-all duration-700"
                  style={{ width: `${beforePct}%` }}
                />
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-700"
                  style={{ width: `${afterPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground/70 italic pt-1">
        Same experience — repositioned signal. No fabrication.
      </p>
    </div>
  );
}

/* ─── MODULE 8: Signal Map Visualization ─── */
function SignalMapVisualization({ data }: { data: NonNullable<SignalDiagnosticData["signal_map"]> }) {
  const dimensions = [
    { key: "role_identity" as const, label: "Role Identity" },
    { key: "ownership_framing" as const, label: "Ownership Framing" },
    { key: "commercial_impact" as const, label: "Commercial Impact" },
    { key: "domain_expertise" as const, label: "Domain Expertise" },
    { key: "stakeholder_influence" as const, label: "Stakeholder Influence" },
    { key: "operational_execution" as const, label: "Operational Execution" },
  ];

  // Detect the actual scale: if any score > 25, scores are on 0-100 scale already
  const maxRaw = Math.max(...dimensions.map(d => data[d.key] ?? 0));
  const isRawScale = maxRaw <= 25;

  // Always display on /100 per dimension, /600 total
  const displayMax = 100;
  const totalMax = 600;
  const toDisplay = (raw: number) => isRawScale ? Math.round((raw / 25) * 100) : raw;

  const total = dimensions.reduce((sum, d) => sum + toDisplay(data[d.key] ?? 0), 0);

  // Thresholds on /100 display scale
  const strongThreshold = displayMax * 0.8;
  const moderateThreshold = displayMax * 0.52;
  const weakThreshold = displayMax * 0.28;

  return (
    <div className="rounded-xl border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <SectionLabel>Signal Map</SectionLabel>
          <SectionSub>Your career signal strength across six dimensions</SectionSub>
        </div>
        <span className="text-lg font-bold text-foreground tabular-nums">{total}<span className="text-xs text-muted-foreground font-normal">/{totalMax}</span></span>
      </div>
      <div className="space-y-2.5">
        {dimensions.map(({ key, label }) => {
          const score = toDisplay(data[key] ?? 0);
          const pct = (score / displayMax) * 100;
          return (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-foreground">{label}</p>
                <span className="text-xs font-semibold text-muted-foreground tabular-nums">{score}/{displayMax}</span>
              </div>
              <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    score >= strongThreshold ? "bg-green-500" :
                    score >= moderateThreshold ? "bg-yellow-500" :
                    score >= weakThreshold ? "bg-orange-500" :
                    "bg-destructive/60"
                  }`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── MODULE 9: Career Signal Map ─── */
function CareerSignalMap({ data }: { data: NonNullable<SignalDiagnosticData["career_signal_map"]> }) {
  const renderRole = (item: { role: string; score: number; signals: string[]; explanation: string }, i: number) => {
    const scoreColor = item.score >= 70 ? "text-green-600 dark:text-green-400" :
      item.score >= 60 ? "text-yellow-600 dark:text-yellow-400" :
      "text-orange-600 dark:text-orange-400";

    return (
      <div key={i} className="rounded-lg border bg-background p-3.5 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-foreground">{item.role}</p>
          <span className={`text-sm font-bold tabular-nums ${scoreColor}`}>{item.score}%</span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              item.score >= 70 ? "bg-green-500" : item.score >= 60 ? "bg-yellow-500" : "bg-orange-500"
            }`}
            style={{ width: `${item.score}%` }}
          />
        </div>
        {item.signals?.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Your experience strongly signals:</p>
            <ul className="space-y-0.5">
              {item.signals.map((s, j) => (
                <li key={j} className="text-[11px] text-muted-foreground flex gap-1.5"><span>•</span>{s}</li>
              ))}
            </ul>
          </div>
        )}
        {item.explanation && (
          <p className="text-[11px] text-muted-foreground/80 leading-relaxed italic">{item.explanation}</p>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div>
        <SectionLabel>Career Signal Map</SectionLabel>
        <SectionSub>Roles your experience most strongly signals</SectionSub>
      </div>
      {data.primary_alignment && data.primary_alignment.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-primary">Primary Alignment</p>
          {data.primary_alignment.map(renderRole)}
        </div>
      )}
      {data.secondary_alignment && data.secondary_alignment.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Secondary Alignment</p>
          {data.secondary_alignment.map(renderRole)}
        </div>
      )}
    </div>
  );
}

/* ─── MODULE 10: Hiring Signal Benchmark ─── */
function HiringSignalBenchmark({ data }: { data: NonNullable<SignalDiagnosticData["hiring_signal_benchmark"]> }) {
  const rawUser = data.user_score ?? 0;
  const rawMedian = data.median_candidate_score ?? 0;
  const rawTop = data.top_candidate_threshold ?? 0;
  // Convert summary scores from /25 to /100 if on raw scale
  const isRawSummary = rawUser <= 25 && rawMedian <= 25 && rawTop <= 25;
  const userScore = isRawSummary ? Math.round((rawUser / 25) * 100) : rawUser;
  const medianScore = isRawSummary ? Math.round((rawMedian / 25) * 100) : rawMedian;
  const topThreshold = isRawSummary ? Math.round((rawTop / 25) * 100) : rawTop;

  const scoreColor = (val: number, ref: number) =>
    val >= ref ? "text-green-600 dark:text-green-400" : val >= ref - 10 ? "text-yellow-600 dark:text-yellow-400" : "text-orange-600 dark:text-orange-400";

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div>
        <SectionLabel>Hiring Signal Benchmark</SectionLabel>
        <SectionSub>How your signal compares to typical candidates for this role</SectionSub>
      </div>

      {/* Summary scores */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-lg border bg-background p-2 sm:p-3 text-center space-y-1 min-w-0">
          <p className="text-[9px] sm:text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Your Score</p>
          <p className={`text-xl sm:text-2xl font-bold tabular-nums ${scoreColor(userScore, medianScore)}`}>{userScore}</p>
        </div>
        <div className="rounded-lg border bg-background p-2 sm:p-3 text-center space-y-1 min-w-0">
          <p className="text-[9px] sm:text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Median</p>
          <p className="text-xl sm:text-2xl font-bold tabular-nums text-muted-foreground">{medianScore}</p>
        </div>
        <div className="rounded-lg border bg-background p-2 sm:p-3 text-center space-y-1 min-w-0">
          <p className="text-[9px] sm:text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Top</p>
          <p className="text-xl sm:text-2xl font-bold tabular-nums text-muted-foreground/70">{topThreshold}</p>
        </div>
      </div>

      {/* Dimension comparison */}
      {data.dimension_comparison && data.dimension_comparison.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Dimension Comparison</p>
          {data.dimension_comparison.map((dim, i) => {
            // Convert raw /25 scores to /100 scale; if already >25, assume already /100
            const isRaw = dim.user_score <= 25 && dim.median_score <= 25;
            const userDisp = isRaw ? Math.round((dim.user_score / 25) * 100) : dim.user_score;
            const medianDisp = isRaw ? Math.round((dim.median_score / 25) * 100) : dim.median_score;
            const ahead = userDisp >= medianDisp;
            return (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-foreground">{dim.dimension}</p>
                  <div className="flex items-center gap-3 text-xs tabular-nums">
                    <span className={ahead ? "font-semibold text-green-600 dark:text-green-400" : "font-semibold text-orange-600 dark:text-orange-400"}>
                      You: {userDisp}
                    </span>
                    <span className="text-muted-foreground">Median: {medianDisp}</span>
                  </div>
                </div>
                <div className="relative w-full h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-muted-foreground/20 transition-all duration-500"
                    style={{ width: `${medianDisp}%` }}
                  />
                  <div
                    className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${ahead ? "bg-green-500" : "bg-orange-500"}`}
                    style={{ width: `${userDisp}%` }}
                  />
                </div>
                {dim.gap_explanation && (
                  <p className="text-[11px] text-muted-foreground/80 leading-relaxed">{dim.gap_explanation}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── MODULE 11: Why You're Not Getting Interviews ─── */
function InterviewGapDiagnosis({ data, overrideScore, isPro, onUpgrade }: { data: NonNullable<SignalDiagnosticData["interview_gap_diagnosis"]>; overrideScore?: number; isPro?: boolean; onUpgrade?: () => void }) {
  const currentScore = overrideScore ?? data.current_score ?? 0;
  const predictedScore = data.predicted_score ?? 0;

  return (
    <div className="rounded-xl border border-orange-500/20 bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-orange-500" />
        <SectionLabel>Why You're Not Getting Interviews</SectionLabel>
      </div>

      {/* Primary Blocker, What Hiring Managers See, and What This Creates are shown in the Signal Diagnosis card above — not repeated here */}

      {/* Strategic Fixes — Pro only */}
      {isPro ? (
        data.strategic_fixes && data.strategic_fixes.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Strategic Fixes</p>
            <ol className="space-y-1">
              {data.strategic_fixes.slice(0, 3).map((fix, i) => {
                const cleanedFix = fix.replace(/^\d+\.\s*/, "");
                return (
                  <li key={i} className="text-xs text-foreground flex gap-2">
                    <span className="font-semibold text-primary tabular-nums">{i + 1}.</span>{cleanedFix}
                  </li>
                );
              })}
            </ol>
          </div>
        )
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Strategic Fixes</p>
          </div>
          <div className="space-y-1.5 pointer-events-none select-none blur-[3px] opacity-40">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-2 items-start">
                <span className="text-xs font-semibold text-primary tabular-nums">{i}.</span>
                <div className="h-3 bg-muted rounded w-full" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Predicted Signal Improvement — Pro only */}
      {currentScore > 0 && predictedScore > 0 && (
        isPro ? (
          <div className="rounded-lg border border-t-[2px] border-t-primary bg-background p-3 space-y-2">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Predicted Signal Improvement</p>
            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground">Current</p>
                <p className="text-xl font-bold text-orange-500 tabular-nums">{currentScore}%</p>
              </div>
              <ArrowRight className="h-5 w-5 text-primary" />
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground">After Calibration</p>
                <p className="text-xl font-bold text-green-600 dark:text-green-400 tabular-nums">{predictedScore}%</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border bg-background p-3 space-y-2 relative overflow-hidden">
            <div className="pointer-events-none select-none blur-[3px] opacity-40">
              <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Predicted Signal Improvement</p>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Current</p>
                  <p className="text-xl font-bold text-muted tabular-nums">—</p>
                </div>
                <ArrowRight className="h-5 w-5 text-muted" />
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">After</p>
                  <p className="text-xl font-bold text-muted tabular-nums">—</p>
                </div>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}

/* ─── MODULE 12: Predicted Signal Lift ─── */
function PredictedSignalLift({ data, overrideScore }: { data: NonNullable<SignalDiagnosticData["predicted_signal_lift"]>; overrideScore?: number }) {
  const currentScore = overrideScore ?? data.current_score ?? 0;
  const predictedScore = data.predicted_score ?? 0;
  const dims = (data.dimensions ?? [])
    .slice()
    .sort((a, b) => (b.lift ?? 0) - (a.lift ?? 0))
    .slice(0, 4);

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <SectionLabel>Predicted Signal Improvement</SectionLabel>
      <SectionSub>Estimated improvement after applying calibration suggestions</SectionSub>

      {/* Dimension lifts */}
      <div className="space-y-2">
        {dims.map((d, i) => (
          <div key={i} className="flex items-center justify-between rounded-lg border bg-background px-3 py-2">
            <p className="text-xs font-medium text-foreground">{dimensionDisplayLabel(d.dimension)}</p>
            <span className="text-xs font-bold text-green-600 dark:text-green-400 tabular-nums">+{d.lift}</span>
          </div>
        ))}
      </div>

      {/* Score projection */}
      {currentScore > 0 && predictedScore > 0 && (
        <div className="rounded-lg border border-t-[2px] border-t-primary bg-background p-3 space-y-2">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Signal Diagnosis After Calibration</p>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">Current Signal Score</p>
              <p className="text-xl font-bold text-muted-foreground tabular-nums">{currentScore}%</p>
            </div>
            <ArrowRight className="h-5 w-5 text-primary" />
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">Predicted Score</p>
              <p className="text-xl font-bold text-green-600 dark:text-green-400 tabular-nums">{predictedScore}%</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


/* ─── MAIN COMPONENT ─── */
interface SignalDiagnosticModulesProps {
  data: SignalDiagnosticData;
  matchScore: number;
}

const SignalDiagnosticModules = ({ data, matchScore }: SignalDiagnosticModulesProps) => {
  const isPro = data.isPro ?? false;
  const onUpgrade = data.onUpgrade;

  const hasAny =
    data.executive_insight_summary ||
    data.transferable_signal_detection ||
    data.resume_signal_profile ||
    data.jd_signal_extraction ||
    data.signal_alignment_analysis?.length ||
    data.hiring_pipeline_simulation?.length ||
    data.signal_shift_estimates ||
    data.signal_map ||
    data.career_signal_map ||
    data.hiring_signal_benchmark ||
    data.interview_gap_diagnosis ||
    data.predicted_signal_lift;

  if (!hasAny) return null;

  return (
    <div className="space-y-4">
      {/* Why You're Not Getting Interviews — visible to all users, but fixes/predictions gated */}
      {(data.interview_gap_diagnosis?.primary_blocker || data.interview_gap_diagnosis?.primary_issue) && (
        <InterviewGapDiagnosis data={data.interview_gap_diagnosis} overrideScore={matchScore} isPro={isPro} onUpgrade={onUpgrade} />
      )}

      {/* All remaining signal diagnostic sections — Pro only, no gate card here */}
      {isPro && (
        <>
          {data.executive_insight_summary?.primary_insight && (
            <ExecutiveInsight data={data.executive_insight_summary} evidenceLedger={data.evidence_ledger} />
          )}

          {data.transferable_signal_detection?.detected_capability && (
            <TransferableSignal data={data.transferable_signal_detection} evidenceLedger={data.evidence_ledger} />
          )}

          {data.signal_map && (
            <SignalMapVisualization data={data.signal_map} />
          )}

          {(data.resume_signal_profile || data.jd_signal_extraction) && (
            <div className="grid gap-4 lg:grid-cols-2">
              {data.resume_signal_profile && <ResumeSignalProfile data={data.resume_signal_profile} />}
              {data.jd_signal_extraction && <EmployerPrioritySignals data={data.jd_signal_extraction} />}
            </div>
          )}

          {data.career_signal_map && (data.career_signal_map.primary_alignment?.length || data.career_signal_map.secondary_alignment?.length) && (
            <CareerSignalMap data={data.career_signal_map} />
          )}

          {data.signal_alignment_analysis && data.signal_alignment_analysis.length > 0 && (
            <SignalAlignmentAnalysis data={data.signal_alignment_analysis} />
          )}

          {data.hiring_pipeline_simulation && data.hiring_pipeline_simulation.length > 0 && (
            <HiringPipelineSimulation data={data.hiring_pipeline_simulation} />
          )}

          {data.signal_shift_estimates && (
            <SignalShiftVisualization data={data.signal_shift_estimates} />
          )}

          {data.hiring_signal_benchmark && data.hiring_signal_benchmark.user_score != null && (
            <HiringSignalBenchmark data={data.hiring_signal_benchmark} />
          )}

          {data.predicted_signal_lift && (data.predicted_signal_lift.dimensions?.length || 0) > 0 && (
            <PredictedSignalLift data={data.predicted_signal_lift} overrideScore={matchScore} />
          )}
        </>
      )}
    </div>
  );
};

export { ScoreExplanation };
export default SignalDiagnosticModules;
