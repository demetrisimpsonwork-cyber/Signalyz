import { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";

interface SignalKeywordsBlockProps {
  keywords: string[];
}

const SignalKeywordsBlock = ({ keywords }: SignalKeywordsBlockProps) => {
  const [expanded, setExpanded] = useState(false);

  if (!keywords.length) return null;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span className="text-xs font-semibold text-foreground">Signal Keywords</span>
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-3 animate-fade-in">
          <div className="flex flex-wrap gap-1.5">
            {keywords.map((kw, i) => (
              <span
                key={i}
                className="inline-block rounded-full px-2.5 py-1 text-[10px] font-semibold border"
                style={{
                  backgroundColor: "hsl(38, 92%, 50%, 0.1)",
                  borderColor: "hsl(38, 92%, 50%, 0.3)",
                  color: "hsl(38, 92%, 35%)",
                }}
              >
                {kw}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed italic">
            These are your calibration signals — the exact language the role is screening for. Your resume has been built around them.
          </p>
        </div>
      )}
    </div>
  );
};

export default SignalKeywordsBlock;
