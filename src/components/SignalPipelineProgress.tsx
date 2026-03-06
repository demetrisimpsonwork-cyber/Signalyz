import { useState } from "react";
import { Check, Lock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type StageStatus = "complete" | "active" | "locked" | "pending";

export interface PipelineStage {
  id: string;
  label: string;
  shortLabel: string;
  sublabel: string;
  status: StageStatus;
  completedAt: Date | null;
  lockedReason?: string;
}

interface SignalPipelineProgressProps {
  stages: PipelineStage[];
  onStageClick: (stageId: string) => void;
  activeStageId?: string;
}

/* ── stage node ── */
function StageNode({
  stage,
  onClick,
}: {
  stage: PipelineStage;
  onClick: () => void;
}) {
  const isComplete = stage.status === "complete";
  const isActive = stage.status === "active";
  const isLocked = stage.status === "locked";
  const isPending = stage.status === "pending";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className="flex flex-col items-center gap-1.5 group focus:outline-none"
            aria-label={stage.label}
          >
            {/* circle */}
            <span
              className={`
                relative flex items-center justify-center rounded-full transition-colors
                h-9 w-9 sm:h-9 sm:w-9
                ${isComplete ? "bg-primary text-primary-foreground shadow-sm" : ""}
                ${isActive ? "border-2 border-primary bg-card shadow-sm" : ""}
                ${isPending ? "border border-border bg-muted/40" : ""}
                ${isLocked ? "bg-muted text-muted-foreground" : ""}
              `}
            >
              {isComplete && <Check className="h-4 w-4" strokeWidth={3} />}
              {isActive && (
                <span className="h-2.5 w-2.5 rounded-full bg-primary active-pulse" />
              )}
              {isPending && (
                <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
              )}
              {isLocked && <Lock className="h-3.5 w-3.5" />}
            </span>

            {/* label */}
            <span
              className={`text-xs leading-tight transition-colors
                ${isComplete ? "text-foreground font-semibold" : ""}
                ${isActive ? "text-primary font-bold" : ""}
                ${isPending ? "text-muted-foreground/60 font-medium" : ""}
                ${isLocked ? "text-muted-foreground font-medium" : ""}
              `}
            >
              <span className="hidden sm:inline">{stage.label}</span>
              <span className="sm:hidden">{stage.shortLabel}</span>
            </span>

            {/* sublabel / timestamp */}
            <span className="text-[10px] text-muted-foreground hidden sm:block leading-tight">
              {isComplete && stage.completedAt
                ? formatDistanceToNow(stage.completedAt, { addSuffix: true })
                : stage.sublabel}
            </span>
          </button>
        </TooltipTrigger>

        {(isLocked || isPending) && (
          <TooltipContent
            side="bottom"
            className="bg-foreground text-background text-xs rounded-full px-3 py-1"
          >
            {stage.lockedReason || "Complete the previous stage first"}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

/* ── connector line ── */
function StageConnector({ filled }: { filled: boolean }) {
  return (
    <div className="flex-1 flex items-start pt-[18px] px-1">
      <div
        className={`
          h-[1.5px] sm:h-[1.5px] w-full rounded-full transition-colors duration-500
          ${filled ? "bg-primary" : "bg-border border-dashed"}
        `}
        style={!filled ? { backgroundImage: "repeating-linear-gradient(90deg, hsl(var(--border)) 0 4px, transparent 4px 8px)", backgroundColor: "transparent", height: "1.5px" } : {}}
      />
    </div>
  );
}

/* ── dynamic instructional copy ── */
function getInstructionalCopy(stages: PipelineStage[], activeStageId?: string): string | null {
  const allLocked = stages.every((s) => s.status === "locked" || s.status === "active") && !stages.some((s) => s.status === "complete");
  if (allLocked) return "Paste your resume and job description to begin your signal analysis.";

  // Use activeStageId (current tab) to determine copy
  if (activeStageId === "report" || activeStageId === "director") {
    const reportStage = stages.find((s) => s.id === "report");
    if (reportStage?.status === "complete") return "Your Signal Positioning Report is ready. Review your full diagnosis below.";
    if (reportStage?.status === "active") return "Your Signal Positioning Report is ready. Review your full diagnosis below.";
  }
  if (activeStageId === "resume" || activeStageId === "calibrated") {
    return "Generate your Calibrated Resume from your signal map.";
  }
  // Default: alignment active
  const alignmentStage = stages.find((s) => s.id === "alignment");
  if (alignmentStage?.status === "active") return "Paste your resume and job description to begin your signal analysis.";
  return null;
}

/* ── main component ── */
const SignalPipelineProgress = ({
  stages,
  onStageClick,
  activeStageId,
}: SignalPipelineProgressProps) => {
  const copy = getInstructionalCopy(stages, activeStageId);

  return (
    <div className="w-full px-4 py-3 border-b border-border">
      <div className="flex items-start justify-center max-w-lg mx-auto">
        {stages.map((stage, i) => (
          <div key={stage.id} className="contents">
            <StageNode
              stage={stage}
              onClick={() => {
                if (stage.status !== "locked") onStageClick(stage.id);
              }}
            />
            {i < stages.length - 1 && (
              <StageConnector filled={stage.status === "complete"} />
            )}

          </div>
        ))}
      </div>

      {copy && (
        <p className="text-xs text-muted-foreground text-center mt-2">
          {copy}
        </p>
      )}
    </div>
  );
};

export default SignalPipelineProgress;
