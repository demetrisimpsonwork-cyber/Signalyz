import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Info, ChevronDown, ChevronUp, ArrowRight, TrendingUp } from "lucide-react";
import EvidenceLedger from "@/components/EvidenceLedger";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground" style={{ letterSpacing: "0.15em" }}>
    {children}
  </p>
);

const SectionSub = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs text-muted-foreground mt-1">{children}</p>
);

/* ─── MODULE 6: Executive Insight Summary ─── */
function ExecutiveInsight({ data }: { data: NonNullable<SignalDiagnosticData["executive_insight_summary"]> }) {
  return (
    <div className="rounded-xl border-l-4 border-l-primary bg-card p-5 space-y-3">
      <SectionLabel>Executive Insight</SectionLabel>
      <p className="text-sm font-medium text-foreground leading-relaxed">{data.primary_insight}</p>
      <div className="space-y-2 text-xs text-muted-foreground">
        <p><span className="font-semibold text-foreground">Why this matters:</span> {data.why_it_matters}</p>
        <p><span className="font-semibold text-primary">Repositioning opportunity:</span> {data.strategic_repositioning_opportunity}</p>
      </div>
    </div>
  );
}

/* ─── MODULE 1: Transferable Signal Detection ─── */
function TransferableSignal({ data }: { data: NonNullable<SignalDiagnosticData["transferable_signal_detection"]> }) {
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
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs p-3 space-y-2">
          <p className="text-xs font-semibold">Score: {score}% — {tier}</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            This score reflects how strongly your resume communicates alignment across four dimensions: role clarity, ownership framing, commercial impact, and domain expertise.
          </p>
          <p className="text-[10px] text-muted-foreground/70 italic">
            Resumix never fabricates experience. It only recalibrates how your existing experience signals value.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
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
          const delta = shift.after - shift.before;
          return (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-foreground">{label}</p>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground tabular-nums">{shift.before}%</span>
                  <ArrowRight className="h-3 w-3 text-primary" />
                  <span className="font-semibold text-primary tabular-nums">{shift.after}%</span>
                  {delta > 0 && (
                    <span className="text-[10px] font-bold text-green-600 dark:text-green-400">+{delta}</span>
                  )}
                </div>
              </div>
              <div className="relative w-full h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-muted-foreground/20 transition-all duration-700"
                  style={{ width: `${shift.before}%` }}
                />
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-700"
                  style={{ width: `${shift.after}%` }}
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

  const total = dimensions.reduce((sum, d) => sum + (data[d.key] ?? 0), 0);

  return (
    <div className="rounded-xl border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <SectionLabel>Signal Map</SectionLabel>
          <SectionSub>Your career signal strength across six dimensions</SectionSub>
        </div>
        <span className="text-lg font-bold text-foreground tabular-nums">{total}<span className="text-xs text-muted-foreground font-normal">/150</span></span>
      </div>
      <div className="space-y-2.5">
        {dimensions.map(({ key, label }) => {
          const score = data[key] ?? 0;
          const pct = (score / 25) * 100;
          return (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-foreground">{label}</p>
                <span className="text-xs font-semibold text-muted-foreground tabular-nums">{score}/25</span>
              </div>
              <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    score >= 20 ? "bg-green-500" :
                    score >= 13 ? "bg-yellow-500" :
                    score >= 7 ? "bg-orange-500" :
                    "bg-destructive/60"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── MAIN COMPONENT ─── */
interface SignalDiagnosticModulesProps {
  data: SignalDiagnosticData;
  matchScore: number;
}

const SignalDiagnosticModules = ({ data, matchScore }: SignalDiagnosticModulesProps) => {
  const hasAny =
    data.executive_insight_summary ||
    data.transferable_signal_detection ||
    data.resume_signal_profile ||
    data.jd_signal_extraction ||
    data.signal_alignment_analysis?.length ||
    data.hiring_pipeline_simulation?.length ||
    data.signal_shift_estimates ||
    data.signal_map;

  if (!hasAny) return null;

  return (
    <div className="space-y-4">
      {/* Executive Insight — top of report */}
      {data.executive_insight_summary?.primary_insight && (
        <ExecutiveInsight data={data.executive_insight_summary} />
      )}

      {/* Transferable Signal */}
      {data.transferable_signal_detection?.detected_capability && (
        <TransferableSignal data={data.transferable_signal_detection} />
      )}

      {/* Signal Map */}
      {data.signal_map && (
        <SignalMapVisualization data={data.signal_map} />
      )}

      {/* Resume Signal Profile + Employer Priorities side by side on desktop */}
      {(data.resume_signal_profile || data.jd_signal_extraction) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.resume_signal_profile && <ResumeSignalProfile data={data.resume_signal_profile} />}
          {data.jd_signal_extraction && <EmployerPrioritySignals data={data.jd_signal_extraction} />}
        </div>
      )}

      {/* Signal Alignment Analysis */}
      {data.signal_alignment_analysis && data.signal_alignment_analysis.length > 0 && (
        <SignalAlignmentAnalysis data={data.signal_alignment_analysis} />
      )}

      {/* Hiring Pipeline Simulation */}
      {data.hiring_pipeline_simulation && data.hiring_pipeline_simulation.length > 0 && (
        <HiringPipelineSimulation data={data.hiring_pipeline_simulation} />
      )}

      {/* Signal Shift Visualization */}
      {data.signal_shift_estimates && (
        <SignalShiftVisualization data={data.signal_shift_estimates} />
      )}
    </div>
  );
};

export { ScoreExplanation };
export default SignalDiagnosticModules;
