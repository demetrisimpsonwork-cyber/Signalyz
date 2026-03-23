import { useState } from "react";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Check, Loader2, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface LinkedInSignalTabProps {
  experience: string;
  inferredRole: string;
  signalKeywords?: string[];
  onRunAlignment?: () => void;
  isPro?: boolean;
  onUpgrade?: () => void;
}

interface HeadlineVariant {
  label: string;
  text: string;
}

const CALIBRATION_STEPS = [
  "Mapping role signal keywords to LinkedIn context…",
  "Repositioning headline for recruiter pattern match…",
  "Calibrating About section narrative…",
];

const LinkedInSignalTab = ({ experience, inferredRole, signalKeywords = [], onRunAlignment, isPro = false, onUpgrade }: LinkedInSignalTabProps) => {
  const [headline, setHeadline] = useState("");
  const [aboutSection, setAboutSection] = useState("");
  const [headlineVariants, setHeadlineVariants] = useState<HeadlineVariant[]>([]);
  const [calibratedAbout, setCalibratedAbout] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const { user } = useAuth();
  const { hasConsumedOneTimeCredit } = useSubscription();
  const ctaLabel = "Unlock Full Signal Intelligence →";

  const handleCopy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedIdx(key);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  const calibrateAll = async () => {
    setLoading(true);
    setStep(0);
    const stepTimers = [
      setTimeout(() => setStep(1), 2000),
      setTimeout(() => setStep(2), 4500),
    ];
    try {
      const [headlineRes, aboutRes] = await Promise.all([
        supabase.functions.invoke("generate-pro-content", {
          body: { type: "linkedin_headline", experience, currentHeadline: headline, inferredRole },
        }),
        supabase.functions.invoke("generate-pro-content", {
          body: { type: "linkedin_summary", experience, currentAbout: aboutSection, inferredRole },
        }),
      ]);
      stepTimers.forEach(clearTimeout);
      if (headlineRes.error) throw headlineRes.error;
      if (aboutRes.error) throw aboutRes.error;
      if (Array.isArray(headlineRes.data)) setHeadlineVariants(headlineRes.data);
      if (aboutRes.data?.summary) setCalibratedAbout(aboutRes.data.summary);
    } catch {
      toast.error("Failed to calibrate LinkedIn signal.");
    } finally {
      setLoading(false);
    }
  };

  // Pre-alignment state
  if (!inferredRole) {
    return (
      <div className="max-w-md mx-auto">
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <span className="text-lg text-primary">✦</span>
          </div>
          <h3 className="text-base font-semibold text-foreground">Your LinkedIn is a separate signal channel</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Recruiters read your LinkedIn <span className="font-medium text-foreground">before</span> your resume. After alignment, Signalyz calibrates your headline and About section to send the same positioning signal — so your profile reinforces your application instead of contradicting it.
          </p>
          <Button variant="outline" size="sm" onClick={onRunAlignment} className="gap-1.5">
            Run Alignment First
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  // Gate for non-Pro users
  if (!isPro) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card min-h-[300px] gap-4 p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <span className="text-2xl text-primary">✦</span>
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-foreground tracking-tight">
              Your LinkedIn is sending a different signal than your resume
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
              Recruiters check LinkedIn before they read your resume. If your headline and about section don't match the role signal, you lose credibility before the interview even starts.
            </p>
            <p className="text-[11px] font-semibold text-destructive/80">Most candidates don't realize their LinkedIn is contradicting their application.</p>
          </div>
          {user ? (
            <div className="space-y-3 w-full max-w-xs">
              <Button onClick={onUpgrade} size="lg" className="gap-2 w-full">
                {ctaLabel}
              </Button>
              
            </div>
          ) : (
            <Button size="lg" className="gap-2" asChild>
              <a href="/auth">Get Started Free</a>
            </Button>
          )}
        </div>
      </div>
    );
  }

  const hasResults = headlineVariants.length > 0 || calibratedAbout;

  return (
    <div className="space-y-6">
      {/* Context — what this does and why */}
      <div className="rounded-lg border bg-card px-4 py-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-sm font-medium text-foreground">
              LinkedIn Signal Calibration — <span className="text-primary">{inferredRole}</span>
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Your resume and LinkedIn send two separate signals. This tool repositions your headline and About section to match the same role signal your calibrated resume targets — so recruiters see consistency, not contradiction.
            </p>
          </div>
        </div>
        {/* What specifically changes */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
          {[
            { label: "Headline", detail: "Repositioned around role identity + signal keywords" },
            { label: "About Section", detail: "Reframed to match calibrated resume narrative" },
            { label: "Signal Consistency", detail: "LinkedIn + Resume send the same hiring signal" },
          ].map((item) => (
            <div key={item.label} className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 space-y-0.5">
              <p className="text-[10px] uppercase tracking-widest font-semibold text-primary">{item.label}</p>
              <p className="text-[11px] text-muted-foreground leading-snug">{item.detail}</p>
            </div>
          ))}
        </div>
        {/* Signal keywords this calibration targets */}
        {signalKeywords.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <span className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Target signals:</span>
            {signalKeywords.slice(0, 5).map((kw, i) => (
              <span key={i} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
                {kw}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Input sections */}
      <div className="grid grid-cols-1 gap-4">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Current Headline</p>
            <p className="text-[10px] text-muted-foreground">Optional — leave blank to build from scratch</p>
          </div>
          <Textarea
            placeholder="Paste your current LinkedIn headline..."
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            rows={2}
            className="resize-none"
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Current About Section</p>
            <p className="text-[10px] text-muted-foreground">Optional</p>
          </div>
          <Textarea
            placeholder="Paste your current About section..."
            value={aboutSection}
            onChange={(e) => setAboutSection(e.target.value)}
            rows={4}
            className="resize-none"
          />
        </div>
      </div>

      {/* CTA */}
      <Button onClick={calibrateAll} disabled={loading} className="w-full gap-2" size="lg">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span style={{ color: "inherit" }}>✦</span>}
        {hasResults ? "Recalibrate LinkedIn Signal" : "Calibrate My LinkedIn Signal"}
      </Button>

      {/* Loading state with step progress */}
      {loading && (
        <div className="rounded-lg border bg-card p-5 space-y-3">
          {CALIBRATION_STEPS.map((label, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <div key={i} className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                  done ? "bg-primary" : active ? "border-2 border-primary" : "border border-muted-foreground/30"
                }`}>
                  {done ? (
                    <Check className="h-3 w-3 text-primary-foreground" />
                  ) : active ? (
                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  ) : null}
                </div>
                <span className={`text-sm ${done ? "text-foreground" : active ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Results: Headlines */}
      {!loading && headlineVariants.length > 0 && (
        <div className="space-y-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] font-semibold text-primary/70 mb-1">Calibrated Output</p>
            <p className="section-label">Headline Variants</p>
            <p className="text-xs text-muted-foreground mt-1">Each variant targets a different recruiter search pattern for <span className="font-medium text-foreground">{inferredRole}</span>.</p>
          </div>
          {headlineVariants.map((v, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Before</p>
                <p className="text-sm text-muted-foreground">{headline || <span className="italic">No headline provided</span>}</p>
              </div>
              <div className="rounded-lg border border-primary/20 bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-primary mb-1">{v.label}</p>
                    <p className="text-sm text-foreground break-words">{v.text}</p>
                  </div>
                  <button onClick={() => handleCopy(v.text, `h${i}`)} className="shrink-0 p-1 rounded hover:bg-secondary">
                    {copiedIdx === `h${i}` ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Results: About */}
      {!loading && calibratedAbout && (
        <div className="space-y-4">
          <div>
            <p className="section-label">About Section</p>
            <p className="text-xs text-muted-foreground mt-1">Repositioned to reinforce the same signal your calibrated resume sends — ownership language, commercial framing, and role-native terminology.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Before</p>
              <p className="text-sm text-muted-foreground whitespace-pre-line">{aboutSection || <span className="italic">No About section provided</span>}</p>
            </div>
            <div className="rounded-lg border-l-4 border-l-primary border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-primary mb-1">Calibrated</p>
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-line break-words">{calibratedAbout}</p>
                </div>
                <button onClick={() => handleCopy(calibratedAbout, "about")} className="shrink-0 p-1 rounded hover:bg-secondary">
                  {copiedIdx === "about" ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Signal consistency explanation after results */}
      {!loading && hasResults && (
        <div className="rounded-lg border border-primary/10 bg-primary/5 px-4 py-3 space-y-1">
          <p className="text-xs font-medium text-foreground">Why this matters</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            72% of recruiters check LinkedIn before reading a resume. When your headline and About section send the same signal as your calibrated resume, you pass the consistency check that most candidates fail — creating a unified professional identity across every touchpoint.
          </p>
        </div>
      )}
    </div>
  );
};

export default LinkedInSignalTab;
