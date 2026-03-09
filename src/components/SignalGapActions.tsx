import { useState, useEffect } from "react";
import { Copy, Check, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface GapAction {
  gap_name: string;
  why_it_hurts: string;
  action: string;
  impact: "High" | "Medium" | "Low";
}

interface SignalGapActionsProps {
  experience: string;
  jd: string;
  alignmentResult: Record<string, unknown>;
  isPro: boolean;
  onUpgrade: () => void;
}

const IMPACT_STYLES: Record<string, string> = {
  High: "bg-destructive text-destructive-foreground",
  Medium: "bg-orange-500 text-white",
  Low: "bg-muted text-muted-foreground",
};

const SignalGapActions = ({ experience, jd, alignmentResult, isPro, onUpgrade }: SignalGapActionsProps) => {
  const [gaps, setGaps] = useState<GapAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!experience || !jd) return;
    setLoading(true);
    supabase.functions
      .invoke("generate-pro-content", {
        body: { type: "gap_actions", experience, jd, alignmentResult },
      })
      .then(({ data, error }) => {
        if (error) throw error;
        if (Array.isArray(data)) setGaps(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [experience, jd]);

  const handleCopy = async (text: string, idx: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    toast.success("Copied to clipboard", { duration: 1500 });
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <p className="section-label section-header">Signal Gap Actions</p>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-lg bg-muted" />)}
        </div>
      </div>
    );
  }

  if (gaps.length === 0) return null;

  if (!isPro) {
    return (
      <div className="space-y-4">
        <div className="section-header">
          <p className="section-label">Signal Gap Actions</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5 text-center space-y-3">
          <Lock className="h-5 w-5 text-muted-foreground mx-auto" />
          <p className="text-sm font-semibold text-foreground">Unlock Signal Gap Actions — Resumix Pro</p>
          <p className="text-xs text-muted-foreground">See exactly what's reducing your match and how to fix it.</p>
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
      <div className="section-header">
        <p className="section-label">Signal Gap Actions</p>
        <p className="text-xs text-muted-foreground mt-1">What's reducing your match — and exactly how to fix it</p>
      </div>
      <div className="space-y-4">
        {gaps.map((gap, i) => (
          <div key={i} className="rounded-lg border bg-card p-5 space-y-3">
            <div className="flex items-start justify-between">
              <p className="text-sm font-semibold text-foreground">{gap.gap_name}</p>
              <Badge className={`text-[10px] ${IMPACT_STYLES[gap.impact] || IMPACT_STYLES.Low}`}>
                {gap.impact}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{gap.why_it_hurts}</p>
            <div className="flex items-start gap-2 rounded-md bg-primary/5 border border-primary/10 p-3">
              <span className="text-primary font-medium text-sm shrink-0">→</span>
              <p className="text-sm text-foreground flex-1">{gap.action}</p>
              <button onClick={() => handleCopy(gap.action, i)} className="shrink-0 p-1 rounded hover:bg-secondary transition-colors">
                {copiedIdx === i ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SignalGapActions;
