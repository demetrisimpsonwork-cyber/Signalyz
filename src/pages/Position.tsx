import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, Copy, Check, Download, Lock, AlertTriangle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useReverseTrial } from "@/hooks/useReverseTrial";

// ─── Types ───────────────────────────────────────────────────────────────────

interface RolePillar {
  pillar: string;
  weight: "High" | "Medium" | "Low";
  description: string;
}

interface RepositioningEntry {
  pillar: string;
  matching_experience: string;
  role_native_language: string;
  transferable_complexity: string;
}

interface CommercialConversion {
  original_framing: string;
  commercial_reframe: string;
  quantified_impact: string;
}

interface GapMitigation {
  gap: string;
  resume_edit: string;
  interview_narrative: string;
  micro_credential: string;
}

interface GapStrategy {
  hard_gaps: string[];
  perception_gaps: string[];
  mitigation: GapMitigation[];
}

interface BulletRewrite {
  original: string;
  rewritten: string;
}

interface MatchScoreForecast {
  before_percent: number;
  after_percent: number;
  rationale: string;
}

interface MarketPositionAssessment {
  level: "Support-Level" | "Operational-Level" | "Mid-Level Professional" | "Strategic-Level" | "Leadership-Level";
  explanation: string;
  under_positioned: boolean;
  under_positioned_explanation: string;
}

interface CompetitiveRiskSignal {
  area: string;
  explanation: string;
}

interface InterviewTrajectory {
  likely_focus_areas: string[];
  likely_objection: string;
  strategic_angle: string;
}

interface RiskPerceptionItem {
  category: string;
  rating: "Low" | "Medium" | "High";
  explanation: string;
  mitigation: string;
}

interface PositioningResult {
  role_dna: RolePillar[];
  repositioning_matrix: RepositioningEntry[];
  commercial_value_conversion: CommercialConversion[];
  gap_strategy: GapStrategy;
  optimized_summary: string;
  bullet_rewrites: BulletRewrite[];
  interview_dominance_script: string;
  match_score_forecast: MatchScoreForecast;
  market_position_assessment?: MarketPositionAssessment;
  competitive_risk_signals?: CompetitiveRiskSignal[];
  interview_trajectory?: InterviewTrajectory;
  employer_risk_perception?: RiskPerceptionItem[];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const CopyButton = ({ text, label }: { text: string; label: string }) => {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied to clipboard", { duration: 1500 });
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={handle}
      aria-label={`Copy ${label}`}
      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
};

const Section = ({
  title,
  children,
  copyText,
  badge,
  proLabel,
}: {
  title: string;
  children: React.ReactNode;
  copyText?: string;
  badge?: React.ReactNode;
  proLabel?: boolean;
}) => (
  <div className="rounded-lg border bg-card p-4 space-y-3">
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {badge}
        {proLabel && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wide">
            Pro
          </span>
        )}
      </div>
      {copyText && <CopyButton text={copyText} label={title} />}
    </div>
    {children}
  </div>
);

const BulletList = ({ items }: { items: string[] }) => (
  <ul className="space-y-1.5 mt-1">
    {items.map((item, i) => (
      <li key={i} className="flex gap-2 text-sm text-muted-foreground leading-relaxed">
        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary opacity-60" />
        {item}
      </li>
    ))}
  </ul>
);

const weightColor = (w: string) => {
  if (w === "High") return "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400";
  if (w === "Medium") return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400";
  return "bg-muted text-muted-foreground";
};

const levelColor = (level: string) => {
  if (level === "Leadership-Level") return "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400";
  if (level === "Strategic-Level") return "bg-primary/10 text-primary";
  if (level === "Mid-Level Professional") return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400";
  return "bg-muted text-muted-foreground";
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const riskRatingColor = (r: string) => {
  if (r === "High") return "bg-destructive/10 text-destructive border border-destructive/20";
  if (r === "Medium") return "bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/40";
  return "bg-green-100 text-green-700 border border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-800/40";
};

// ─── Blurred Pro Teaser ───────────────────────────────────────────────────────

const LockedSection = ({ title, lockLabel = "Unlock Strategic Interview Forecasting with Pro" }: { title: string; lockLabel?: string }) => (
  <div className="rounded-lg border bg-card overflow-hidden relative">
    <div className="p-4 space-y-3 select-none pointer-events-none" aria-hidden>
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="space-y-2 blur-sm opacity-60">
        <div className="h-3 w-3/4 rounded bg-muted" />
        <div className="h-3 w-full rounded bg-muted" />
        <div className="h-3 w-2/3 rounded bg-muted" />
        <div className="h-3 w-5/6 rounded bg-muted" />
        <div className="h-3 w-1/2 rounded bg-muted" />
      </div>
    </div>
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-card/60 backdrop-blur-[2px]">
      <Lock className="h-4 w-4 text-muted-foreground" />
      <p className="text-xs font-medium text-foreground text-center px-6">{lockLabel}</p>
    </div>
  </div>
);

const LockedRiskCard = ({ category }: { category: string }) => (
  <div className="rounded-md border bg-background overflow-hidden relative min-h-[88px]">
    <div className="p-4 space-y-2 select-none pointer-events-none blur-sm opacity-40" aria-hidden>
      <div className="flex items-center gap-2">
        <span className="rounded-sm px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase bg-muted text-muted-foreground">MEDIUM</span>
      </div>
      <p className="text-xs font-semibold text-foreground">{category}</p>
      <div className="h-2.5 w-full rounded bg-muted" />
      <div className="h-2.5 w-4/5 rounded bg-muted" />
      <div className="h-2 w-1/2 rounded bg-muted" />
    </div>
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-background/80 backdrop-blur-[2px]">
      <Lock className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-[11px] text-muted-foreground font-medium tracking-wide">PRO ONLY</span>
    </div>
  </div>
);

// ─── Progress Steps ───────────────────────────────────────────────────────────

const STEPS = [
  { label: "Step 1", desc: "Extracting Role DNA & parsing inputs…" },
  { label: "Step 2", desc: "Repositioning experience & converting commercial value…" },
  { label: "Step 3", desc: "Generating bullet rewrites, gap strategy & interview intelligence…" },
];

const ProgressCard = ({ activeStep, elapsed }: { activeStep: number; elapsed: number }) => {
  const showReassurance = elapsed >= 18;
  return (
    <div className="rounded-lg border bg-card p-5 space-y-4 animate-fade-in">
      <p className="text-xs text-muted-foreground">This can take ~30 seconds for large resumes.</p>
      <div className="space-y-3">
        {STEPS.map((step, i) => {
          const done = activeStep > i;
          const active = activeStep === i;
          return (
            <div key={i} className={`flex items-start gap-3 transition-opacity duration-300 ${active || done ? "opacity-100" : "opacity-35"}`}>
              <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold transition-colors duration-500
                ${done ? "border-primary bg-primary text-primary-foreground" : active ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>
                {done ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <div className="space-y-0.5">
                <p className={`text-xs font-semibold ${active ? "text-foreground" : done ? "text-primary" : "text-muted-foreground"}`}>{step.label}</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{step.desc}</p>
                {active && <div className="mt-1 h-0.5 w-16 rounded-full bg-primary/20 overflow-hidden"><div className="h-full bg-primary animate-[pulse_1.5s_ease-in-out_infinite] w-full" /></div>}
              </div>
            </div>
          );
        })}
      </div>
      {showReassurance && (
        <div className="rounded-md bg-muted/60 px-3 py-2 text-[11px] text-muted-foreground animate-fade-in">
          Large resumes can take a bit longer. Still processing…
        </div>
      )}
    </div>
  );
};

// ─── Timeout Error Card ───────────────────────────────────────────────────────

const TimeoutErrorCard = ({
  onRetry,
  experienceLen,
  jdLen,
}: {
  onRetry: () => void;
  experienceLen: number;
  jdLen: number;
}) => {
  const handleCopyDebug = () => {
    const info = JSON.stringify({
      timestamp: new Date().toISOString(),
      route: "/position",
      resume_chars: experienceLen,
      jd_chars: jdLen,
    }, null, 2);
    navigator.clipboard.writeText(info);
    toast.success("Debug info copied");
  };
  return (
    <div className="rounded-lg border border-destructive/30 bg-card p-5 space-y-4 animate-fade-in">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Generation timed out</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            This took longer than 60 seconds. This can happen with very large resumes or high server load. Try again — it usually works on the second attempt.
          </p>
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" onClick={onRetry} className="gap-1.5 h-8 text-xs">
          <RefreshCw className="h-3 w-3" />
          Retry
        </Button>
        <Button size="sm" variant="outline" onClick={handleCopyDebug} className="gap-1.5 h-8 text-xs">
          <Copy className="h-3 w-3" />
          Copy Debug Info
        </Button>
      </div>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const CHAR_LIMIT_TIP = 12000;
const TIMEOUT_MS = 60000;
const STEP_TIMINGS = [0, 4000, 14000]; // step 0 at 0s, step 1 at 4s, step 2 at 14s

const Position = () => {
  const [experience, setExperience] = useState("");
  const [jd, setJd] = useState("");
  const [result, setResult] = useState<PositioningResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [errors, setErrors] = useState<{ experience?: string; jd?: string }>({});

  const stepTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(0);

  const isAdmin = useIsAdmin();
  const { isTrialPro } = useReverseTrial();
  // TODO: replace with real pro check when Stripe is wired up
  const isPro = false;
  const effectiveIsPro = isPro || isAdmin || isTrialPro;

  const clearTimers = () => {
    stepTimers.current.forEach(clearTimeout);
    stepTimers.current = [];
    if (elapsedTimer.current) { clearInterval(elapsedTimer.current); elapsedTimer.current = null; }
    if (timeoutTimer.current) { clearTimeout(timeoutTimer.current); timeoutTimer.current = null; }
  };

  const startProgressTimers = () => {
    setActiveStep(0);
    setElapsed(0);
    startTimeRef.current = Date.now();

    // Elapsed counter (seconds)
    elapsedTimer.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    // Step transitions
    STEP_TIMINGS.forEach((delay, i) => {
      const t = setTimeout(() => setActiveStep(i), delay);
      stepTimers.current.push(t);
    });
  };

  const completeProgress = () => {
    clearTimers();
    setActiveStep(STEPS.length); // all done
  };

  const validate = () => {
    const errs: typeof errors = {};
    if (!experience.trim()) errs.experience = "Please paste your experience or resume section.";
    if (!jd.trim()) errs.jd = "Please paste a job description.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleRun = async () => {
    if (!validate()) return;
    setLoading(true);
    setTimedOut(false);
    setResult(null);
    clearTimers();
    startProgressTimers();

    // Client-side 60s timeout
    timeoutTimer.current = setTimeout(() => {
      setLoading(false);
      setTimedOut(true);
      clearTimers();
    }, TIMEOUT_MS);

    try {
      const { data, error } = await supabase.functions.invoke("titan-position", {
        body: { experience: experience.trim(), jd: jd.trim() },
      });
      clearTimeout(timeoutTimer.current!);
      timeoutTimer.current = null;
      completeProgress();
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data as PositioningResult);
    } catch (err: any) {
      completeProgress();
      if (!timedOut) toast.error(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!result) return;
    const lines: string[] = [
      "RESUMIX — STRATEGIC POSITIONING ENGINE (ROLE DNA)",
      "===================================================",
      "",
      "1. ROLE DNA EXTRACTION",
      ...result.role_dna.map((p) => `  [${p.weight}] ${p.pillar}: ${p.description}`),
      "",
      "2. EXPERIENCE REPOSITIONING MATRIX",
      ...result.repositioning_matrix.map(
        (m) =>
          `  ${m.pillar}\n  → Real Experience: ${m.matching_experience}\n  → Role Language: ${m.role_native_language}\n  → Transferable Complexity: ${m.transferable_complexity}`
      ),
      "",
      "3. COMMERCIAL VALUE CONVERSION",
      ...result.commercial_value_conversion.map(
        (c) => `  Original: ${c.original_framing}\n  Reframe: ${c.commercial_reframe}\n  Impact: ${c.quantified_impact}`
      ),
      "",
      "4. GAP STRATEGY",
      "Hard Gaps:",
      ...result.gap_strategy.hard_gaps.map((g) => `  • ${g}`),
      "Perception Gaps:",
      ...result.gap_strategy.perception_gaps.map((g) => `  • ${g}`),
      "Mitigation:",
      ...result.gap_strategy.mitigation.map(
        (m) =>
          `  Gap: ${m.gap}\n  Resume Edit: ${m.resume_edit}\n  Interview: ${m.interview_narrative}\n  Credential: ${m.micro_credential}`
      ),
      "",
      "5. OPTIMIZED SUMMARY",
      result.optimized_summary,
      "",
      "6. BULLET REWRITES",
      ...result.bullet_rewrites.map((b) => `  Before: ${b.original}\n  After:  ${b.rewritten}`),
      "",
      "7. INTERVIEW DOMINANCE SCRIPT",
      result.interview_dominance_script,
      "",
      "8. MATCH SCORE FORECAST",
      `  Before: ${result.match_score_forecast.before_percent}%`,
      `  After:  ${result.match_score_forecast.after_percent}%`,
      `  Rationale: ${result.match_score_forecast.rationale}`,
    ];

    if (result.market_position_assessment) {
      const mpa = result.market_position_assessment;
      lines.push(
        "",
        "9. MARKET POSITION ASSESSMENT",
        `  Level: ${mpa.level}`,
        `  ${mpa.explanation}`,
        ...(mpa.under_positioned ? [`  Under-Positioned: ${mpa.under_positioned_explanation}`] : [])
      );
    }

    if (result.competitive_risk_signals?.length) {
      lines.push("", "10. COMPETITIVE RISK SIGNALS");
      result.competitive_risk_signals.forEach((s) => {
        lines.push(`  • ${s.area}: ${s.explanation}`);
      });
    }

    if (effectiveIsPro && result.interview_trajectory) {
      const it = result.interview_trajectory;
      lines.push(
        "",
        "11. INTERVIEW TRAJECTORY PREVIEW",
        "  Likely Focus Areas:",
        ...it.likely_focus_areas.map((f) => `    • ${f}`),
        `  Likely Objection: ${it.likely_objection}`,
        `  Strategic Angle: ${it.strategic_angle}`
      );
    }

    if (result.employer_risk_perception?.length) {
      lines.push("", "12. EMPLOYER RISK PERCEPTION ANALYSIS");
      const visibleItems = effectiveIsPro ? result.employer_risk_perception : result.employer_risk_perception.slice(0, 1);
      visibleItems.forEach((r) => {
        lines.push(`  ${r.category} — ${r.rating} Risk`);
        lines.push(`  ${r.explanation}`);
        lines.push(`  Mitigation: ${r.mitigation}`);
        lines.push("");
      });
    }

    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "resumix-positioning.txt";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Download started", { duration: 1500 });
  };

  return (
    <div className="container max-w-6xl py-8">
      {/* Header */}
      <div className="mb-8 text-center max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Strategic Positioning Engine
        </h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          Shifts perceived identity — not keyword density. Role DNA extraction, commercial value conversion, gap mitigation, elite bullet rewrites, and interview scripts. Zero fabrication.
        </p>
      </div>

      {/* Steps */}
      <div className="mb-10 mx-auto max-w-2xl">
        <ol className="space-y-4">
          {[
            { step: "Extract Role DNA", desc: "Identifies the 5 core identity pillars the employer is actually hiring for." },
            { step: "Reposition Your Experience", desc: "Maps your real background into role-native commercial language — no fabrication." },
            { step: "Get Your Full Package", desc: "Elite bullet rewrites, gap mitigation strategy, market position assessment, and interview intelligence." },
          ].map((item, i) => (
            <li key={i} className="flex gap-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium text-muted-foreground">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">{item.step}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{item.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Left — Inputs */}
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="block text-sm font-medium text-foreground">Your Resume / Experience</label>
              <span className={`text-[11px] tabular-nums ${experience.length > CHAR_LIMIT_TIP ? "text-warning font-medium" : "text-muted-foreground"}`}>
                {experience.length.toLocaleString()} chars
              </span>
            </div>
            <p className="mb-1.5 text-xs text-muted-foreground">
              Paste your full resume, summary, or most relevant role. More context yields stronger output.
            </p>
            <Textarea
              placeholder="Paste your experience here..."
              value={experience}
              onChange={(e) => { setExperience(e.target.value); setErrors((p) => ({ ...p, experience: undefined })); }}
              rows={9}
              disabled={loading}
              className={errors.experience ? "border-destructive" : ""}
            />
            {errors.experience && <p className="mt-1 text-xs text-destructive">{errors.experience}</p>}
            {experience.length > CHAR_LIMIT_TIP && (
              <p className="mt-1 text-[11px] text-warning leading-relaxed">
                💡 For best speed, paste your most recent 1–2 roles or a shortened resume.
              </p>
            )}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="block text-sm font-medium text-foreground">Target Job Description</label>
              <span className={`text-[11px] tabular-nums ${jd.length > CHAR_LIMIT_TIP ? "text-warning font-medium" : "text-muted-foreground"}`}>
                {jd.length.toLocaleString()} chars
              </span>
            </div>
            <p className="mb-1.5 text-xs text-muted-foreground">
              Paste the full job description. We extract the employer's identity priorities, not just keywords.
            </p>
            <Textarea
              placeholder="Paste the job description..."
              value={jd}
              onChange={(e) => { setJd(e.target.value); setErrors((p) => ({ ...p, jd: undefined })); }}
              rows={9}
              disabled={loading}
              className={errors.jd ? "border-destructive" : ""}
            />
            {errors.jd && <p className="mt-1 text-xs text-destructive">{errors.jd}</p>}
            {jd.length > CHAR_LIMIT_TIP && (
              <p className="mt-1 text-[11px] text-warning leading-relaxed">
                💡 For best speed, paste your most recent 1–2 roles or a shortened resume.
              </p>
            )}
          </div>

          <Button onClick={handleRun} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate Positioning Package
          </Button>
          <p className="text-xs text-muted-foreground">
            Takes 25–40 seconds. 11-section output. Zero fabrication.
          </p>
        </div>

        {/* Right — Results */}
        <div className="space-y-4">
          {loading && (
            <ProgressCard activeStep={activeStep} elapsed={elapsed} />
          )}

          {timedOut && !loading && (
            <TimeoutErrorCard
              onRetry={handleRun}
              experienceLen={experience.length}
              jdLen={jd.length}
            />
          )}

          {!loading && !timedOut && !result && (
            <div className="flex h-80 items-center justify-center rounded-lg border border-dashed bg-card">
              <p className="text-sm text-muted-foreground">Your positioning package will appear here</p>
            </div>
          )}

          {result && (
            <>
              {/* 1 — Role DNA */}
              <Section title="1. Role DNA Extraction">
                <div className="space-y-2">
                  {result.role_dna.map((p, i) => (
                    <div key={i} className="rounded-md border bg-background p-3 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">{p.pillar}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${weightColor(p.weight)}`}>
                          {p.weight}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{p.description}</p>
                    </div>
                  ))}
                </div>
              </Section>

              {/* 2 — Employer Risk Perception Analysis */}
              {result.employer_risk_perception && result.employer_risk_perception.length > 0 && (
                <Section title="2. Employer Risk Perception Analysis™" proLabel>
                  <p className="text-[11px] text-muted-foreground mb-4 leading-relaxed">
                    Simulation of how a hiring manager evaluates perceived candidate risk. Grounded strictly in resume signals relative to JD requirements.
                  </p>
                  <div className="space-y-3">
                    {result.employer_risk_perception.map((item, i) => {
                      const isVisible = effectiveIsPro || i === 0;
                      if (!isVisible) {
                        return <LockedRiskCard key={i} category={item.category} />;
                      }
                      return (
                        <div key={i} className="rounded-md border bg-background overflow-hidden">
                          {/* Badge row */}
                          <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-3">
                            <div className="flex flex-col gap-1">
                              <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase ${riskRatingColor(item.rating)}`}>
                                {item.rating} RISK
                              </span>
                              <p className="text-xs font-semibold text-foreground mt-1">{item.category}</p>
                            </div>
                          </div>
                          {/* Explanation */}
                          <div className="px-4 pb-3">
                            <p className="text-xs text-muted-foreground leading-relaxed">{item.explanation}</p>
                          </div>
                          {/* Positioning Mitigation */}
                          <div className="px-4 py-3 border-t border-border/60 bg-muted/20">
                            <p className="text-[10px] uppercase tracking-widest font-semibold text-primary mb-1">
                              Positioning Mitigation
                            </p>
                            <p className="text-xs text-foreground leading-relaxed">{item.mitigation}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {!effectiveIsPro && (
                    <div className="mt-4 pt-4 border-t border-border/50 flex flex-col items-start gap-3">
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        4 risk dimensions — Context, Signal, Stability, and Commercial Impact — are restricted to Pro.
                      </p>
                      <Button size="sm" className="gap-1.5 text-xs h-8 px-3">
                        <Lock className="h-3 w-3" />
                        Unlock Full Employer Intelligence
                      </Button>
                    </div>
                  )}
                </Section>
              )}

              {/* 3 — Repositioning Matrix */}
              <Section title="3. Experience Repositioning Matrix">
                <div className="space-y-3">
                  {result.repositioning_matrix.map((m, i) => (
                    <div key={i} className="rounded-md border bg-background p-3 space-y-2">
                      <p className="text-xs font-semibold text-foreground">{m.pillar}</p>
                      <div className="grid grid-cols-1 gap-1">
                        <div>
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Real Experience</span>
                          <p className="text-xs text-muted-foreground mt-0.5">{m.matching_experience}</p>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase tracking-wide text-primary font-medium">Role-Native Language</span>
                          <p className="text-xs text-foreground mt-0.5">{m.role_native_language}</p>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Transferable Complexity</span>
                          <p className="text-xs text-muted-foreground mt-0.5 italic">{m.transferable_complexity}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              {/* 4 — Commercial Value */}
              <Section title="4. Commercial Value Conversion">
                <div className="space-y-3">
                  {result.commercial_value_conversion.map((c, i) => (
                    <div key={i} className="rounded-md border bg-background p-3 space-y-1.5">
                      <div className="flex items-start gap-1.5">
                        <span className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground shrink-0 mt-0.5">Was:</span>
                        <p className="text-xs text-muted-foreground line-through">{c.original_framing}</p>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <span className="text-[10px] uppercase tracking-wide font-medium text-primary shrink-0 mt-0.5">Now:</span>
                        <p className="text-xs text-foreground font-medium">{c.commercial_reframe}</p>
                      </div>
                      {c.quantified_impact && (
                        <p className="text-[11px] text-muted-foreground italic">{c.quantified_impact}</p>
                      )}
                    </div>
                  ))}
                </div>
              </Section>

              {/* 5 — Gap Strategy */}
              <Section title="5. Gap Strategy">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-1.5">Hard Gaps</p>
                    <BulletList items={result.gap_strategy.hard_gaps} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-1.5">Perception Gaps</p>
                    <BulletList items={result.gap_strategy.perception_gaps} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-1.5">Mitigation</p>
                    <div className="space-y-2">
                      {result.gap_strategy.mitigation.map((m, i) => (
                        <div key={i} className="rounded-md border bg-background p-3 space-y-1.5">
                          <p className="text-xs font-semibold text-foreground">{m.gap}</p>
                          <p className="text-[11px] text-muted-foreground"><span className="font-medium text-foreground">Resume:</span> {m.resume_edit}</p>
                          <p className="text-[11px] text-muted-foreground"><span className="font-medium text-foreground">Interview:</span> {m.interview_narrative}</p>
                          {m.micro_credential !== "N/A" && (
                            <p className="text-[11px] text-muted-foreground"><span className="font-medium text-foreground">Credential:</span> {m.micro_credential}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Section>

              {/* 6 — Optimized Summary */}
              <Section title="6. Optimized Summary (Rebuilt Identity)" copyText={result.optimized_summary}>
                <p className="text-sm leading-relaxed text-muted-foreground">{result.optimized_summary}</p>
              </Section>

              {/* 7 — Bullet Rewrites */}
              <Section title="7. Bullet Rewrites (Elite Version)">
                <div className="space-y-3">
                  {result.bullet_rewrites.map((b, i) => (
                    <div key={i} className="rounded-md border bg-background p-3 space-y-2">
                      <p className="text-[11px] text-muted-foreground line-through leading-relaxed">{b.original}</p>
                      <div className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        <div className="flex-1 flex items-start justify-between gap-2">
                          <p className="text-xs font-medium text-foreground leading-relaxed">{b.rewritten}</p>
                          <CopyButton text={b.rewritten} label={`Bullet ${i + 1}`} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              {/* 8 — Interview Dominance Script */}
              <Section title="8. Interview Dominance Script" copyText={result.interview_dominance_script}>
                <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
                  {result.interview_dominance_script}
                </p>
              </Section>

              {/* 9 — Match Score Forecast */}
              <Section title="9. Match Score Forecast">
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Before</p>
                    <span className="text-2xl font-bold text-destructive">{result.match_score_forecast.before_percent}%</span>
                  </div>
                  <div className="flex-1 h-px bg-border" />
                  <div className="text-center">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">After</p>
                    <span className="text-2xl font-bold text-primary">{result.match_score_forecast.after_percent}%</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed mt-1">{result.match_score_forecast.rationale}</p>
              </Section>

              {/* ── STRATEGIC AUTHORITY LAYER ── */}

              {/* 10 — Market Position Assessment (always visible) */}
              {result.market_position_assessment && (
                <Section title="10. Market Position Assessment">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${levelColor(result.market_position_assessment.level)}`}>
                        {result.market_position_assessment.level}
                      </span>
                      {result.market_position_assessment.under_positioned && (
                        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive uppercase tracking-wide">
                          Under-positioned
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {result.market_position_assessment.explanation}
                    </p>
                    {result.market_position_assessment.under_positioned && result.market_position_assessment.under_positioned_explanation && (
                      <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3">
                        <p className="text-xs text-destructive/80 leading-relaxed">
                          {result.market_position_assessment.under_positioned_explanation}
                        </p>
                      </div>
                    )}
                  </div>
                </Section>
              )}

              {/* 11 — Competitive Risk Signals (free: 1–2, pro: all) */}
              {result.competitive_risk_signals && result.competitive_risk_signals.length > 0 && (
                <Section title="11. Competitive Risk Signals">
                  <div className="space-y-2">
                    {(effectiveIsPro
                      ? result.competitive_risk_signals
                      : result.competitive_risk_signals.slice(0, 2)
                    ).map((s, i) => (
                      <div key={i} className="rounded-md border bg-background p-3 space-y-1">
                        <p className="text-xs font-semibold text-foreground">{s.area}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{s.explanation}</p>
                      </div>
                    ))}
                    {!effectiveIsPro && result.competitive_risk_signals.length > 2 && (
                      <p className="text-[11px] text-muted-foreground pt-1">
                        {result.competitive_risk_signals.length - 2} additional risk signal{result.competitive_risk_signals.length - 2 !== 1 ? "s" : ""} available on Pro.
                      </p>
                    )}
                  </div>
                </Section>
              )}

              {/* 12 — Interview Trajectory (pro: full, free: locked) */}
              {result.interview_trajectory && (
                effectiveIsPro ? (
                  <Section title="12. Interview Trajectory Preview" proLabel>
                    <div className="space-y-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">
                          Likely Focus Areas
                        </p>
                        <BulletList items={result.interview_trajectory.likely_focus_areas} />
                      </div>
                      <div className="rounded-md border bg-background p-3 space-y-1">
                        <p className="text-[10px] uppercase tracking-wide text-destructive/70 font-medium">
                          Likely Objection
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {result.interview_trajectory.likely_objection}
                        </p>
                      </div>
                      <div className="rounded-md border bg-background p-3 space-y-1">
                        <p className="text-[10px] uppercase tracking-wide text-primary font-medium">
                          Strategic Angle to Emphasize
                        </p>
                        <p className="text-xs text-foreground leading-relaxed">
                          {result.interview_trajectory.strategic_angle}
                        </p>
                      </div>
                    </div>
                  </Section>
                ) : (
                  <LockedSection title="12. Interview Trajectory Preview" />
                )
              )}

              {/* Download */}
              <div className="flex items-center gap-3 pt-2">
                <Button variant="outline" size="sm" onClick={handleDownload} className="gap-2">
                  <Download className="h-3.5 w-3.5" />
                  Download Full Package
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Position;
