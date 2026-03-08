import { useState, useEffect } from "react";
import { Copy, Check, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface IQuestion {
  question: string;
  why_asking: string;
  signal_angle: string;
}

interface InterviewIntelligenceProps {
  experience: string;
  jd: string;
  alignmentResult: Record<string, unknown>;
  isPro: boolean;
  onUpgrade: () => void;
}

const InterviewIntelligence = ({ experience, jd, alignmentResult, isPro, onUpgrade }: InterviewIntelligenceProps) => {
  const [questions, setQuestions] = useState<IQuestion[]>([]);
  const [loading, setLoading] = useState(!!(experience && jd));
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!experience || !jd) return;
    setLoading(true);
    supabase.functions
      .invoke("generate-pro-content", {
        body: { type: "interview_intelligence", experience, jd, alignmentResult },
      })
      .then(({ data, error }) => {
        if (error) throw error;
        if (Array.isArray(data)) setQuestions(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [experience, jd]);

  const handleCopy = async (q: IQuestion, idx: number) => {
    const text = `QUESTION: ${q.question}\nWHY THEY'RE ASKING THIS: ${q.why_asking}\nSIGNAL ANGLE TO HIT: ${q.signal_angle}`;
    await navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    toast.success("Copied to clipboard", { duration: 1500 });
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mt-6 mb-1 md:mb-0" style={{ letterSpacing: "0.15em" }}>Interview Intelligence™</p>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-28 rounded-lg bg-muted" />)}
        </div>
      </div>
    );
  }

  if (questions.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="mt-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-1 md:mb-0" style={{ letterSpacing: "0.15em" }}>Interview Intelligence™</p>
        <p className="text-xs text-muted-foreground mt-1">The questions this role will probe — built from your specific gaps</p>
      </div>
      <div className="space-y-4">
        {/* Show first question to all users */}
        {questions.slice(0, 1).map((q, i) => (
          <div key={i}>
            <div className="rounded-lg border bg-card p-5 md:p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 1}</span>
                  <p className="text-sm font-semibold text-foreground leading-snug">{q.question}</p>
                </div>
                <button onClick={() => handleCopy(q, i)} className="shrink-0 p-1 rounded hover:bg-secondary transition-colors">
                  {copiedIdx === i ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
              </div>
              <div className="pl-9 space-y-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">Why They're Asking This</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{q.why_asking}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">Signal Angle to Hit</p>
                  <p className="text-xs font-medium text-foreground mt-0.5">{q.signal_angle}</p>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Gate remaining questions */}
        {!isPro && questions.length > 1 && (
          <div className="rounded-lg border border-border bg-card p-6 text-center space-y-3">
            <Lock className="h-5 w-5 text-muted-foreground mx-auto" />
            <p className="text-sm font-semibold text-foreground">Unlock All {questions.length} Questions — Resumix Pro</p>
            <p className="text-xs text-muted-foreground">See every question this role will probe and how to answer.</p>
            {user ? (
              <Button size="sm" onClick={onUpgrade}>Unlock Resumix Pro — $19/month</Button>
            ) : (
              <Button size="sm" asChild><a href="/auth">Get Started Free</a></Button>
            )}
          </div>
        )}

        {/* Pro users see all questions */}
        {isPro && questions.slice(1).map((q, i) => (
          <div key={i + 1}>
            <div className="rounded-lg border bg-card p-5 md:p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 2}</span>
                  <p className="text-sm font-semibold text-foreground leading-snug">{q.question}</p>
                </div>
                <button onClick={() => handleCopy(q, i + 1)} className="shrink-0 p-1 rounded hover:bg-secondary transition-colors">
                  {copiedIdx === i + 1 ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
              </div>
              <div className="pl-9 space-y-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">Why They're Asking This</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{q.why_asking}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">Signal Angle to Hit</p>
                  <p className="text-xs font-medium text-foreground mt-0.5">{q.signal_angle}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default InterviewIntelligence;
