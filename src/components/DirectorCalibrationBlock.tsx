import { Copy, Check, Download, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { GroundedRecommendation, GroundedRecommendationInsights } from "@/lib/groundedRecommendationTypes";
import { GroundedNextStepsPanel } from "@/components/GroundedNextStepsPanel";
import { resolveHiringReportRoleLabel } from "@/lib/hiringReportRoleLabel";
import {
  applyHiringReportIntegrityGate,
  normalizeAtomicGapLabel,
  HIRING_REPORT_TRUST_COPY,
} from "@signalyz/hiringReportIntegrity";
import {
  isDegradedHiringReportResponse,
  sanitizeHiringReportResponseForRender,
} from "@/lib/hiringReportResponseSanitizer";
import { ReportFeedbackPanel } from "@/components/ReportFeedbackPanel";
import type { PlanTier } from "@/lib/analytics";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DirectorEvidenceOverlay {
  evidence_id: string;
  content: string;
  section: string;
  company: string;
  role_title: string;
  similarity: number;
}

export interface DirectorDimension {
  name: string;
  classification: "Below Director Threshold" | "Near Director Threshold" | "At Director Threshold";
  strength_signal: string;
  risk_signal: string;
  /** RAG-grounded strength narrative when indexed resume evidence is available. */
  grounded_strength_narrative?: string;
  supporting_evidence?: DirectorEvidenceOverlay[];
  evidence_confidence?: "high" | "low" | "none";
}

export type UpgradeType =
  | "commercial_injection"
  | "ownership_elevation"
  | "authority_framing"
  | "cross_functional_leadership"
  | "lifecycle_governance"
  | "risk_compression";

export interface GapAnalyzerResult {
  priority_order: string[];
  rewrite_targets: Array<{
    bullet_reference: string;
    upgrade_type: UpgradeType;
    reason: string;
    version_a?: string | null;
    version_b?: string | null;
    chooser_line?: string | null;
    rewritten_bullet?: string | null;
  }>;
}

export interface ConsistencyValidatorResult {
  status: "pass" | "revise";
  issues: string[];
}

export interface SignalDimensionScore {
  score: number;
  gap: string;
  gap_label?: string;
  evidence_quotes?: string[];
  rationale?: string;
  missing: string[];
  grounded_rationale?: string;
  supporting_evidence?: DirectorEvidenceOverlay[];
  evidence_confidence?: "high" | "low" | "none";
}

export interface SignalClassifierResult {
  target_level_inferred: string;
  dimension_scores: {
    commercial: SignalDimensionScore;
    ownership: SignalDimensionScore;
    authority: SignalDimensionScore;
    cross_functional: SignalDimensionScore;
    lifecycle: SignalDimensionScore;
    risk: SignalDimensionScore;
    narrative: SignalDimensionScore;
  };
  overall_seniority_alignment: string;
  total_score?: number;
  top_3_gaps: string[];
}

export interface ExportBuilderResult {
  final_resume_text: string;
  changes_diff: Array<{
    original_bullet: string;
    revised_bullet: string;
    gap_fixed: string;
  }>;
  rejected_changes?: Array<{
    original_bullet: string;
    revised_bullet: string;
    gap_fixed: string;
    rejection_reason: string;
  }>;
}

export interface DirectorCalibrationResult {
  dimensions: DirectorDimension[];
  director_signal_tier: {
    tier: string;
    rationale: string;
    grounded_rationale?: string;
    supporting_evidence?: DirectorEvidenceOverlay[];
    evidence_confidence?: "high" | "low" | "none";
  };
  _detected_role_tier?: string;
  _role_tier_label?: string;
  hiring_stage_friction: {
    recruiter_filter_risk: { level: "Low" | "Moderate" | "Elevated"; observation: string };
    hiring_manager_friction: { level: "Low" | "Moderate" | "Elevated"; observation: string };
    executive_skepticism: { level: "Low" | "Moderate" | "Elevated"; observation: string };
    primary_friction_stage: "Recruiter Filter" | "Hiring Manager Friction" | "Executive Skepticism";
    primary_friction_explanation?: string;
  };
  pattern_detection: {
    undersignaling_patterns: string[];
    ownership_inflation_patterns: string[];
  };
  recalibration_directives?: string[];
  signal_classifier?: SignalClassifierResult | null;
  gap_analyzer?: GapAnalyzerResult | null;
  consistency_validator?: ConsistencyValidatorResult | null;
  export_builder?: ExportBuilderResult | null;
  grounded_recommendations?: GroundedRecommendation[];
  grounded_recommendation_insights?: GroundedRecommendationInsights;
  run_id?: string;
  pipeline_version?: string;
  _replay?: boolean;
  /** Patch 1 pipeline metadata — optional, display-only */
  _pipeline_degraded?: boolean;
  _report_completeness_pct?: number;
  _omitted_sections?: string[];
  _calibration_status?: string;
}

// ─── Label humanizer ──────────────────────────────────────────────────────────

/** Known internal labels → plain English. Falls back to auto-converting snake_case. */
const KNOWN_LABELS: Record<string, string> = {
  // Gap labels (from GAP_LABEL_ENUM)
  no_commercial_attribution: "No commercial impact attribution",
  limited_ownership_scope: "Limited ownership scope",
  weak_decision_authority: "Weak decision authority signal",
  missing_cross_functional_leadership: "Missing cross-functional leadership",
  incomplete_lifecycle_governance: "Incomplete lifecycle governance",
  absent_risk_framing: "Risk framing absent",
  fragmented_narrative: "Fragmented career narrative",
  // Upgrade types
  commercial_injection: "Commercial Impact",
  ownership_elevation: "Ownership Elevation",
  authority_framing: "Authority Framing",
  cross_functional_leadership: "Cross-Functional Leadership",
  lifecycle_governance: "Lifecycle Governance",
  risk_compression: "Risk Compression",
};

function humanizeLabel(raw: string): string {
  if (!raw) return raw;
  const atomic = normalizeAtomicGapLabel(raw);
  const known = KNOWN_LABELS[atomic];
  if (known) return known;
  // Auto-convert snake_case / kebab-case to Title Case
  if (/[_-]/.test(raw)) {
    return raw
      .replace(/[_-]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return raw;
}

// ─── Style maps ───────────────────────────────────────────────────────────────

const UPGRADE_TYPE_LABELS: Record<UpgradeType, string> = {
  commercial_injection: "Commercial Impact",
  ownership_elevation: "Ownership Elevation",
  authority_framing: "Authority Framing",
  cross_functional_leadership: "Cross-Functional Leadership",
  lifecycle_governance: "Lifecycle Governance",
  risk_compression: "Risk Compression",
};

const classificationStyle: Record<GroundedRecommendation["classification"], string> = {
  present: "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800/40",
  partial: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40",
  missing: "text-muted-foreground bg-muted/30 border-border/60",
};

const DEFAULT_UPGRADE_STYLE =
  "text-muted-foreground bg-muted/30 border-border/60";

function upgradeTypeStyle(upgradeType: string | undefined): string {
  if (!upgradeType) return DEFAULT_UPGRADE_STYLE;
  return UPGRADE_TYPE_STYLE[upgradeType as UpgradeType] ?? DEFAULT_UPGRADE_STYLE;
}

function upgradeTypeLabel(upgradeType: string | undefined): string {
  if (!upgradeType) return "Upgrade";
  return UPGRADE_TYPE_LABELS[upgradeType as UpgradeType] ?? humanizeLabel(upgradeType);
}

function recommendationClassificationStyle(
  classification: GroundedRecommendation["classification"] | string | undefined,
): string {
  if (classification === "present" || classification === "partial" || classification === "missing") {
    return classificationStyle[classification];
  }
  return classificationStyle.missing;
}

const UPGRADE_TYPE_STYLE: Record<UpgradeType, string> = {
  commercial_injection: "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40",
  ownership_elevation: "text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/40",
  authority_framing: "text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800/40",
  cross_functional_leadership: "text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/20 border-cyan-200 dark:border-cyan-800/40",
  lifecycle_governance: "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40",
  risk_compression: "text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/40",
};

/** Plain-English display for "Below/Near/At {Role} Threshold" labels. */
function humanizeThreshold(classification: string): string {
  if (/^Below/i.test(classification)) return "Below target";
  if (/^Near/i.test(classification)) return "Approaching target";
  if (/^At/i.test(classification)) return "At target";
  if (/^Above/i.test(classification)) return "Above target";
  return classification;
}

/** Dynamic classification style — matches "Below X Threshold", "Near X Threshold", "At X Threshold" */
function classificationStyleFor(classification: string): string {
  if (classification.startsWith("Below")) return "text-destructive bg-destructive/10 border border-destructive/20";
  if (classification.startsWith("Near")) return "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-700/40";
  if (classification.startsWith("At")) return "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/20 border border-green-300 dark:border-green-700/40";
  return "text-muted-foreground bg-muted/30 border border-border/60";
}

const riskLevelStyle: Record<"Low" | "Moderate" | "Elevated", string> = {
  Low: "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/20",
  Moderate: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20",
  Elevated: "text-destructive bg-destructive/10",
};

/** Dynamic tier style — matches keywords in tier string */
function tierStyleFor(tier: string): string {
  if (/Calibrated/i.test(tier)) return "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/20";
  if (/Emerging/i.test(tier)) return "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20";
  if (/Signal$/i.test(tier) || /IC|Contributor|Manager Signal/i.test(tier)) return "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/20";
  if (/Inflation/i.test(tier)) return "text-destructive bg-destructive/10";
  return "text-muted-foreground bg-muted/30";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const BlockShell = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="rounded-lg border bg-card overflow-hidden min-w-0 w-full">
    <div className="px-5 pt-5 pb-3 border-b border-border/60">
      <p className="subsection-label text-foreground/80 font-bold">{label}</p>
    </div>
    {children}
  </div>
);

const FrictionRow = ({
  stage,
  level,
  observation,
  isPrimary,
}: {
  stage: string;
  level: "Low" | "Moderate" | "Elevated";
  observation: string;
  isPrimary: boolean;
}) => (
  <div className={`px-4 py-3 space-y-1.5 ${isPrimary ? "bg-muted/30" : ""}`}>
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold text-foreground">{stage}</p>
        {isPrimary && (
          <span className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-foreground/8 text-muted-foreground border border-border/60">
            Primary
          </span>
        )}
      </div>
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded shrink-0 ${riskLevelStyle[level]}`}>
        {level}
      </span>
    </div>
    <p className="text-xs text-muted-foreground leading-relaxed">{observation}</p>
  </div>
);

const DIMENSION_LABELS: Record<keyof SignalClassifierResult["dimension_scores"], string> = {
  commercial: "Commercial Impact Attribution",
  ownership: "End-to-End Ownership Scope",
  authority: "Decision Authority",
  cross_functional: "Cross-Functional Leadership",
  lifecycle: "Lifecycle Governance",
  risk: "Risk Compression",
  narrative: "Narrative Cohesion",
};

const scoreColor = (score: number) => {
  if (score >= 18) return "text-green-700 dark:text-green-400";
  if (score >= 10) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
};

const scoreBarColor = (score: number) => {
  if (score >= 18) return "bg-green-500 dark:bg-green-400";
  if (score >= 10) return "bg-amber-500 dark:bg-amber-400";
  return "bg-destructive";
};

// ─── Normalizer: ensures all arrays/nested fields exist ───────────────────────

function normalizeResult(raw: DirectorCalibrationResult): DirectorCalibrationResult {
  const dims = Array.isArray(raw.dimensions) ? raw.dimensions : [];
  const pd = raw.pattern_detection ?? { undersignaling_patterns: [], ownership_inflation_patterns: [] };
  const hsf = raw.hiring_stage_friction ?? {
    recruiter_filter_risk: { level: "Low" as const, observation: "Not evaluated" },
    hiring_manager_friction: { level: "Low" as const, observation: "Not evaluated" },
    executive_skepticism: { level: "Low" as const, observation: "Not evaluated" },
    primary_friction_stage: "Recruiter Filter" as const,
  };

  // Normalize signal_classifier dimension scores
  let sc = raw.signal_classifier ?? null;
  if (sc?.dimension_scores) {
    const keys = ["commercial", "ownership", "authority", "cross_functional", "lifecycle", "risk", "narrative"] as const;
    const scores = { ...sc.dimension_scores };
    for (const k of keys) {
      if (!scores[k]) {
        scores[k] = { score: 0, gap: "", missing: [] };
      } else {
        scores[k] = {
          ...scores[k],
          missing: Array.isArray(scores[k].missing) ? scores[k].missing : [],
          evidence_quotes: Array.isArray(scores[k].evidence_quotes) ? scores[k].evidence_quotes : [],
        };
      }
    }
    sc = {
      ...sc,
      dimension_scores: scores,
      top_3_gaps: Array.isArray(sc.top_3_gaps) ? sc.top_3_gaps : [],
    };
  }

  // Normalize gap_analyzer
  let ga = raw.gap_analyzer ?? null;
  if (ga) {
    ga = {
      ...ga,
      priority_order: Array.isArray(ga.priority_order) ? ga.priority_order : [],
      rewrite_targets: Array.isArray(ga.rewrite_targets) ? ga.rewrite_targets : [],
    };
  }

  return {
    ...raw,
    dimensions: dims,
    director_signal_tier: raw.director_signal_tier ?? { tier: "Senior IC Signal", rationale: "Unable to determine tier." },
    hiring_stage_friction: hsf,
    pattern_detection: {
      undersignaling_patterns: Array.isArray(pd.undersignaling_patterns) ? pd.undersignaling_patterns : [],
      ownership_inflation_patterns: Array.isArray(pd.ownership_inflation_patterns) ? pd.ownership_inflation_patterns : [],
    },
    recalibration_directives: Array.isArray(raw.recalibration_directives) ? raw.recalibration_directives : [],
    signal_classifier: sc,
    gap_analyzer: ga,
    consistency_validator: raw.consistency_validator ?? null,
    export_builder: raw.export_builder ?? null,
  };
}

// ─── Main component ───────────────────────────────────────────────────────────

const DirectorCalibrationBlock = ({
  result: rawResult,
  isPro = true,
  onUpgrade,
  isAuthenticated = true,
  targetRoleTitle,
  resumeText = "",
  jdText = "",
  requestId,
  reportRunFingerprint,
  planTier,
}: {
  result: DirectorCalibrationResult;
  isPro?: boolean;
  onUpgrade?: () => void;
  isAuthenticated?: boolean;
  targetRoleTitle?: string | null;
  resumeText?: string;
  jdText?: string;
  requestId?: string;
  reportRunFingerprint?: string;
  planTier?: PlanTier;
}) => {
  const [copied, setCopied] = useState(false);

  const result = useMemo(() => {
    const sanitized = sanitizeHiringReportResponseForRender(rawResult);
    const normalized = normalizeResult(sanitized);
    return applyHiringReportIntegrityGate(normalized, resumeText, jdText);
  }, [rawResult, resumeText, jdText]);

  const pipelineMetadata = useMemo(
    () => ({
      pipeline_version: result.pipeline_version,
      _pipeline_degraded: result._pipeline_degraded,
      _report_completeness_pct: result._report_completeness_pct,
      _omitted_sections: result._omitted_sections,
      _calibration_status: result._calibration_status,
    }),
    [result],
  );
  const showDegradedNotice = isDegradedHiringReportResponse(pipelineMetadata);

  // Log debug info to console only — never render to DOM
  if (result.run_id) {
    console.log(`[Signal Report] Run: ${result.run_id} v${result.pipeline_version || "?"} ${result._replay ? "(replay)" : ""}`);
  }

  const { dimensions, director_signal_tier, hiring_stage_friction, pattern_detection, recalibration_directives, signal_classifier, gap_analyzer, consistency_validator, grounded_recommendations, grounded_recommendation_insights } = result;

  // Dynamic role tier label — neutral for non-leadership targets (CSR, specialist, etc.)
  const roleLabel = resolveHiringReportRoleLabel(result._role_tier_label, targetRoleTitle);

  const frictionStages = [
    { stage: "Recruiter Filter Risk", key: "Recruiter Filter" as const, data: hiring_stage_friction.recruiter_filter_risk },
    { stage: "Hiring Manager Friction", key: "Hiring Manager Friction" as const, data: hiring_stage_friction.hiring_manager_friction },
    { stage: "Executive Skepticism", key: "Executive Skepticism" as const, data: hiring_stage_friction.executive_skepticism },
  ];

  const handleCopy = async () => {
    const lines = [
      `${roleLabel.toUpperCase()} SIGNAL CALIBRATION`,
      "============================",
      "",
      `${roleLabel.toUpperCase()} SIGNAL TIER`,
      `Tier: ${director_signal_tier.tier}`,
      `Rationale: ${director_signal_tier.rationale}`,
      "",
      `${roleLabel.toUpperCase()} DIMENSION CALIBRATION`,
      ...dimensions.flatMap((d) => [
        `${d.name}: ${d.classification}`,
        `  Strength — ${d.strength_signal}`,
        `  Risk     — ${d.risk_signal}`,
        "",
      ]),
      "HIRING STAGE RISK MAPPING",
      ...frictionStages.map((s) => `${s.stage}: ${s.data.level} — ${s.data.observation}`),
      `Primary Friction Stage: ${hiring_stage_friction.primary_friction_stage}`,
      ...(hiring_stage_friction.primary_friction_explanation ? [hiring_stage_friction.primary_friction_explanation] : []),
      "",
      "SIGNAL INTEGRITY ASSESSMENT",
      "Undersignaling:",
      ...pattern_detection.undersignaling_patterns.map((p) => `— ${p}`),
      "",
      "Inflation Risk:",
      ...pattern_detection.ownership_inflation_patterns.map((p) => `— ${p}`),
      "",
      ...(recalibration_directives?.length ? [`${roleLabel.toUpperCase()}-LEVEL RECALIBRATION DIRECTIVES`, ...recalibration_directives.map((d, i) => `${i + 1}. ${d}`)] : []),
    ].join("\n");

    await navigator.clipboard.writeText(lines);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-10 w-full min-w-0 overflow-hidden">
      {showDegradedNotice && (
        <div className="rounded-lg border border-amber-300/60 bg-amber-50/80 dark:bg-amber-950/20 px-4 py-3 space-y-1">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
            Partial report
            {typeof pipelineMetadata._report_completeness_pct === "number"
              ? ` (${pipelineMetadata._report_completeness_pct}% complete)`
              : ""}
          </p>
          {pipelineMetadata._omitted_sections && pipelineMetadata._omitted_sections.length > 0 && (
            <p className="text-[11px] text-amber-900/80 dark:text-amber-200/80 leading-relaxed">
              Omitted sections: {pipelineMetadata._omitted_sections.join(", ")}
            </p>
          )}
        </div>
      )}

      {/* Debug info logged to console only */}

      {/* 1 — Signal Tier */}
      <BlockShell label={`${roleLabel} Signal Tier`}>
        <div className="px-4 py-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-foreground">Classification</p>
            <span className={`text-[10px] font-semibold px-2.5 py-1 rounded ${tierStyleFor(director_signal_tier.tier)}`}>
              {director_signal_tier.tier}
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {director_signal_tier.grounded_rationale ?? director_signal_tier.rationale}
          </p>
        </div>
      </BlockShell>

      {(grounded_recommendation_insights || (grounded_recommendations && grounded_recommendations.length > 0)) && (
        <BlockShell label="Evidence-Based Next Steps">
          {grounded_recommendation_insights ? (
            <GroundedNextStepsPanel insights={grounded_recommendation_insights} />
          ) : (
            <div className="divide-y divide-border/50">
              {grounded_recommendations!.map((rec, index) => (
                <div key={`${rec.signal_name}-${index}`} className="px-4 py-4 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold text-foreground">{rec.signal_name}</p>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded border uppercase ${recommendationClassificationStyle(rec.classification)}`}
                    >
                      {rec.classification}
                    </span>
                    {!rec.grounded && (
                      <span className="text-[10px] text-muted-foreground">Unverified</span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground">{rec.classification_reason}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{rec.recommendation}</p>
                  {Array.isArray(rec.evidence_used) && rec.evidence_used.length > 0 && (
                    <div className="space-y-1 pt-1">
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                        Evidence
                      </p>
                      {rec.evidence_used.map((snippet, i) => (
                        <p
                          key={i}
                          className="text-[10px] text-muted-foreground/80 italic leading-relaxed pl-3 border-l-2 border-primary/40"
                        >
                          "{snippet}"
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </BlockShell>
      )}

      {/* 2 — Perception Snapshot (visible to all users) */}
      <BlockShell label={`${roleLabel} Dimension Calibration`}>
        <div className="divide-y divide-border/50">
          {dimensions.map((dim) => (
            <div key={dim.name} className="px-3 sm:px-4 py-4 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-3">
                <p className="text-xs font-semibold text-foreground break-words min-w-0">{dim.name}</p>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded shrink-0 self-start sm:self-auto whitespace-nowrap ${classificationStyleFor(dim.classification)}`}>
                  {humanizeThreshold(dim.classification)}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Strength</p>
                  <p className="text-xs text-muted-foreground leading-relaxed break-words">
                    {dim.grounded_strength_narrative ?? dim.strength_signal}
                  </p>
                  {dim.grounded_strength_narrative && dim.evidence_confidence === "low" && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 leading-relaxed">
                      Limited indexed resume evidence — narrative stays conservative.
                    </p>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Risk</p>
                  <p className="text-xs text-muted-foreground leading-relaxed break-words">{dim.risk_signal}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </BlockShell>

      {/* Gate: everything below Perception Snapshot is hidden for free users */}
      {!isPro ? (
        <div className="rounded-lg border border-border bg-card p-8">
          <div className="text-center space-y-5 max-w-sm mx-auto">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <span className="text-2xl text-primary">✦</span>
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-foreground tracking-tight">
                Your hiring friction points are mapped — here's exactly where your signal is breaking down
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                You've seen the surface-level read. The full report shows where you'll be screened out at each hiring stage — and the exact repositioning to fix it.
              </p>
            </div>
            {isAuthenticated ? (
              <div className="space-y-3">
                <Button onClick={onUpgrade} className="w-full gap-2" size="lg">
                  Unlock Full Signal Intelligence →
                </Button>
                
              </div>
            ) : (
              <Button className="w-full gap-2" size="lg" asChild>
                <a href="/auth">Get Started Free</a>
              </Button>
            )}
          </div>
        </div>
      ) : (
      <>

      {/* 3 — Hiring Stage Risk Mapping */}
      <BlockShell label="Hiring Stage Risk Mapping">
        <div className="divide-y divide-border/50">
          {frictionStages.map((s) => (
            <FrictionRow key={s.stage} stage={s.stage} level={s.data.level} observation={s.data.observation} isPrimary={hiring_stage_friction.primary_friction_stage === s.key} />
          ))}
        </div>
        {hiring_stage_friction.primary_friction_explanation && (
          <div className="px-4 py-3 border-t border-border/60 bg-muted/20">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Primary Friction — Assessment</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{hiring_stage_friction.primary_friction_explanation}</p>
          </div>
        )}
      </BlockShell>

      {/* 4 — Signal Integrity Assessment */}
      <BlockShell label="Signal Integrity Assessment">
        <div className="px-4 py-3 space-y-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Undersignaling</p>
            <ul className="space-y-1.5">
              {pattern_detection.undersignaling_patterns.map((p, i) => (
                <li key={i} className="flex gap-2 text-xs text-muted-foreground leading-relaxed">
                  <span className="shrink-0 mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-500" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Inflation Risk</p>
            <ul className="space-y-1.5">
              {pattern_detection.ownership_inflation_patterns.map((p, i) => (
                <li key={i} className="flex gap-2 text-xs text-muted-foreground leading-relaxed">
                  <span className="shrink-0 mt-1.5 h-1.5 w-1.5 rounded-full bg-destructive" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </BlockShell>

      {/* 5 — Recalibration Directives */}
      {recalibration_directives && recalibration_directives.length > 0 && (
        <BlockShell label={`${roleLabel}-Level Recalibration Directives`}>
          <div className="divide-y divide-border/50">
            {recalibration_directives.map((directive, i) => (
              <div key={i} className="px-4 py-3 flex gap-3">
                <span className="shrink-0 mt-0.5 text-[10px] font-bold text-muted-foreground/60 w-4">{i + 1}.</span>
                <p className="text-xs text-foreground leading-relaxed">{directive}</p>
              </div>
            ))}
          </div>
        </BlockShell>
      )}

      {/* 6 — Signal Classifier */}
      {signal_classifier && (
        <BlockShell label="Signal Classifier — Seniority Scoring">
          {/* Header */}
           <div className="px-4 py-3 border-b border-border/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">Inferred Level</p>
              <p className="text-xs font-semibold text-foreground break-words">{signal_classifier.target_level_inferred}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">Overall Alignment</p>
              <div className="flex items-center gap-2 sm:justify-end flex-wrap">
                {signal_classifier.total_score != null && (
                  <span className="text-xs font-bold tabular-nums text-foreground">{signal_classifier.total_score}/175</span>
                )}
                <p className="text-xs text-muted-foreground break-words">{signal_classifier.overall_seniority_alignment}</p>
              </div>
            </div>
          </div>

          {/* Dimension scores */}
          <div className="divide-y divide-border/50">
            {(Object.keys(DIMENSION_LABELS) as Array<keyof SignalClassifierResult["dimension_scores"]>).map((key) => {
              const dim = signal_classifier!.dimension_scores[key];
              if (!dim) return null;
              const score = typeof dim.score === "number" && Number.isFinite(dim.score) ? dim.score : 0;
              const pct = Math.min(100, (score / 25) * 100);
              return (
                <div key={key} className="px-4 py-4 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-foreground">{DIMENSION_LABELS[key]}</p>
                    <span className={`text-xs font-bold tabular-nums ${scoreColor(score)}`}>
                      {score}<span className="text-muted-foreground font-normal">/25</span>
                    </span>
                  </div>
                  <div className="h-1 w-full rounded-full bg-muted">
                    <div className={`h-1 rounded-full transition-all ${scoreBarColor(score)}`} style={{ width: `${pct}%` }} />
                  </div>
                  {/* Rationale (new v2 field) */}
                  {(dim.grounded_rationale || dim.rationale) && (
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {dim.grounded_rationale ?? dim.rationale}
                    </p>
                  )}
                  {/* Legacy gap field fallback */}
                  {!dim.grounded_rationale && !dim.rationale && dim.gap && (
                    <p className="text-xs text-muted-foreground leading-relaxed">{dim.gap}</p>
                  )}
                  {dim.grounded_rationale && dim.evidence_confidence === "low" && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 leading-relaxed">
                      Limited indexed resume evidence — narrative stays conservative.
                    </p>
                  )}
                  {/* Evidence quotes */}
                  {dim.evidence_quotes && dim.evidence_quotes.length > 0 && (
                    <div className="space-y-1.5 pt-1 ml-1">
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Evidence</p>
                      {dim.evidence_quotes.map((q, i) => (
                        <p key={i} className="text-[10px] text-muted-foreground/80 italic leading-relaxed pl-3 border-l-2 border-primary/40">
                          "{q}"
                        </p>
                      ))}
                    </div>
                  )}
                  {Array.isArray(dim.missing) && dim.missing.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {dim.missing.map((m, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded border border-border/60 text-muted-foreground bg-muted/40">{m}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Top 3 gaps */}
          {signal_classifier.top_3_gaps.length > 0 && (
            <div className="px-4 py-3 border-t border-border/60 bg-muted/20">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Top Gaps</p>
              <ol className="space-y-1.5">
                {signal_classifier.top_3_gaps.map((gap, i) => (
                  <li key={i} className="flex gap-2 text-xs text-muted-foreground leading-relaxed">
                    <span className="shrink-0 font-semibold text-foreground/60">{i + 1}.</span>
                    {humanizeLabel(gap)}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </BlockShell>
      )}

      {/* 7 — Gap Analyzer with A/B rewrites */}
      {gap_analyzer && (
        <BlockShell label="Calibrated Bullets — Upgrade Priority">
          {gap_analyzer.priority_order.length > 0 && (
            <div className="px-4 py-3 border-b border-border/60">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Remediation Priority Order</p>
              <div className="flex flex-wrap gap-1.5">
                {gap_analyzer.priority_order.map((dim, i) => (
                  <span key={dim} className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-border/60 bg-muted/40 text-muted-foreground">
                    <span className="font-bold text-foreground/50">{i + 1}</span>
                    {dim.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="divide-y divide-border/50">
            {(() => {
              const SECTION_HEADER_RX = /^(PROFESSIONAL\s+(EXPERIENCE|SUMMARY)|CORE\s+COMPETENCIES|EDUCATION|SKILLS|CERTIFICATIONS|WORK\s+HISTORY)/im;

              const extractParsedBullets = (ref: string): Array<{ bullet: string; context: string }> => {
                const lines = ref.split("\n").map(l => l.trim()).filter(Boolean);
                const extractedBullets: Array<{ bullet: string; context: string }> = [];
                let currentContext = "";

                for (const line of lines) {
                  if (SECTION_HEADER_RX.test(line)) {
                    currentContext = "";
                    continue;
                  }
                  const dateRx = /(\d{4})\s*[-–—]\s*(present|current|\d{4})/i;
                  if (dateRx.test(line)) {
                    currentContext = line.replace(dateRx, "").replace(/[|—–,]\s*$/, "").trim();
                    continue;
                  }
                  if (/^[-•▪►]/.test(line) || (line.length > 40 && /^[A-Z]/.test(line) && !SECTION_HEADER_RX.test(line))) {
                    const cleanBullet = line.replace(/^[-•▪►]\s*/, "");
                    if (cleanBullet.length > 30) {
                      extractedBullets.push({ bullet: cleanBullet, context: currentContext });
                    }
                  }
                }

                return extractedBullets
                  .sort((a, b) => b.bullet.length - a.bullet.length)
                  .slice(0, 5);
              };

              // One rewrite target = one card. Never fan out the same A/B rewrite across parsed bullets.
              const processedTargets = gap_analyzer.rewrite_targets.map((target) => {
                const ref = target.bullet_reference || "";
                const isFullResume = ref.length > 500 && SECTION_HEADER_RX.test(ref);
                if (!isFullResume) return target;

                const parsedBullets = extractParsedBullets(ref);
                return {
                  ...target,
                  bullet_reference: parsedBullets[0]?.bullet || ref.slice(0, 280) + (ref.length > 280 ? "…" : ""),
                  _contextLabel: parsedBullets[0]?.context || undefined,
                  _relatedBullets: parsedBullets.slice(1).map((b) => b.bullet),
                  _fullResumeSource: true,
                };
              });

              return processedTargets.map((target: any, i: number) => (
                <div key={i} className="px-4 py-3 space-y-2.5">
                  {target._fullResumeSource && (
                    <p className="text-[11px] text-muted-foreground leading-relaxed rounded-md border border-border/50 bg-muted/20 px-3 py-2">
                      This rewrite target applies to your strongest experience signal. Related bullets from your resume are listed for context — each has its own rewrite in the Calibrated Resume tab.
                    </p>
                  )}
                  {target._contextLabel && (
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/60">{target._contextLabel}</p>
                  )}
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
                    <div className="space-y-1 flex-1 min-w-0">
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Original Bullet</p>
                      <p className="text-xs text-foreground leading-relaxed break-words">{target.bullet_reference}</p>
                    </div>
                    <span className={`shrink-0 self-start text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${upgradeTypeStyle(target.upgrade_type)}`}>
                      {upgradeTypeLabel(target.upgrade_type)}
                    </span>
                  </div>

                  {Array.isArray(target._relatedBullets) && target._relatedBullets.length > 0 && (
                    <div className="space-y-1.5 rounded-md border border-dashed border-border/60 bg-muted/10 px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Related experience bullets (context only)</p>
                      <ul className="space-y-1.5">
                        {target._relatedBullets.map((b: string, j: number) => (
                          <li key={j} className="text-xs text-muted-foreground leading-relaxed">• {b}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground leading-relaxed">{target.reason}</p>

                  {/* A/B Rewrites */}
                  {(target.version_a || target.version_b) ? (
                    <div className="space-y-2">
                      {target.version_a && (
                        <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2.5 space-y-1">
                          <p className="text-[10px] uppercase tracking-wider font-semibold text-emerald-600 dark:text-emerald-400">
                            A — Upper-bound Truth
                          </p>
                          <p className="text-xs text-foreground leading-relaxed">{target.version_a}</p>
                        </div>
                      )}
                      {target.version_b && (
                        <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2.5 space-y-1">
                          <p className="text-[10px] uppercase tracking-wider font-semibold text-blue-600 dark:text-blue-400">
                            B — Conservative Truth
                          </p>
                          <p className="text-xs text-foreground leading-relaxed">{target.version_b}</p>
                        </div>
                      )}
                      {target.chooser_line && (
                        <p className="text-[11px] text-muted-foreground/70 italic leading-relaxed pl-3 border-l-2 border-border/40">
                          {target.chooser_line}
                        </p>
                      )}
                    </div>
                  ) : target.rewritten_bullet ? (
                    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2.5 space-y-1">
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Calibrated</p>
                      <p className="text-xs text-foreground leading-relaxed">{target.rewritten_bullet}</p>
                    </div>
                  ) : (target as { validator_status?: string; rejection_reason?: string }).validator_status === "rejected" ? (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 space-y-1">
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-destructive/80">Rejected — needs source confirmation</p>
                      <p className="text-[10px] text-destructive/90">{(target as { rejection_reason?: string }).rejection_reason}</p>
                    </div>
                  ) : null}
                </div>
              ));
            })()}
          </div>
        </BlockShell>
      )}

      {/* 8 — Consistency Validator */}
      {consistency_validator && (
        <BlockShell label="Consistency Validator">
          <div className="px-4 py-3 space-y-3">
            <div className="flex items-center gap-3">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded ${
                consistency_validator.status === "pass"
                  ? "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/20"
                  : "text-destructive bg-destructive/10"
              }`}>
                {consistency_validator.status === "pass" ? "✓ Pass" : "⚠ Revise"}
              </span>
              <p className="text-xs text-muted-foreground">
                {consistency_validator.status === "pass"
                  ? "No material consistency issues detected."
                  : `${consistency_validator.issues.length} issue${consistency_validator.issues.length !== 1 ? "s" : ""} flagged.`}
              </p>
            </div>
            {consistency_validator.issues.length > 0 && (
              <ul className="space-y-2">
                {consistency_validator.issues.map((issue, i) => (
                  <li key={i} className="flex gap-2.5 text-xs text-muted-foreground leading-relaxed">
                    <span className="shrink-0 mt-1.5 h-1.5 w-1.5 rounded-full bg-destructive" />
                    {issue}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </BlockShell>
      )}

      {/* 9 — Export Builder */}
      {result.export_builder && (
        <BlockShell label="Export Builder — ATS Resume">
          <div className="px-4 py-3 space-y-4">
            {/* Changes diff */}
            {result.export_builder.changes_diff.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  Approved changes ({result.export_builder.changes_diff.length})
                </p>
                <div className="space-y-2">
                  {result.export_builder.changes_diff.map((diff, i) => (
                    <div key={i} className="rounded-md border border-border/60 bg-muted/20 px-3 py-2.5 space-y-1.5">
                      <div className="flex items-start gap-2">
                        <span className="shrink-0 text-[10px] font-semibold text-destructive mt-0.5">−</span>
                        <p className="text-xs text-muted-foreground leading-relaxed line-through">{diff.original_bullet}</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="shrink-0 text-[10px] font-semibold text-green-600 dark:text-green-400 mt-0.5">+</span>
                        <p className="text-xs text-foreground leading-relaxed">{diff.revised_bullet}</p>
                      </div>
                      <p className="text-[10px] text-muted-foreground/70 pl-4">Gap fixed: {humanizeLabel(diff.gap_fixed)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(result.export_builder.rejected_changes?.length ?? 0) > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-destructive/80">
                  Rejected — needs source confirmation ({result.export_builder.rejected_changes!.length})
                </p>
                <div className="space-y-2">
                  {result.export_builder.rejected_changes!.map((diff, i) => (
                    <div key={`rej-${i}`} className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 space-y-1.5">
                      <p className="text-[10px] text-destructive/90 font-medium">{diff.rejection_reason}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed line-through">{diff.original_bullet}</p>
                      <p className="text-xs text-foreground/70 leading-relaxed">{diff.revised_bullet}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Copy button only — no .txt download */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(result.export_builder!.final_resume_text);
                  toast.success("Copied to clipboard");
                }}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-muted-foreground border border-border/60 transition-colors hover:bg-secondary hover:text-foreground"
              >
                <FileText className="h-3 w-3" />
                Copy Resume
              </button>
            </div>
          </div>
        </BlockShell>
      )}

      {/* Conversion CTA / Pro confirmation */}
      {!isPro ? (
        <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-6 text-center space-y-3">
          <h3 className="text-sm font-bold text-foreground">Your diagnosis is complete. Now reposition.</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Your calibrated resume, repositioned bullets, and cover letter are built from this exact analysis.
          </p>
          <button
            onClick={() => onUpgrade?.()}
            className="inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold text-white transition-transform hover:scale-[1.03] active:scale-[0.97]"
            style={{ backgroundColor: "hsl(174, 62%, 47%)" }}
          >
            <span>✦</span> Unlock Full Signal Intelligence →
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center">
          Your calibrated assets are ready in the Resume and Letter tabs.
        </p>
      )}

      <p className="text-[11px] text-muted-foreground/80 text-center leading-relaxed px-2">
        {HIRING_REPORT_TRUST_COPY}
      </p>

      <ReportFeedbackPanel
        source="hiring_report"
        requestId={requestId}
        reportRunFingerprint={reportRunFingerprint}
        pipelineVersion={result.pipeline_version}
        planTier={planTier}
      />

      <div className="flex justify-end">
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-muted-foreground border border-border/60 transition-colors hover:bg-secondary hover:text-foreground"
        >
          {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          Copy Calibration Report
        </button>
      </div>
      </>
      )}
    </div>
  );
};

export default DirectorCalibrationBlock;
