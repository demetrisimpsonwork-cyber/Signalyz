import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DirectorDimension {
  name: string;
  classification: "Below Director Threshold" | "Near Director Threshold" | "At Director Threshold";
  strength_signal: string;
  risk_signal: string;
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
}

// ─── Style maps ───────────────────────────────────────────────────────────────

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
    <div className="px-4 pt-3.5 pb-2.5 border-b border-border/60">
      <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">{label}</p>
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

// ─── Main component ───────────────────────────────────────────────────────────

const DirectorCalibrationBlock = ({ result }: { result: DirectorCalibrationResult }) => {
  const [copied, setCopied] = useState(false);

  const { dimensions, director_signal_tier, hiring_stage_friction, pattern_detection, recalibration_directives } = result;

  const frictionStages = [
    {
      stage: "Recruiter Filter Risk",
      key: "Recruiter Filter" as const,
      data: hiring_stage_friction.recruiter_filter_risk,
    },
    {
      stage: "Hiring Manager Friction",
      key: "Hiring Manager Friction" as const,
      data: hiring_stage_friction.hiring_manager_friction,
    },
    {
      stage: "Executive Skepticism",
      key: "Executive Skepticism" as const,
      data: hiring_stage_friction.executive_skepticism,
    },
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
      ...(hiring_stage_friction.primary_friction_explanation
        ? [hiring_stage_friction.primary_friction_explanation]
        : []),
      "",
      "SIGNAL INTEGRITY ASSESSMENT",
      "Undersignaling:",
      ...pattern_detection.undersignaling_patterns.map((p) => `— ${p}`),
      "",
      "Inflation Risk:",
      ...pattern_detection.ownership_inflation_patterns.map((p) => `— ${p}`),
      "",
      ...(recalibration_directives && recalibration_directives.length > 0
        ? [
            "DIRECTOR-LEVEL RECALIBRATION DIRECTIVES",
            ...recalibration_directives.map((d, i) => `${i + 1}. ${d}`),
          ]
        : []),
    ].join("\n");

    await navigator.clipboard.writeText(lines);
    setCopied(true);
    toast.success("Calibration report copied", { duration: 1500 });
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-3">

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
            <FrictionRow
              key={s.stage}
              stage={s.stage}
              level={s.data.level}
              observation={s.data.observation}
              isPrimary={hiring_stage_friction.primary_friction_stage === s.key}
            />
          ))}
        </div>
        {hiring_stage_friction.primary_friction_explanation && (
          <div className="px-4 py-3 border-t border-border/60 bg-muted/20">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
              Primary Friction — Assessment
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {hiring_stage_friction.primary_friction_explanation}
            </p>
          </div>
        )}
      </BlockShell>

      {/* 4 — Signal Integrity Assessment */}
      <BlockShell label="Signal Integrity Assessment">
        <div className="px-4 py-3 space-y-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
              Undersignaling
            </p>
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
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
              Inflation Risk
            </p>
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

      {/* Copy */}
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
