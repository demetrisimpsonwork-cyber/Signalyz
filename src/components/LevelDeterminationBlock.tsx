import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface LevelDeterminationBlockProps {
  score: number;
  confidenceLevel?: string;
  alignmentNotes?: string;
  gapSuggestions?: string | null;
}

// Derive current signal level from score
const deriveSignalLevel = (score: number): string => {
  if (score >= 80) return "Above Threshold";
  if (score >= 65) return "At Threshold";
  if (score >= 50) return "Approaching Threshold";
  return "Below Threshold";
};

// Derive calibration gap from score
const deriveCalibrationGap = (score: number): string => {
  if (score >= 80) return "None — Senior PM signal criteria met";
  if (score >= 65) return "Minor — marginal signal deficiencies present";
  if (score >= 50) return "Moderate — multiple threshold requirements unmet";
  return "Significant — core signal dimensions under-represented";
};

// Derive primary panel risk stage from score
const derivePanelRiskStage = (score: number): string => {
  if (score >= 80) return "Stage 1 — Recruiter Pattern Match";
  if (score >= 65) return "Stage 2 — Hiring Manager Authority Audit";
  return "Stage 3 — Executive Calibration";
};

// Parse gap_suggestions into structured deficiency entries
interface DeficiencyEntry {
  name: string;
  thresholdStatus: string;
  observedPattern: string;
  panelRisk: string;
}

const parseDeficiencies = (raw: string): DeficiencyEntry[] => {
  // Try to split on numbered list, line breaks, or semicolons
  const lines = raw
    .split(/\n|\r|;|\d+\.\s+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 20);

  return lines.slice(0, 4).map((line, i) => {
    // Classify based on keywords present
    const lower = line.toLowerCase();
    let name = "Signal Gap";
    let thresholdStatus = "Below Threshold";
    let panelRisk = "Stage 2 — Hiring Manager Authority Audit";

    if (lower.includes("owner") || lower.includes("scope")) {
      name = "Ownership Scope";
      panelRisk = "Stage 2 — Hiring Manager Authority Audit";
    } else if (lower.includes("execut") || lower.includes("leader")) {
      name = "Executive Signal";
      panelRisk = "Stage 3 — Executive Calibration";
    } else if (lower.includes("impact") || lower.includes("metric") || lower.includes("revenue") || lower.includes("result")) {
      name = "Commercial Impact";
      panelRisk = "Stage 2 — Hiring Manager Authority Audit";
    } else if (lower.includes("strateg") || lower.includes("priorit") || lower.includes("roadmap")) {
      name = "Strategic Definition";
      panelRisk = "Stage 2 — Hiring Manager Authority Audit";
    } else if (lower.includes("cross") || lower.includes("stakeholder") || lower.includes("align")) {
      name = "Cross-Functional Authority";
      panelRisk = "Stage 2 — Hiring Manager Authority Audit";
    } else if (lower.includes("keyword") || lower.includes("terminolog") || lower.includes("languag")) {
      name = "Role Vocabulary Alignment";
      thresholdStatus = "Approaching Threshold";
      panelRisk = "Stage 1 — Recruiter Pattern Match";
    } else {
      name = `Deficiency ${i + 1}`;
    }

    return {
      name,
      thresholdStatus,
      observedPattern: line.replace(/^[-•*]\s*/, ""),
      panelRisk,
    };
  });
};

const thresholdStatusStyle = (status: string) => {
  if (status === "Below Threshold") return "text-destructive bg-destructive/10";
  if (status === "Approaching Threshold") return "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/20";
  if (status === "At Threshold") return "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20";
  return "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/20";
};

const LevelDeterminationBlock = ({
  score,
  confidenceLevel,
  alignmentNotes,
  gapSuggestions,
}: LevelDeterminationBlockProps) => {
  const [copiedAll, setCopiedAll] = useState(false);

  const signalLevel = confidenceLevel || deriveSignalLevel(score);
  const calibrationGap = deriveCalibrationGap(score);
  const panelRiskStage = derivePanelRiskStage(score);

  const deficiencies = gapSuggestions ? parseDeficiencies(gapSuggestions) : [];

  const handleCopyAll = async () => {
    const text = [
      "LEVEL DETERMINATION",
      `Target Level: Senior PM`,
      `Current Signal Level: ${signalLevel}`,
      `Calibration Gap: ${calibrationGap}`,
      `Primary Panel Risk Stage: ${panelRiskStage}`,
      "",
      alignmentNotes ? `CALIBRATION SUMMARY\n${alignmentNotes}` : "",
      gapSuggestions ? `SIGNAL DEFICIENCY CLASSIFICATION\n${gapSuggestions}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    await navigator.clipboard.writeText(text);
    setCopiedAll(true);
    toast.success("Copied to clipboard", { duration: 1500 });
    setTimeout(() => setCopiedAll(false), 1500);
  };

  return (
    <div className="space-y-3">
      {/* Level Determination Block */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border/60">
          <div>
            <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
              Level Determination
            </p>
            <h3 className="text-sm font-semibold text-foreground mt-0.5">Senior PM Calibration Assessment</h3>
          </div>
          <button
            onClick={handleCopyAll}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Copy level determination"
          >
            {copiedAll ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>

        <div className="divide-y divide-border/50">
          {[
            { label: "Target Level", value: "Senior PM", emphasis: true },
            { label: "Current Signal Level", value: signalLevel, emphasis: false },
            { label: "Calibration Gap", value: calibrationGap, emphasis: false },
            { label: "Primary Panel Risk Stage", value: panelRiskStage, emphasis: false },
          ].map(({ label, value, emphasis }) => (
            <div key={label} className="flex items-start justify-between gap-4 px-4 py-3">
              <p className="text-xs text-muted-foreground shrink-0 w-40">{label}</p>
              <p className={`text-xs text-right leading-relaxed ${emphasis ? "font-semibold text-foreground" : "text-foreground"}`}>
                {value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Calibration Summary */}
      {alignmentNotes && (
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
            Calibration Summary
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">{alignmentNotes}</p>
        </div>
      )}

      {/* Signal Deficiency Classification */}
      {deficiencies.length > 0 && (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-border/60">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
              Signal Deficiency Classification
            </p>
          </div>
          <div className="divide-y divide-border/50">
            {deficiencies.map((d, i) => (
              <div key={i} className="px-4 py-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-foreground">{d.name}</p>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${thresholdStatusStyle(d.thresholdStatus)}`}>
                    {d.thresholdStatus}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
                      Observed Pattern
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{d.observedPattern}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
                      Panel Risk
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{d.panelRisk}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fallback raw text if parsing yields nothing */}
      {gapSuggestions && deficiencies.length === 0 && (
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
            Signal Deficiency Classification
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">{gapSuggestions}</p>
        </div>
      )}
    </div>
  );
};

export default LevelDeterminationBlock;
