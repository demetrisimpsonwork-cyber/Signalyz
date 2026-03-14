import { useState } from "react";
import { ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface WeakAlignmentNudgeProps {
  additionalContext: string;
  onContextChange: (value: string) => void;
  onRerun?: () => void;
}

const WeakAlignmentNudge = ({ additionalContext, onContextChange, onRerun }: WeakAlignmentNudgeProps) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ backgroundColor: '#f9f9f9', border: '1px solid #e5e5e5', borderRadius: '8px', padding: '16px', marginTop: '16px' }} className="space-y-2">
      <p className="text-xs text-foreground/70 font-medium">
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
        <div className="space-y-2 mt-2">
          <Textarea
            placeholder="e.g. Used Jira for sprint planning, improved velocity by 20%, led 8-person team..."
            value={additionalContext}
            onChange={(e) => onContextChange(e.target.value)}
            rows={3}
            className="text-sm"
          />
          {additionalContext.trim().length > 0 && onRerun && (
            <Button
              type="button"
              size="sm"
              className="w-full gap-2"
              onClick={(e) => {
                e.stopPropagation();
                onRerun();
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Re-run with context
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default WeakAlignmentNudge;
