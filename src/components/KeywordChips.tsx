import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface KeywordChipsProps {
  keywords: string[];
}

const KeywordChips = ({ keywords }: KeywordChipsProps) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = async (keyword: string, index: number) => {
    await navigator.clipboard.writeText(keyword);
    setCopiedIndex(index);
    toast.success(`Copied "${keyword}"`);
    setTimeout(() => setCopiedIndex(null), 1500);
  };

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">Missing Keywords</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {keywords.map((keyword, i) => (
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
