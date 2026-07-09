import { Copy, Check, Info } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

interface KeywordChipsProps {
  keywords?: string[] | null;
}

const KeywordChips = ({ keywords }: KeywordChipsProps) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const safeKeywords = Array.isArray(keywords)
    ? keywords.filter((k): k is string => typeof k === "string" && k.trim().length > 0)
    : [];

  if (safeKeywords.length === 0) return null;

  const handleCopy = async (keyword: string, index: number) => {
    try {
      await navigator.clipboard.writeText(keyword);
      setCopiedIndex(index);
      toast.success(`Copied "${keyword}"`);
      setTimeout(() => setCopiedIndex(null), 1500);
    } catch {
      toast.error("Could not copy keyword");
    }
  };

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-1.5">
        <h3 className="text-sm font-semibold text-foreground">Under-Signaled Hiring Priorities</h3>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[220px]">
              <p className="text-xs">Active Job Search analyzes keyword clusters and weighting, not just presence.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {safeKeywords.map((keyword, i) => (
          <button
            key={i}
            onClick={() => handleCopy(keyword, i)}
            className="inline-flex items-center gap-1.5 rounded-full border bg-secondary/50 px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
            aria-label={`Copy keyword: ${keyword}`}
          >
            {keyword}
            {copiedIndex === i ? (
              <Check className="h-3 w-3 text-primary" />
            ) : (
              <Copy className="h-3 w-3 text-muted-foreground" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default KeywordChips;
