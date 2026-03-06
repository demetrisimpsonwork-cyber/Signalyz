import { useState } from "react";
import { Check, Lock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type StageStatus = "complete" | "active" | "locked";

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

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className="flex flex-col items-center gap-1 group focus:outline-none"
            aria-label={stage.label}
          >
            {/* circle */}
            <span
              className={`
                relative flex items-center justify-center rounded-full transition-colors
                h-7 w-7 sm:h-7 sm:w-7 h-[22px] w-[22px]
                ${isComplete ? "bg-primary text-primary-foreground" : ""}
                ${isActive ? "border-2 border-primary bg-card" : ""}
                ${isLocked ? "bg-muted text-muted-foreground" : ""}
              `}
            >
              {isComplete && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
              {isActive && (
                <span className="h-2 w-2 rounded-full bg-primary active-pulse" />
              )}
              {isLocked && <Lock className="h-3 w-3" />}
            </span>

            {/* label */}
            <span
              className={`text-[11px] leading-tight font-medium transition-colors
                ${isComplete ? "text-foreground" : ""}
                ${isActive ? "text-primary font-semibold" : ""}
                ${isLocked ? "text-muted-foreground" : ""}
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

        {isLocked && (
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
    <div className="flex-1 flex items-start pt-3.5 sm:pt-3.5 px-1">
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

/* ── main component ── */
const SignalPipelineProgress = ({
  stages,
  onStageClick,
}: SignalPipelineProgressProps) => {
  const allLocked = stages.every((s) => s.status === "locked" || s.status === "active") && !stages.some((s) => s.status === "complete");

  return (
    <div className="w-full px-4 py-2 border-b border-border">
      <div className="flex items-start justify-center max-w-md mx-auto">
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

      {allLocked && (
        <p className="text-xs text-muted-foreground text-center mt-2">
          Start with the Alignment Engine — paste your resume and job description to begin.
        </p>
      )}
    </div>
  );
};

export default SignalPipelineProgress;
