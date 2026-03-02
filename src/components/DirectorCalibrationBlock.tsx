import { Copy, Check, Download, FileText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DirectorDimension {
  name: string;
  classification: "Below Director Threshold" | "Near Director Threshold" | "At Director Threshold";
  strength_signal: string;
  risk_signal: string;
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
}

export interface DirectorCalibrationResult {
  dimensions: DirectorDimension[];
  director_signal_tier: {
    tier: "Senior IC Signal" | "Emerging Director" | "Director-Calibrated" | "Scope Inflation Risk";
    rationale: string;
  };
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
  run_id?: string;
  pipeline_version?: string;
  _replay?: boolean;
}

// ─── Style maps ───────────────────────────────────────────────────────────────

const UPGRADE_TYPE_LABELS: Record<UpgradeType, string> = {
  commercial_injection: "Commercial Injection",
  ownership_elevation: "Ownership Elevation",
  authority_framing: "Authority Framing",
  cross_functional_leadership: "Cross-Functional Leadership",
  lifecycle_governance: "Lifecycle Governance",
  risk_compression: "Risk Compression",
};

const UPGRADE_TYPE_STYLE: Record<UpgradeType, string> = {
  commercial_injection: "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40",
  ownership_elevation: "text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/40",
  authority_framing: "text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800/40",
  cross_functional_leadership: "text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/20 border-cyan-200 dark:border-cyan-800/40",
  lifecycle_governance: "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40",
  risk_compression: "text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/40",
};

const classificationStyle: Record<DirectorDimension["classification"], string> = {
  "Below Director Threshold": "text-destructive bg-destructive/10",
  "Near Director Threshold": "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20",
  "At Director Threshold": "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/20",
};

const riskLevelStyle: Record<"Low" | "Moderate" | "Elevated", string> = {
  Low: "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/20",
  Moderate: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20",
  Elevated: "text-destructive bg-destructive/10",
};

const tierStyle: Record<DirectorCalibrationResult["director_signal_tier"]["tier"], string> = {
  "Director-Calibrated": "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/20",
  "Emerging Director": "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20",
  "Senior IC Signal": "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/20",
  "Scope Inflation Risk": "text-destructive bg-destructive/10",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const BlockShell = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="rounded-lg border bg-card overflow-hidden">
    <div className="px-5 pt-4 pb-3 border-b border-border/60">
      <p className="text-[11px] uppercase tracking-[0.15em] font-semibold text-muted-foreground">{label}</p>
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

// ─── Main component ───────────────────────────────────────────────────────────

const DirectorCalibrationBlock = ({ result }: { result: DirectorCalibrationResult }) => {
  const [copied, setCopied] = useState(false);

  const { dimensions, director_signal_tier, hiring_stage_friction, pattern_detection, recalibration_directives, signal_classifier, gap_analyzer, consistency_validator } = result;

  const frictionStages = [
    { stage: "Recruiter Filter Risk", key: "Recruiter Filter" as const, data: hiring_stage_friction.recruiter_filter_risk },
    { stage: "Hiring Manager Friction", key: "Hiring Manager Friction" as const, data: hiring_stage_friction.hiring_manager_friction },
    { stage: "Executive Skepticism", key: "Executive Skepticism" as const, data: hiring_stage_friction.executive_skepticism },
  ];

  const handleCopy = async () => {
    const lines = [
      "DIRECTOR SIGNAL CALIBRATION",
      "============================",
      "",
      "DIRECTOR SIGNAL TIER",
      `Tier: ${director_signal_tier.tier}`,
      `Rationale: ${director_signal_tier.rationale}`,
      "",
      "DIRECTOR DIMENSION CALIBRATION",
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
      ...(recalibration_directives?.length ? ["DIRECTOR-LEVEL RECALIBRATION DIRECTIVES", ...recalibration_directives.map((d, i) => `${i + 1}. ${d}`)] : []),
    ].join("\n");

    await navigator.clipboard.writeText(lines);
    setCopied(true);
    toast.success("Calibration report copied", { duration: 1500 });
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-7">
      {/* Run ID + Replay badge */}
      {result.run_id && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
          <span>Run: {result.run_id.slice(0, 8)}</span>
          {result._replay && (
            <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 font-semibold uppercase tracking-wider">
              Replay
            </span>
          )}
          {result.pipeline_version && <span>v{result.pipeline_version}</span>}
        </div>
      )}

      {/* 1 — Director Signal Tier */}
      <BlockShell label="Director Signal Tier">
        <div className="px-4 py-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-foreground">Classification</p>
            <span className={`text-[10px] font-semibold px-2.5 py-1 rounded ${tierStyle[director_signal_tier.tier]}`}>
              {director_signal_tier.tier}
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{director_signal_tier.rationale}</p>
        </div>
      </BlockShell>

      {/* 2 — Dimension Calibration */}
      <BlockShell label="Director Dimension Calibration">
        <div className="divide-y divide-border/50">
          {dimensions.map((dim) => (
            <div key={dim.name} className="px-4 py-3 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-foreground">{dim.name}</p>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded shrink-0 ${classificationStyle[dim.classification]}`}>
                  {dim.classification}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Strength</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{dim.strength_signal}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Risk</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{dim.risk_signal}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </BlockShell>

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
        <BlockShell label="Director-Level Recalibration Directives">
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
          <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">Inferred Level</p>
              <p className="text-xs font-semibold text-foreground">{signal_classifier.target_level_inferred}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">Overall Alignment</p>
              <div className="flex items-center gap-2 justify-end">
                {signal_classifier.total_score != null && (
                  <span className="text-xs font-bold tabular-nums text-foreground">{signal_classifier.total_score}/175</span>
                )}
                <p className="text-xs text-muted-foreground">{signal_classifier.overall_seniority_alignment}</p>
              </div>
            </div>
          </div>

          {/* Dimension scores */}
          <div className="divide-y divide-border/50">
            {(Object.keys(DIMENSION_LABELS) as Array<keyof SignalClassifierResult["dimension_scores"]>).map((key) => {
              const dim = signal_classifier!.dimension_scores[key];
              const pct = Math.min(100, (dim.score / 25) * 100);
              return (
                <div key={key} className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-foreground">{DIMENSION_LABELS[key]}</p>
                    <span className={`text-xs font-bold tabular-nums ${scoreColor(dim.score)}`}>
                      {dim.score}<span className="text-muted-foreground font-normal">/25</span>
                    </span>
                  </div>
                  <div className="h-1 w-full rounded-full bg-muted">
                    <div className={`h-1 rounded-full transition-all ${scoreBarColor(dim.score)}`} style={{ width: `${pct}%` }} />
                  </div>
                  {/* Rationale (new v2 field) */}
                  {dim.rationale && (
                    <p className="text-xs text-muted-foreground leading-relaxed">{dim.rationale}</p>
                  )}
                  {/* Legacy gap field fallback */}
                  {!dim.rationale && dim.gap && (
                    <p className="text-xs text-muted-foreground leading-relaxed">{dim.gap}</p>
                  )}
                  {/* Evidence quotes */}
                  {dim.evidence_quotes && dim.evidence_quotes.length > 0 && (
                    <div className="space-y-1 pt-0.5">
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Evidence</p>
                      {dim.evidence_quotes.map((q, i) => (
                        <p key={i} className="text-[11px] text-muted-foreground/80 italic leading-relaxed pl-2 border-l-2 border-border/60">
                          "{q}"
                        </p>
                      ))}
                    </div>
                  )}
                  {dim.missing.length > 0 && (
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
                    {gap}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </BlockShell>
      )}

      {/* 7 — Gap Analyzer with A/B rewrites */}
      {gap_analyzer && (
        <BlockShell label="Gap Analyzer — Upgrade Priority">
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
            {gap_analyzer.rewrite_targets.map((target, i) => (
              <div key={i} className="px-4 py-3 space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-semibold text-foreground leading-relaxed">{target.bullet_reference}</p>
                  <span className={`shrink-0 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${UPGRADE_TYPE_STYLE[target.upgrade_type]}`}>
                    {UPGRADE_TYPE_LABELS[target.upgrade_type]}
                  </span>
                </div>
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
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Rewritten</p>
                    <p className="text-xs text-foreground leading-relaxed">{target.rewritten_bullet}</p>
                  </div>
                ) : null}
              </div>
            ))}
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
                  Changes ({result.export_builder.changes_diff.length})
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
                      <p className="text-[10px] text-muted-foreground/70 pl-4">Gap fixed: {diff.gap_fixed}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Download / Copy buttons */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(result.export_builder!.final_resume_text);
                  toast.success("ATS resume copied to clipboard", { duration: 1500 });
                }}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-muted-foreground border border-border/60 transition-colors hover:bg-secondary hover:text-foreground"
              >
                <FileText className="h-3 w-3" />
                Copy Resume
              </button>
              <button
                onClick={() => {
                  const blob = new Blob([result.export_builder!.final_resume_text], { type: "text/plain" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "resume-calibrated.txt";
                  a.click();
                  URL.revokeObjectURL(url);
                  toast.success("Download started", { duration: 1500 });
                }}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-muted-foreground border border-border/60 transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Download className="h-3 w-3" />
                Download .txt
              </button>
            </div>
          </div>
        </BlockShell>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-muted-foreground border border-border/60 transition-colors hover:bg-secondary hover:text-foreground"
        >
          {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          Copy Calibration Report
        </button>
      </div>
    </div>
  );
};

export default DirectorCalibrationBlock;
