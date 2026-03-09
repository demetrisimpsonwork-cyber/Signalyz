import { useState, useEffect } from "react";
import { Copy, Check, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

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
  High: "border border-orange-500/30 bg-card",
  Moderate: "border border-orange-400/20 bg-card",
  Low: "border border-green-500/20 bg-card",
};

const RISK_BADGE_STYLES: Record<string, string> = {
  High: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  Moderate: "bg-orange-400/15 text-orange-500 dark:text-orange-300",
  Low: "bg-green-500/15 text-green-600 dark:text-green-400",
};

const ATSSignalPanel = ({ experience, jd, isPro, onUpgrade }: ATSSignalPanelProps) => {
  const [data, setData] = useState<ATSData | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedKw, setCopiedKw] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!experience || !jd) return;
    setLoading(true);
    supabase.functions
      .invoke("generate-pro-content", {
        body: { type: "ats_panel", experience, jd },
      })
      .then(({ data: res, error }) => {
        if (error) throw error;
        if (res) setData(res as ATSData);
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
        <p className="section-label section-header">ATS Signal Panel</p>
        <div className="animate-pulse h-40 rounded-lg bg-muted" />
      </div>
    );
  }

  if (!data) return null;

  if (!isPro) {
    return (
      <div className="space-y-4">
        <div className="section-header">
          <p className="section-label">ATS Signal Panel</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5 text-center space-y-3">
          <Lock className="h-5 w-5 text-muted-foreground mx-auto" />
          <p className="text-sm font-semibold text-foreground">Unlock ATS Signal Panel — Resumix Pro</p>
          <p className="text-xs text-muted-foreground">See how your resume reads to automated screening systems.</p>
          {user ? (
            <Button size="sm" onClick={onUpgrade}>Unlock Resumix Pro — $19/month</Button>
          ) : (
            <Button size="sm" asChild><a href="/auth">Get Started Free</a></Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="mt-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-1 md:mb-0" style={{ letterSpacing: "0.15em" }}>ATS Signal Panel</p>
        <p className="text-xs text-muted-foreground mt-1">How your resume reads to automated screening systems</p>
      </div>

      <div className={`rounded-lg p-5 md:p-4 ${RISK_STYLES[data.ats_risk]}`}>
        <div className="flex items-center justify-center gap-2">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${RISK_BADGE_STYLES[data.ats_risk]}`}>
            {data.ats_risk}
          </span>
          <p className="text-sm font-semibold text-foreground">ATS Risk</p>
        </div>
        <p className="text-sm text-muted-foreground mt-2 text-center">{data.ats_risk_explanation}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
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

      <p className="text-xs text-muted-foreground italic text-center">
        We never recommend keyword stuffing. Every suggestion shows how to integrate naturally.
      </p>
    </div>
  );
};

export default ATSSignalPanel;
