import { Copy, Check, Lock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface LevelDeterminationBlockProps {
  score: number;
  confidenceLevel?: string;
  alignmentNotes?: string;
  gapSuggestions?: string | null;
  inferredRoleTitle?: string;
  isPro?: boolean;
  isAuthenticated?: boolean;
  onUpgrade?: () => void;
}

// ─── Role Level Detection ────────────────────────────────────────────────────
type RoleLevel = "supervisor" | "manager" | "director" | "executive";

const detectRoleLevel = (roleTitle: string): RoleLevel => {
  const lower = roleTitle.toLowerCase();
  const supervisorPatterns = /\b(supervisor|team\s*lead|shift\s*lead|crew\s*lead|floor\s*lead|group\s*lead|coordinator|associate\s*manager|assistant\s*manager|foreman|foreperson)\b/;
  const directorPatterns = /\b(director|vp|vice\s*president|svp|evp|chief|head\s+of|c-suite|cto|cfo|coo|ceo|cmo|cio)\b/;
  const executivePatterns = /\b(vp|vice\s*president|svp|evp|chief|c-suite|cto|cfo|coo|ceo|cmo|cio)\b/;

  if (executivePatterns.test(lower)) return "executive";
  if (directorPatterns.test(lower)) return "director";
  if (supervisorPatterns.test(lower)) return "supervisor";
  return "manager";
};

// Inference helpers

const deriveInferenceConfidence = (score: number): "High" | "Moderate" | "Low" => {
  if (score >= 75) return "High";
  if (score >= 55) return "Moderate";
  return "Low";
};

const deriveCurrentSignalLevel = (score: number): string => {
  if (score >= 80) return "Above Threshold";
  if (score >= 65) return "At Threshold";
  if (score >= 50) return "Approaching Threshold";
  return "Below Threshold";
};

const deriveTierGap = (score: number, roleTitle: string): string => {
  if (score >= 80) return `None — ${roleTitle} signal criteria met`;
  if (score >= 65) return "Marginal — signal deficiencies present in secondary dimensions";
  if (score >= 50) return "One Tier — threshold requirements unmet across core dimensions";
  return "Two or More Tiers — core signal dimensions under-represented";
};

const deriveClassificationConfidence = (score: number): string => {
  if (score >= 75) return "High — signal pattern is consistent and sufficient for classification";
  if (score >= 55) return "Moderate — classification is structurally supported; some dimension variance";
  return "Low — insufficient signal density; classification is provisional";
};

const deriveOwnershipVerdict = (score: number, confidence: "High" | "Moderate" | "Low", roleTitle: string): string => {
  if (confidence === "High") {
    if (score >= 80) return `Candidate demonstrates end-to-end ownership consistent with ${roleTitle} threshold. Signal is unambiguous.`;
    return `Candidate signal falls below ${roleTitle} threshold. Ownership scope is insufficient for this classification.`;
  }
  if (confidence === "Moderate") {
    if (score >= 65) return `Candidate signal is broadly consistent with ${roleTitle} threshold, though secondary dimensions require reinforcement.`;
    return `Candidate signal does not yet satisfy ${roleTitle} threshold requirements. Key ownership dimensions remain under-represented.`;
  }
  if (score >= 50) return `Available signal suggests partial alignment with ${roleTitle} standards. Classification may shift with additional evidence.`;
  return `Signal density is insufficient to confirm ${roleTitle} calibration. Current evidence indicates threshold deficiency.`;
};

const extractPrimaryDeficiency = (raw: string, roleLevel: RoleLevel): { name: string; status: string; pattern: string; panelRisk: string } | null => {
  const lines = raw
    .split(/\n|\r|;|\\d+\\.\\s+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 20);

  if (lines.length === 0) return null;

  const line = lines[0];
  const lower = line.toLowerCase();

  const isSupervisor = roleLevel === "supervisor";

  let name = isSupervisor ? "Team Leadership Signal" : "Leadership Signal";
  let status = "Below Threshold";
  let panelRisk = isSupervisor ? "Stage 3 — Team & Operations Panel Review" : "Stage 3 — Cross-Functional Panel Stress Test";

  if (lower.includes("owner") || lower.includes("scope")) {
    name = "Ownership Scope";
    panelRisk = "Stage 2 — Hiring Manager Ownership Audit";
  } else if (lower.includes("team") || lower.includes("supervis") || lower.includes("lead")) {
    name = isSupervisor ? "Team Leadership Signal" : "Leadership Signal";
    panelRisk = isSupervisor ? "Stage 3 — Team & Operations Panel Review" : "Stage 3 — Cross-Functional Panel Stress Test";
  } else if (lower.includes("execut") || lower.includes("leader")) {
    name = isSupervisor ? "Supervisory Evidence" : "Executive Signal";
    panelRisk = isSupervisor ? "Stage 3 — Team & Operations Panel Review" : "Stage 4 — Executive Strategy Calibration";
  } else if (lower.includes("impact") || lower.includes("metric") || lower.includes("revenue") || lower.includes("result")) {
    name = "Commercial Impact";
    panelRisk = "Stage 2 — Hiring Manager Ownership Audit";
  } else if (lower.includes("strateg") || lower.includes("priorit") || lower.includes("roadmap")) {
    name = isSupervisor ? "Process Ownership" : "Strategic Definition";
    panelRisk = isSupervisor ? "Stage 3 — Team & Operations Panel Review" : "Stage 4 — Executive Strategy Calibration";
  } else if (lower.includes("cross") || lower.includes("stakeholder") || lower.includes("align")) {
    name = "Cross-Functional Authority";
    panelRisk = isSupervisor ? "Stage 3 — Team & Operations Panel Review" : "Stage 3 — Cross-Functional Panel Stress Test";
  } else if (lower.includes("keyword") || lower.includes("terminolog") || lower.includes("languag")) {
    name = "Role Vocabulary Alignment";
    status = "Approaching Threshold";
    panelRisk = "Stage 1 — Recruiter Signal Filter";
  }

  return { name, status, pattern: line.replace(/^[-•*]\s*/, ""), panelRisk };
};

const deriveStrategicPriority = (score: number, deficiencyName: string | null, roleTitle: string): string => {
  if (deficiencyName === "Ownership Scope" || score < 50) {
    return `${roleTitle} threshold requires explicit end-to-end ownership language — scope, lifecycle, and decision authority must be stated, not implied.`;
  }
  if (deficiencyName === "Commercial Impact") {
    return `${roleTitle} threshold requires quantified business outcomes directly tied to decisions. Revenue, retention, or adoption impact must appear with attribution.`;
  }
  if (deficiencyName === "Strategic Definition") {
    return `${roleTitle} threshold requires evidence of problem framing and prioritization logic — sequencing must reflect strategic rationale, not task enumeration.`;
  }
  if (deficiencyName === "Cross-Functional Authority") {
    return `${roleTitle} threshold requires cross-functional influence at a decision-making level. Collaboration language must be replaced with alignment ownership and negotiation evidence.`;
  }
  if (deficiencyName === "Executive Signal") {
    return `${roleTitle} threshold requires executive-facing communication signals — strategic reporting, narrative ownership, or executive alignment must be present.`;
  }
  if (deficiencyName === "Team Leadership Signal" || deficiencyName === "Supervisory Evidence") {
    return `${roleTitle} threshold requires team coordination evidence — shift management, direct report oversight, and operational decision-making must be present.`;
  }
  if (deficiencyName === "Process Ownership") {
    return `${roleTitle} threshold requires evidence of process ownership — workflow design, scheduling authority, and operational improvement must be demonstrated.`;
  }
  if (score >= 80) {
    return `Signal pattern meets ${roleTitle} threshold. Maintain current positioning framework and reinforce commercial attribution in all quantitative claims.`;
  }
  return `${roleTitle} threshold requires stronger ownership and impact language throughout. Current signal pattern registers as execution-level contribution rather than strategic authorship.`;
};

const deriveSupervisorStrategicPriority = (score: number, deficiencyName: string | null, roleTitle: string): string => {
  if (deficiencyName === "Ownership Scope" || score < 50) {
    return `${roleTitle} threshold requires explicit team coordination and process ownership language — shift management, scheduling, and daily operational decisions must be stated.`;
  }
  if (deficiencyName === "Commercial Impact") {
    return `${roleTitle} threshold requires measurable operational outcomes — customer satisfaction scores, team productivity metrics, or shrink/waste reduction must appear with attribution.`;
  }
  if (score >= 80) {
    return `Signal pattern meets ${roleTitle} threshold. Maintain current operational leadership framing and reinforce team performance outcomes.`;
  }
  return `${roleTitle} threshold requires stronger team leadership and operational execution language. Current signal pattern registers as individual contributor rather than team-level ownership.`;
};

interface FunnelStage {
  stage: string;
  label: string;
  risk: "Low" | "Moderate" | "High" | "Critical";
  note: string;
}

const deriveFunnelStages = (score: number, roleLevel: RoleLevel): FunnelStage[] => {
  const isAbove = score >= 80;
  const isAt = score >= 65;
  const isApproaching = score >= 50;

  const isSupervisor = roleLevel === "supervisor";

  return [
    { stage: "Stage 1", label: "Recruiter Signal Filter", risk: isAt ? "Low" : isApproaching ? "Moderate" : "High", note: isAt ? "Role vocabulary and keyword density meet recruiter pattern threshold." : isApproaching ? "Keyword alignment is partial. Role-specific terminology may not surface in automated screening." : "Signal vocabulary insufficient. Resume may not pass initial recruiter or ATS filter." },
    { stage: "Stage 2", label: "Hiring Manager Ownership Audit", risk: isAbove ? "Low" : isAt ? "Moderate" : "High", note: isAbove ? "Ownership signals are explicit and consistent with target role classification." : isAt ? "Ownership language is present but may not fully distinguish from IC-level contribution." : "Ownership scope is under-represented. Hiring managers may classify candidate as execution-level." },
    { stage: "Stage 3", label: isSupervisor ? "Team & Operations Panel Review" : "Cross-Functional Panel Stress Test", risk: isAbove ? "Low" : isAt ? "Moderate" : isApproaching ? "High" : "Critical", note: isAbove ? (isSupervisor ? "Team coordination and operational leadership signals are sufficient for review." : "Cross-functional authority signals are sufficient for panel evaluation.") : isAt ? (isSupervisor ? "Team leadership language is present but daily operational ownership is not clearly evidenced." : "Cross-functional language is present but decision-making authority is not clearly evidenced.") : (isSupervisor ? "Candidate may face questions about team coordination scope. Operational leadership signals are weak." : "Candidate is likely to face authority challenges from panel. Stakeholder influence signals are absent.") },
    { stage: "Stage 4", label: isSupervisor ? "Senior Reviewer Check" : "Executive Strategy Calibration", risk: isSupervisor ? (isAbove ? "Low" : isAt ? "Low" : isApproaching ? "Moderate" : "High") : (isAbove ? "Low" : isAt ? "Moderate" : "Critical"), note: isSupervisor ? (isAbove ? "Operational leadership and customer-facing signals are present and consistent." : isAt ? "Team management signals are present but process ownership could be strengthened." : isApproaching ? "Some team coordination evidence exists but daily operational leadership is under-represented." : "Team leadership signals are insufficient. Regional or area reviewer may question supervisory readiness.") : (isAbove ? "Strategic framing and executive-facing signals are present and consistent." : isAt ? "Strategic language is detectable but lacks sufficient executive-level evidence." : "No executive strategy signals detected. Candidate may fail calibration at senior review.") },
    { stage: "Stage 5", label: "Offer-Level Risk Check", risk: isAbove ? "Low" : isAt ? "Low" : isApproaching ? "Moderate" : "High", note: isAbove ? "Candidate signal supports offer-level confidence. No terminal risk factors identified." : isAt ? "Minor signal gaps present but unlikely to introduce offer-level risk." : isApproaching ? "Moderate risk — compensation or leveling expectations may misalign at offer stage." : "Candidate positioning may create leveling or compensation misalignment at offer." },
  ];
};

// Solid risk badge styles
const riskBadgeStyles: Record<FunnelStage["risk"], string> = {
  Low: "bg-green-600 text-white",
  Moderate: "bg-amber-500 text-white",
  High: "bg-orange-500 text-white animate-pulse-soft",
  Critical: "bg-red-600 text-white animate-pulse-soft",
};

const riskBarStyles: Record<FunnelStage["risk"], string> = {
  Low: "bg-green-500",
  Moderate: "bg-amber-500",
  High: "bg-orange-500",
  Critical: "bg-destructive",
};

const thresholdStatusStyle = (status: string) => {
  if (status === "Below Threshold") return "bg-red-600 text-white";
  if (status === "Approaching Threshold") return "bg-orange-500 text-white";
  if (status === "At Threshold") return "bg-amber-500 text-white";
  return "bg-green-600 text-white";
};

const BlockShell = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="rounded-lg border bg-card overflow-hidden">
    <div className="px-5 pt-5 pb-3 border-b border-border/60">
      <p className="text-[11px] uppercase tracking-[0.15em] font-semibold text-muted-foreground">{label}</p>
    </div>
    {children}
  </div>
);

const Row = ({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) => (
  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-4 px-5 py-3">
    <p className="text-xs text-muted-foreground shrink-0 sm:w-44">{label}</p>
    <p className={`text-xs sm:text-right leading-relaxed text-foreground break-words min-w-0 ${mono ? "font-medium" : ""}`}>{value}</p>
  </div>
);

const LevelDeterminationBlock = ({
  score,
  confidenceLevel,
  alignmentNotes,
  gapSuggestions,
  inferredRoleTitle,
  isPro = true,
  isAuthenticated = true,
  onUpgrade,
}: LevelDeterminationBlockProps) => {
  const [copiedAll, setCopiedAll] = useState(false);

  const roleTitle = inferredRoleTitle || "Target Role";
  const roleLevel = detectRoleLevel(roleTitle);

  const inferenceConfidence = deriveInferenceConfidence(score);
  const signalLevel = confidenceLevel || deriveCurrentSignalLevel(score);
  const tierGap = deriveTierGap(score, roleTitle);
  const classificationConfidence = deriveClassificationConfidence(score);
  const ownershipVerdict = deriveOwnershipVerdict(score, inferenceConfidence, roleTitle);

  const primaryDeficiency = gapSuggestions ? extractPrimaryDeficiency(gapSuggestions, roleLevel) : null;
  const strategicPriority = roleLevel === "supervisor"
    ? deriveSupervisorStrategicPriority(score, primaryDeficiency?.name ?? null, roleTitle)
    : deriveStrategicPriority(score, primaryDeficiency?.name ?? null, roleTitle);
  const funnelStages = deriveFunnelStages(score, roleLevel);

  const handleCopyAll = async () => {
    const topGap = primaryDeficiency?.name || "None identified";
    const primaryStrengthText = score >= 65
      ? `Signal pattern meets ${roleTitle} threshold across primary dimensions.`
      : `Partial alignment with ${roleTitle} threshold detected.`;
    const repositioning = strategicPriority;

    const working: string[] = [];
    const missing: string[] = [];
    funnelStages.forEach((s) => {
      if (s.risk === "Low") working.push(`${s.label} — ${s.note}`);
      else missing.push(`${s.label} (${s.risk}) — ${s.note}`);
    });

    const fixes: string[] = [];
    if (primaryDeficiency) fixes.push(`Address ${primaryDeficiency.name}: ${primaryDeficiency.pattern}`);
    if (tierGap && !tierGap.startsWith("None")) fixes.push(`Close tier gap: ${tierGap}`);
    fixes.push(strategicPriority);

    const predicted = score >= 80
      ? "Signal already meets threshold. Maintain current positioning."
      : `Addressing top gaps could move signal from ${signalLevel} toward At Threshold or above.`;

    const lines = [
      `SIGNAL DIAGNOSIS: ${score}% — ${signalLevel}`,
      "",
      "TOP GAP",
      topGap,
      "",
      "PRIMARY STRENGTH",
      primaryStrengthText,
      "",
      "REPOSITIONING OPPORTUNITY",
      repositioning,
      "",
      "WHAT'S WORKING",
      ...(working.length > 0 ? working.map(w => `- ${w}`) : ["- None identified"]),
      "",
      "WHAT'S MISSING",
      ...(missing.length > 0 ? missing.map(m => `- ${m}`) : ["- None identified"]),
      "",
      "THREE STRATEGIC FIXES",
      ...fixes.slice(0, 3).map((f, i) => `${i + 1}. ${f}`),
      "",
      "PREDICTED SIGNAL IMPROVEMENT",
      predicted,
    ].join("\n");

    await navigator.clipboard.writeText(lines);
    setCopiedAll(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedAll(false), 1500);
  };

  return (
    <div className="space-y-7">
      {isPro ? (
        <>
          {/* 1 — Target Role Calibration */}
          <BlockShell label="Target Role Calibration">
            <div className="divide-y divide-border/50">
              <Row label="Inferred Target Level" value={roleTitle} mono />
              <Row label="Inference Confidence" value={inferenceConfidence} />
              <Row label="Benchmark Applied" value={`${roleTitle} Threshold Standard`} />
            </div>
          </BlockShell>

          {/* 2 — Ownership Classification */}
          <BlockShell label="Ownership Classification">
            <div className="divide-y divide-border/50">
              <Row label="Current Signal Level" value={signalLevel} />
              <Row label="Tier Gap" value={tierGap} />
              <Row label="Classification Confidence" value={classificationConfidence} />
            </div>
            <div className="px-5 py-3.5 border-t border-border/60 bg-muted/20">
              <p className="text-[11px] uppercase tracking-[0.15em] font-semibold text-muted-foreground mb-1">Verdict</p>
              <p className="text-xs text-foreground leading-relaxed">{ownershipVerdict}</p>
            </div>
          </BlockShell>

          {/* 3 — Primary Deficiency */}
          {primaryDeficiency && (
            <BlockShell label="Primary Deficiency">
              <div className="px-5 py-3.5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-foreground">{primaryDeficiency.name}</p>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${thresholdStatusStyle(primaryDeficiency.status)}`}>
                    {primaryDeficiency.status}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.15em] font-semibold text-muted-foreground mb-1">Observed Pattern</p>
                    <p className="text-xs text-muted-foreground leading-relaxed break-words">{primaryDeficiency.pattern}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.15em] font-semibold text-muted-foreground mb-1">Panel Risk</p>
                    <p className="text-xs text-muted-foreground leading-relaxed break-words">{primaryDeficiency.panelRisk}</p>
                  </div>
                </div>
              </div>
            </BlockShell>
          )}

          {/* 4 — Signal Risk Projection */}
          <BlockShell label="Signal Risk Projection">
            <div className="divide-y divide-border/50">
              {funnelStages.map((s) => (
                <div key={s.stage} className="px-5 py-3.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] text-muted-foreground font-medium">{s.stage}</p>
                      <p className="text-xs font-semibold text-foreground">{s.label}</p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2.5 py-1 rounded shrink-0 ${riskBadgeStyles[s.risk]}`}>
                      {s.risk}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{s.note}</p>
                </div>
              ))}
            </div>
          </BlockShell>

          {/* 5 — Strategic Upgrade Priority */}
          <BlockShell label="Strategic Upgrade Priority">
            <div className="px-5 py-3.5">
              <p className="text-xs text-foreground leading-relaxed">{strategicPriority}</p>
            </div>
          </BlockShell>

          {/* Copy all */}
          <div className="flex justify-end">
            <button
              onClick={handleCopyAll}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-muted-foreground border border-border/60 transition-colors hover:bg-secondary hover:text-foreground"
            >
              {copiedAll ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
              Copy Calibration Report
            </button>
          </div>
        </>
      ) : (
        /* Single locked card for free/unauthenticated users */
        <div className="rounded-lg border border-border bg-card p-5 text-center space-y-3">
          <Lock className="h-5 w-5 text-muted-foreground mx-auto" />
          <p className="text-sm font-semibold text-foreground">Unlock Signal Calibration Report — Full Signal Intelligence</p>
          <p className="text-xs text-muted-foreground">Target Role Calibration, Ownership Classification, Signal Risk Projection, and Strategic Upgrade Priority.</p>
          {isAuthenticated ? (
            onUpgrade && <Button onClick={onUpgrade} size="sm">See My Exact Fix</Button>
          ) : (
            <Button size="sm" asChild><a href="/auth">Unlock Your Fix → Free</a></Button>
          )}
        </div>
      )}
    </div>
  );
};

export default LevelDeterminationBlock;
