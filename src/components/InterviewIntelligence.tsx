import { useState, useEffect } from "react";
import { Copy, Check, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface IAnswerFramework {
  situation: string;
  action: string;
  result: string;
}

interface IQuestion {
  question: string;
  why_asking: string;
  signal_angle: string;
  answer_framework?: IAnswerFramework;
}

interface InterviewIntelligenceProps {
  experience: string;
  jd: string;
  alignmentResult: Record<string, unknown>;
  isPro: boolean;
  onUpgrade: () => void;
}

const QuestionCard = ({ q, idx, copiedIdx, onCopy }: { q: IQuestion; idx: number; copiedIdx: number | null; onCopy: (q: IQuestion, idx: number) => void }) => (
  <div className="rounded-lg border bg-card p-5 space-y-3">
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-start gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{idx + 1}</span>
        <p className="text-sm font-semibold text-foreground leading-snug">{q.question}</p>
      </div>
      <button onClick={() => onCopy(q, idx)} className="shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center rounded hover:bg-secondary transition-colors">
        {copiedIdx === idx ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
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
      {q.answer_framework && (
        <div className="mt-2 rounded-md bg-muted/50 border border-border/50 p-3 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">Answer Framework</p>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">S:</span> {q.answer_framework.situation}
            </p>
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">A:</span> {q.answer_framework.action}
            </p>
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">R:</span> {q.answer_framework.result}
            </p>
          </div>
        </div>
      )}
    </div>
  </div>
);

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
        if (checkUsageLimitData(data)) return;
        if (Array.isArray(data)) setQuestions(data);
      })
      .catch((e) => { handleUsageLimitError(e); })
      .finally(() => setLoading(false));
  }, [experience, jd]);

  const handleCopy = async (q: IQuestion, idx: number) => {
    const fw = q.answer_framework;
    const fwText = fw ? `\nANSWER FRAMEWORK:\n  S: ${fw.situation}\n  A: ${fw.action}\n  R: ${fw.result}` : "";
    const text = `QUESTION: ${q.question}\nWHY THEY'RE ASKING THIS: ${q.why_asking}\nSIGNAL ANGLE TO HIT: ${q.signal_angle}${fwText}`;
    await navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <p className="section-label section-header">Interview Intelligence™</p>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-28 rounded-lg bg-muted" />)}
        </div>
      </div>
    );
  }

  if (questions.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="section-header">
        <p className="section-label">Interview Intelligence™</p>
        <p className="text-xs font-medium text-foreground mt-1">These are the exact questions you'll be judged on based on your current gaps</p>
      </div>
      <div className="space-y-4">
        {questions.slice(0, 1).map((q, i) => (
          <QuestionCard key={i} q={q} idx={i} copiedIdx={copiedIdx} onCopy={handleCopy} />
        ))}

        {!isPro && questions.length > 1 && (
          <button
            onClick={onUpgrade}
            className="w-full text-center text-sm font-medium py-2.5 rounded-lg transition-colors"
            style={{ color: "hsl(174, 62%, 47%)", backgroundColor: "hsl(174, 62%, 47%, 0.08)" }}
          >
            See all 5 interview questions tailored to your gaps → Unlock Full Signal Intelligence
          </button>
        )}
        {!isPro && questions.length > 1 && (
          <div className="rounded-lg border border-dashed bg-card p-6 text-center space-y-3">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
              <span className="text-lg text-primary">✦</span>
            </div>
            <h4 className="text-sm font-bold text-foreground tracking-tight">
              {questions.length - 1} more questions tied to your current signal gaps
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-sm mx-auto">
              Know exactly what they'll probe — and the signal angle that turns each question into proof you belong.
            </p>
            
            {user ? (
              <div className="space-y-2 w-full max-w-xs mx-auto pt-1">
                <Button size="lg" onClick={onUpgrade} className="gap-2 w-full">
                  Unlock Full Signal Intelligence →
                </Button>
              </div>
            ) : (
              <Button size="lg" className="gap-2" asChild>
                <a href="/auth">Get Started Free</a>
              </Button>
            )}
          </div>
        )}

        {isPro && questions.slice(1).map((q, i) => (
          <QuestionCard key={i + 1} q={q} idx={i + 1} copiedIdx={copiedIdx} onCopy={handleCopy} />
        ))}
      </div>
    </div>
  );
};

export default InterviewIntelligence;
