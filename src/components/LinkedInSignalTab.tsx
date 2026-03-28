import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Check, Loader2, ArrowRight, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

/* ─── Types ──────────────────────────────────────────────────────── */

interface LinkedInSignalTabProps {
  experience: string;
  inferredRole: string;
  signalKeywords?: string[];
  onRunAlignment?: () => void;
  isPro?: boolean;
  onUpgrade?: () => void;
  alignmentResult?: Record<string, unknown>;
}

interface LinkedInOutput {
  headline: { headline: string; signal_basis: string } | null;
  aboutGuidance: AboutGuidanceItem[] | null;
  experienceNotes: ExperienceNoteItem[] | null;
}

interface AboutGuidanceItem {
  gap_addressed: string;
  suggestion: string;
  resume_evidence: string;
}

interface ExperienceNoteItem {
  role_title: string;
  company: string;
  note: string;
}

const STORAGE_KEY = "signalyz_linkedin_output";

const CALIBRATION_STEPS = [
  "Mapping role signal keywords to LinkedIn context…",
  "Repositioning headline for recruiter pattern match…",
  "Generating About section guidance…",
  "Building experience framing notes…",
];

/* ─── Persistence helpers ────────────────────────────────────────── */

function saveLinkedInOutput(output: LinkedInOutput) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, ...output, ts: Date.now() }));
  } catch {}
}

function loadLinkedInOutput(): LinkedInOutput | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== 1) return null;
    // Expire after 24 hours
    if (Date.now() - (parsed.ts || 0) > 86400000) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      headline: parsed.headline || null,
      aboutGuidance: parsed.aboutGuidance || null,
      experienceNotes: parsed.experienceNotes || null,
    };
  } catch {
    return null;
  }
}

/* ─── Pro Gate Card (reused pattern) ─────────────────────────────── */

function ProGateCard({ title, description, onUpgrade }: { title: string; description: string; onUpgrade?: () => void }) {
  return (
    <div className="rounded-lg border border-dashed bg-card p-5 space-y-3 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
        <Lock className="h-4 w-4 text-primary" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-md mx-auto">{description}</p>
      </div>
      {onUpgrade && (
        <Button onClick={onUpgrade} size="sm" className="gap-1.5">
          Unlock Full Signal Intelligence →
        </Button>
      )}
    </div>
  );
}

/* ─── Copy Button ────────────────────────────────────────────────── */

function CopyButton({ text, id, copiedId, onCopy }: { text: string; id: string; copiedId: string | null; onCopy: (text: string, id: string) => void }) {
  return (
    <button onClick={() => onCopy(text, id)} className="shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center rounded hover:bg-secondary" title="Copy">
      {copiedId === id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
    </button>
  );
}

/* ─── Main Component ─────────────────────────────────────────────── */

const LinkedInSignalTab = ({
  experience,
  inferredRole,
  signalKeywords = [],
  onRunAlignment,
  isPro = false,
  onUpgrade,
  alignmentResult,
}: LinkedInSignalTabProps) => {
  const [headline, setHeadline] = useState("");
  const [aboutSection, setAboutSection] = useState("");
  const [output, setOutput] = useState<LinkedInOutput>({ headline: null, aboutGuidance: null, experienceNotes: null });
  const [loading, setLoading] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const { user } = useAuth();

  // Restore persisted output on mount
  useEffect(() => {
    const saved = loadLinkedInOutput();
    if (saved) setOutput(saved);
  }, []);

  const handleCopy = useCallback(async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedIdx(key);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedIdx(null), 1500);
  }, []);

  const calibrateAll = async () => {
    setLoading(true);
    setStep(0);
    const stepTimers = [
      setTimeout(() => setStep(1), 2000),
      setTimeout(() => setStep(2), 4500),
      setTimeout(() => setStep(3), 7000),
    ];

    try {
      // 1. Headline (always generated — free)
      const headlineRes = await supabase.functions.invoke("generate-pro-content", {
        body: {
          type: "linkedin_headline",
          experience,
          currentHeadline: headline,
          inferredRole,
          alignmentResult: alignmentResult || {},
        },
      });

      if (headlineRes.error) throw headlineRes.error;
      if (checkUsageLimitData(headlineRes.data)) { stepTimers.forEach(clearTimeout); setLoading(false); return; }
      const headlineData = headlineRes.data?.headline ? headlineRes.data : null;

      // 2. About guidance + Experience notes (Pro only)
      let aboutData: AboutGuidanceItem[] | null = null;
      let expData: ExperienceNoteItem[] | null = null;

      if (isPro) {
        const [aboutRes, expRes] = await Promise.all([
          supabase.functions.invoke("generate-pro-content", {
            body: {
              type: "linkedin_about_guidance",
              experience,
              currentAbout: aboutSection,
              inferredRole,
              alignmentResult: alignmentResult || {},
            },
          }),
          supabase.functions.invoke("generate-pro-content", {
            body: {
              type: "linkedin_experience_notes",
              experience,
              inferredRole,
              alignmentResult: alignmentResult || {},
            },
          }),
        ]);

        if (checkUsageLimitData(aboutRes.data) || checkUsageLimitData(expRes.data)) { stepTimers.forEach(clearTimeout); setLoading(false); return; }

        if (aboutRes.error) console.warn("About guidance error:", aboutRes.error);
        if (expRes.error) console.warn("Experience notes error:", expRes.error);

        if (Array.isArray(aboutRes.data)) aboutData = aboutRes.data;
        if (Array.isArray(expRes.data)) expData = expRes.data;
      }

      stepTimers.forEach(clearTimeout);

      const newOutput: LinkedInOutput = {
        headline: headlineData,
        aboutGuidance: aboutData,
        experienceNotes: expData,
      };
      setOutput(newOutput);
      saveLinkedInOutput(newOutput);
    } catch (e) {
      if (handleUsageLimitError(e)) { setLoading(false); return; }
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

  const hasResults = !!output.headline;

  return (
    <div className="space-y-6">
      {/* Context header */}
      <div className="rounded-lg border bg-card px-4 py-4 space-y-3">
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-sm font-medium text-foreground">
            LinkedIn Signal Calibration — <span className="text-primary">{inferredRole}</span>
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Your resume and LinkedIn send two separate signals. This tool repositions your headline, About section, and experience entries to match the same role signal your calibrated resume targets.
          </p>
        </div>
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

      {/* Loading state */}
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

      {/* ═══════ RESULTS ═══════ */}

      {/* 1. Headline — FREE */}
      {!loading && output.headline && (
        <div className="space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] font-semibold text-primary/70 mb-1">Calibrated Output</p>
            <p className="section-label">Repositioned Headline</p>
            <p className="text-xs text-muted-foreground mt-1">
              Based on your strongest signal for <span className="font-medium text-foreground">{inferredRole}</span>.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Before</p>
              <p className="text-sm text-muted-foreground">{headline || <span className="italic">No headline provided</span>}</p>
            </div>
            <div className="rounded-lg border border-primary/20 bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-primary mb-1">Repositioned</p>
                  <p className="text-sm text-foreground break-words">{output.headline.headline}</p>
                </div>
                <CopyButton text={output.headline.headline} id="headline" copiedId={copiedIdx} onCopy={handleCopy} />
              </div>
            </div>
          </div>
          {output.headline.signal_basis && (
            <p className="text-[11px] text-muted-foreground leading-relaxed px-1">
              <span className="font-medium text-foreground">Signal basis:</span> {output.headline.signal_basis}
            </p>
          )}
        </div>
      )}

      {/* 2. About Section Guidance — PRO GATED */}
      {!loading && hasResults && (
        <div className="space-y-3">
          <div>
            <p className="section-label">About Section Guidance</p>
            <p className="text-xs text-muted-foreground mt-1">
              Specific repositioning suggestions based on your signal gaps.
            </p>
          </div>

          {!isPro ? (
            <ProGateCard
              title="Your About section is sending a different signal than your resume"
              description="Get 3 specific, gap-based suggestions for repositioning your About section to match your calibrated resume signal."
              onUpgrade={onUpgrade}
            />
          ) : output.aboutGuidance && output.aboutGuidance.length > 0 ? (
            <div className="space-y-3">
              {output.aboutGuidance.map((item, i) => (
                <div key={i} className="rounded-lg border bg-card p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-primary">{i + 1}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-destructive/10 text-destructive border border-destructive/20">
                          {item.gap_addressed}
                        </span>
                      </div>
                      <p className="text-sm text-foreground leading-relaxed">{item.suggestion}</p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        <span className="font-medium text-foreground">Based on:</span> {item.resume_evidence}
                      </p>
                    </div>
                    <CopyButton text={item.suggestion} id={`about-${i}`} copiedId={copiedIdx} onCopy={handleCopy} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">Click "Calibrate My LinkedIn Signal" to generate guidance.</p>
          )}
        </div>
      )}

      {/* 3. Experience Framing Notes — PRO GATED */}
      {!loading && hasResults && (
        <div className="space-y-3">
          <div>
            <p className="section-label">Experience Framing Notes</p>
            <p className="text-xs text-muted-foreground mt-1">
              How each LinkedIn experience entry should differ from your resume version for recruiter discoverability.
            </p>
          </div>

          {!isPro ? (
            <ProGateCard
              title="Your LinkedIn experience entries need separate positioning"
              description="Get role-by-role guidance on how to reframe each LinkedIn experience entry for recruiter search and discoverability."
              onUpgrade={onUpgrade}
            />
          ) : output.experienceNotes && output.experienceNotes.length > 0 ? (
            <div className="space-y-3">
              {output.experienceNotes.map((item, i) => (
                <div key={i} className="rounded-lg border bg-card p-4 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <p className="text-xs font-semibold text-foreground">
                        {item.role_title} <span className="text-muted-foreground font-normal">— {item.company}</span>
                      </p>
                      <p className="text-sm text-foreground leading-relaxed">{item.note}</p>
                    </div>
                    <CopyButton text={item.note} id={`exp-${i}`} copiedId={copiedIdx} onCopy={handleCopy} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">Click "Calibrate My LinkedIn Signal" to generate notes.</p>
          )}
        </div>
      )}

      {/* Signal consistency explanation */}
      {!loading && hasResults && (
        <div className="rounded-lg border border-primary/10 bg-primary/5 px-4 py-3 space-y-1">
          <p className="text-xs font-medium text-foreground">Why this matters</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            72% of recruiters check LinkedIn before reading a resume. When your headline and experience entries send the same signal as your calibrated resume, you pass the consistency check that most candidates fail — creating a unified professional identity across every touchpoint.
          </p>
        </div>
      )}
    </div>
  );
};

export default LinkedInSignalTab;
