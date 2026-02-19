import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

interface WeakAlignmentNudgeProps {
  additionalContext: string;
  onContextChange: (value: string) => void;
}

const WeakAlignmentNudge = ({ additionalContext, onContextChange }: WeakAlignmentNudgeProps) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-4 space-y-2">
      <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
        Want help strengthening this? Add more detail about tools, metrics, or frameworks below.
      </p>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
      >
        Add more context to improve alignment
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {expanded && (
        <Textarea
          placeholder="e.g. Used Jira for sprint planning, improved velocity by 20%, led 8-person team..."
          value={additionalContext}
          onChange={(e) => onContextChange(e.target.value)}
          rows={3}
          className="mt-2 text-sm"
        />
      )}
    </div>
  );
};

export default WeakAlignmentNudge;
