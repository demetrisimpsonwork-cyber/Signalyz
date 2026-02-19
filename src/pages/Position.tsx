import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, Copy, Check, Download, Lock } from "lucide-react";
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

// ─── Blurred Pro Teaser ───────────────────────────────────────────────────────

const LockedSection = ({ title }: { title: string }) => (
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
      <p className="text-xs font-medium text-foreground text-center px-6">
        Unlock Strategic Interview Forecasting with Pro
      </p>
    </div>
  </div>
);

// ─── Main Page ────────────────────────────────────────────────────────────────

const Position = () => {
  const [experience, setExperience] = useState("");
  const [jd, setJd] = useState("");
  const [result, setResult] = useState<PositioningResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ experience?: string; jd?: string }>({});

  const isAdmin = useIsAdmin();
  const { isTrialPro } = useReverseTrial();
  // TODO: replace with real pro check when Stripe is wired up
  const isPro = false;
  const effectiveIsPro = isPro || isAdmin || isTrialPro;

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
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("titan-position", {
        body: { experience: experience.trim(), jd: jd.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data as PositioningResult);
    } catch (err: any) {
      toast.error(err.message || "Something went wrong. Please try again.");
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
            <label className="mb-1.5 block text-sm font-medium text-foreground">Your Resume / Experience</label>
            <p className="mb-1.5 text-xs text-muted-foreground">
              Paste your full resume, summary, or most relevant role. More context yields stronger output.
            </p>
            <Textarea
              placeholder="Paste your experience here..."
              value={experience}
              onChange={(e) => { setExperience(e.target.value); setErrors((p) => ({ ...p, experience: undefined })); }}
              rows={9}
              className={errors.experience ? "border-destructive" : ""}
            />
            {errors.experience && <p className="mt-1 text-xs text-destructive">{errors.experience}</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Target Job Description</label>
            <p className="mb-1.5 text-xs text-muted-foreground">
              Paste the full job description. We extract the employer's identity priorities, not just keywords.
            </p>
            <Textarea
              placeholder="Paste the job description..."
              value={jd}
              onChange={(e) => { setJd(e.target.value); setErrors((p) => ({ ...p, jd: undefined })); }}
              rows={9}
              className={errors.jd ? "border-destructive" : ""}
            />
            {errors.jd && <p className="mt-1 text-xs text-destructive">{errors.jd}</p>}
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
            <div className="flex h-80 items-center justify-center rounded-lg border bg-card">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-sm">Extracting Role DNA and repositioning your experience…</span>
              </div>
            </div>
          )}

          {!loading && !result && (
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

              {/* 2 — Repositioning Matrix */}
              <Section title="2. Experience Repositioning Matrix">
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

              {/* 3 — Commercial Value */}
              <Section title="3. Commercial Value Conversion">
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

              {/* 4 — Gap Strategy */}
              <Section title="4. Gap Strategy">
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

              {/* 5 — Optimized Summary */}
              <Section title="5. Optimized Summary (Rebuilt Identity)" copyText={result.optimized_summary}>
                <p className="text-sm leading-relaxed text-muted-foreground">{result.optimized_summary}</p>
              </Section>

              {/* 6 — Bullet Rewrites */}
              <Section title="6. Bullet Rewrites (Elite Version)">
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

              {/* 7 — Interview Dominance Script */}
              <Section title="7. Interview Dominance Script" copyText={result.interview_dominance_script}>
                <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
                  {result.interview_dominance_script}
                </p>
              </Section>

              {/* 8 — Match Score Forecast */}
              <Section title="8. Match Score Forecast">
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

              {/* 9 — Market Position Assessment (always visible) */}
              {result.market_position_assessment && (
                <Section title="9. Market Position Assessment">
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

              {/* 10 — Competitive Risk Signals (free: 1–2, pro: all) */}
              {result.competitive_risk_signals && result.competitive_risk_signals.length > 0 && (
                <Section title="10. Competitive Risk Signals">
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

              {/* 11 — Interview Trajectory (pro: full, free: locked) */}
              {result.interview_trajectory && (
                effectiveIsPro ? (
                  <Section title="11. Interview Trajectory Preview" proLabel>
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
                  <LockedSection title="11. Interview Trajectory Preview" />
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
