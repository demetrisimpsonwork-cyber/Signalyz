import { useState, useEffect } from "react";
import { Copy, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ATSData {
  missing_keywords: string[];
  matched_keywords: string[];
  ats_risk: "High" | "Moderate" | "Low";
  ats_risk_explanation: string;
}

interface ATSSignalPanelProps {
  experience: string;
  jd: string;
  isPro: boolean;
  onUpgrade: () => void;
}

const RISK_STYLES: Record<string, string> = {
  High: "bg-destructive text-destructive-foreground",
  Moderate: "bg-orange-500 text-white",
  Low: "bg-green-600 text-white",
};

const ATSSignalPanel = ({ experience, jd, isPro, onUpgrade }: ATSSignalPanelProps) => {
  const [data, setData] = useState<ATSData | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedKw, setCopiedKw] = useState<string | null>(null);

  useEffect(() => {
    if (!experience || !jd) return;
    setLoading(true);
    supabase.functions
      .invoke("generate-pro-content", {
        body: { type: "ats_panel", experience, jd },
      })
      .then(({ data: d, error }) => {
        if (error) throw error;
        if (d?.ats_risk) setData(d as ATSData);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [experience, jd]);

  const handleCopyKw = async (kw: string) => {
    await navigator.clipboard.writeText(kw);
    setCopiedKw(kw);
    toast.success("Copied", { duration: 1000 });
    setTimeout(() => setCopiedKw(null), 1500);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mt-6 mb-1 md:mb-0" style={{ letterSpacing: "0.15em" }}>ATS Signal Panel</p>
        <div className="animate-pulse h-40 rounded-lg bg-muted" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="mt-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-1 md:mb-0" style={{ letterSpacing: "0.15em" }}>ATS Signal Panel</p>
        <p className="text-xs text-muted-foreground mt-1">How your resume reads to automated screening systems</p>
      </div>

      {/* Risk badge */}
      <div className={`rounded-lg p-4 text-center ${RISK_STYLES[data.ats_risk]}`}>
        <p className="text-lg font-bold">ATS Risk: {data.ats_risk}</p>
        <p className="text-sm opacity-90 mt-1">{data.ats_risk_explanation}</p>
      </div>

      {/* Keywords — blurred for free */}
      <div className="relative">
        <div className={`grid grid-cols-2 gap-4 ${!isPro ? "blur-sm select-none pointer-events-none" : ""}`}>
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-destructive">Missing Keywords</p>
            <div className="flex flex-wrap gap-1.5">
              {data.missing_keywords.slice(0, 10).map((kw) => (
                <button
                  key={kw}
                  onClick={() => handleCopyKw(kw)}
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                >
                  {kw}
                  {copiedKw === kw ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5 opacity-50" />}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">Matched Keywords</p>
            <div className="flex flex-wrap gap-1.5">
              {data.matched_keywords.slice(0, 10).map((kw) => (
                <span key={kw} className="inline-flex items-center rounded-full px-2.5 py-1 text-xs bg-primary/10 text-primary">
                  {kw}
                </span>
              ))}
            </div>
          </div>
        </div>
        {!isPro && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Button size="sm" onClick={onUpgrade} className="shadow-lg">
              Unlock ATS Panel — Resumix Pro
            </Button>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground italic text-center">
        We never recommend keyword stuffing. Every suggestion shows how to integrate naturally.
      </p>
    </div>
  );
};

export default ATSSignalPanel;
