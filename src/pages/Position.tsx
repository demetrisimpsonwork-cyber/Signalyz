import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, Copy, Check, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface InterviewScript {
  pitch_30s: string;
  pivot_90s: string;
  why_choose_you: string;
  biggest_gap: string;
}

interface BridgeSection {
  why_it_translates: string[];
  perception_gaps: string[];
  interview_narrative: string[];
}

interface PositioningResult {
  professional_summary: string;
  winning_angle: string;
  cover_letter: string;
  strategic_bridge: BridgeSection;
  interview_script: InterviewScript;
  positioning_intelligence: string;
}

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

const Section = ({ title, children, copyText }: { title: string; children: React.ReactNode; copyText?: string }) => (
  <div className="rounded-lg border bg-card p-4 space-y-2">
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {copyText && <CopyButton text={copyText} label={title} />}
    </div>
    {children}
  </div>
);

const BulletList = ({ items }: { items: string[] }) => (
  <ul className="space-y-1.5 mt-1">
    {items.map((item, i) => (
      <li key={i} className="flex gap-2 text-sm text-muted-foreground leading-relaxed">
        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary opacity-60" />
        {item}
      </li>
    ))}
  </ul>
);

const ScriptBlock = ({ label, content }: { label: string; content: string }) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between">
      <p className="text-xs font-semibold text-foreground uppercase tracking-wide">{label}</p>
      <CopyButton text={content} label={label} />
    </div>
    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{content}</p>
  </div>
);

const Position = () => {
  const [experience, setExperience] = useState("");
  const [jd, setJd] = useState("");
  const [result, setResult] = useState<PositioningResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ experience?: string; jd?: string }>({});

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
    const bridge = result.strategic_bridge;
    const script = result.interview_script;
    const lines = [
      "RESUMIX — STRATEGIC POSITIONING ENGINE",
      "=======================================",
      "",
      "PROFESSIONAL SUMMARY",
      result.professional_summary,
      "",
      "WINNING ANGLE",
      result.winning_angle,
      "",
      "COVER LETTER",
      result.cover_letter,
      "",
      "STRATEGIC BRIDGE ANALYSIS",
      "Why It Translates:",
      ...bridge.why_it_translates.map((b) => `  • ${b}`),
      "",
      "Perception Gaps:",
      ...bridge.perception_gaps.map((b) => `  • ${b}`),
      "",
      "Interview Narrative:",
      ...bridge.interview_narrative.map((b) => `  • ${b}`),
      "",
      "INTERVIEW POSITIONING SCRIPTS",
      "30-Second Pitch:",
      script.pitch_30s,
      "",
      "90-Second Pivot Explanation:",
      script.pivot_90s,
      "",
      "Why Should We Choose You?",
      script.why_choose_you,
      "",
      "What Is Your Biggest Gap?",
      script.biggest_gap,
      "",
      "POSITIONING INTELLIGENCE",
      result.positioning_intelligence,
    ];
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
      <div className="mb-8 text-center max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Strategic Positioning Engine
        </h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          Reposition your real experience into the strongest commercially relevant narrative — executive summary, cover letter, strategic bridge, and interview scripts. Zero fabrication.
        </p>
      </div>

      <div className="mb-10 mx-auto max-w-2xl">
        <ol className="space-y-5">
          {[
            { step: "Reframe Your Experience", desc: "Elevate task-based descriptions into value-based business language." },
            { step: "Bridge Domain Gaps", desc: "Translate regulated, public sector, or operations backgrounds into commercial language." },
            { step: "Get Your Full Package", desc: "Executive summary, cover letter, strategic bridge analysis, and ready-to-use interview scripts." },
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
              Paste your full resume, summary, or key experience section. More context yields stronger output.
            </p>
            <Textarea
              placeholder="Paste your experience here..."
              value={experience}
              onChange={(e) => { setExperience(e.target.value); setErrors((p) => ({ ...p, experience: undefined })); }}
              rows={8}
              className={errors.experience ? "border-destructive" : ""}
            />
            {errors.experience && <p className="mt-1 text-xs text-destructive">{errors.experience}</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Target Job Description</label>
            <p className="mb-1.5 text-xs text-muted-foreground">
              Paste the full job description. We'll extract the employer's priorities and mission language.
            </p>
            <Textarea
              placeholder="Paste the job description..."
              value={jd}
              onChange={(e) => { setJd(e.target.value); setErrors((p) => ({ ...p, jd: undefined })); }}
              rows={8}
              className={errors.jd ? "border-destructive" : ""}
            />
            {errors.jd && <p className="mt-1 text-xs text-destructive">{errors.jd}</p>}
          </div>

          <Button onClick={handleRun} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate Positioning Package
          </Button>
          <p className="text-xs text-muted-foreground">
            Takes 20–30 seconds. Executive-level output. Zero fabrication.
          </p>
        </div>

        {/* Right — Results */}
        <div className="space-y-4">
          {loading && (
            <div className="flex h-72 items-center justify-center rounded-lg border bg-card">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-sm">Generating your positioning package…</span>
              </div>
            </div>
          )}

          {!loading && !result && (
            <div className="flex h-72 items-center justify-center rounded-lg border border-dashed bg-card">
              <p className="text-sm text-muted-foreground">Your positioning package will appear here</p>
            </div>
          )}

          {result && (
            <>
              <Section title="Professional Summary" copyText={result.professional_summary}>
                <p className="text-sm leading-relaxed text-muted-foreground">{result.professional_summary}</p>
              </Section>

              <Section title="Winning Angle" copyText={result.winning_angle}>
                <p className="text-sm leading-relaxed text-muted-foreground">{result.winning_angle}</p>
              </Section>

              <Section title="Cover Letter — Pinnacle Format" copyText={result.cover_letter}>
                <div className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {result.cover_letter}
                </div>
              </Section>

              <Section title="Strategic Bridge Analysis">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Why It Translates</p>
                    <BulletList items={result.strategic_bridge.why_it_translates} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Perception Gaps</p>
                    <BulletList items={result.strategic_bridge.perception_gaps} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Interview Narrative</p>
                    <BulletList items={result.strategic_bridge.interview_narrative} />
                  </div>
                </div>
              </Section>

              <Section title="Interview Positioning Scripts">
                <div className="space-y-4">
                  <ScriptBlock label="30-Second Pitch" content={result.interview_script.pitch_30s} />
                  <div className="border-t pt-3">
                    <ScriptBlock label="90-Second Pivot Explanation" content={result.interview_script.pivot_90s} />
                  </div>
                  <div className="border-t pt-3">
                    <ScriptBlock label="Why Should We Choose You?" content={result.interview_script.why_choose_you} />
                  </div>
                  <div className="border-t pt-3">
                    <ScriptBlock label="What Is Your Biggest Gap?" content={result.interview_script.biggest_gap} />
                  </div>
                </div>
              </Section>

              <Section title="Positioning Intelligence">
                <p className="text-sm leading-relaxed text-muted-foreground">{result.positioning_intelligence}</p>
              </Section>

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
