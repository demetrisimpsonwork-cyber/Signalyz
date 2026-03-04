import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export interface EvidenceEntry {
  claim: string;
  resume_snippet: string;
  source_section: string;
  confidence: "High" | "Moderate" | "Low";
}

const CONFIDENCE_STYLES: Record<string, string> = {
  High: "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/20",
  Moderate: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20",
  Low: "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/20",
};

interface EvidenceLedgerProps {
  entries?: EvidenceEntry[];
  fallbackMessage?: string;
}

const EvidenceLedger = ({
  entries,
  fallbackMessage = "Additional evidence needed to support this signal.",
}: EvidenceLedgerProps) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground transition-colors"
      >
        Evidence
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {open && (
        <div className="mt-2 space-y-2 animate-fade-in">
          {!entries || entries.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/70 italic pl-3 border-l-2 border-border/40">
              {fallbackMessage}
            </p>
          ) : (
            entries.map((entry, i) => (
              <div
                key={i}
                className="rounded-md border border-border/50 bg-muted/20 px-3 py-2.5 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                    Derived From:
                  </p>
                  <span
                    className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                      CONFIDENCE_STYLES[entry.confidence] || ""
                    }`}
                  >
                    {entry.confidence}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground/80 italic leading-relaxed pl-2 border-l-2 border-border/60">
                  "{entry.resume_snippet}"
                </p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  <span className="font-medium text-foreground">Interpretation:</span>{" "}
                  {entry.claim}
                </p>
                {entry.source_section && (
                  <p className="text-[10px] text-muted-foreground/60">
                    Source: {entry.source_section}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default EvidenceLedger;
