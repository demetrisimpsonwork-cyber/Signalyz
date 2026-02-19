import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, Copy, Check, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface BridgeSection {
  why_it_translates: string[];
  perception_gaps: string[];
  interview_narrative: string[];
  winning_angle: string;
}

interface PositioningResult {
  professional_summary: string;
  strategic_bridge: BridgeSection;
  cover_letter: string;
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
    const lines = [
      "RESUMIX — TITAN POSITIONING ENGINE V1",
      "======================================",
      "",
      "PROFESSIONAL SUMMARY",
      result.professional_summary,
      "",
      "STRATEGIC BRIDGE",
      "Why It Translates:",
      ...bridge.why_it_translates.map((b) => `  • ${b}`),
      "",
      "Perception Gaps:",
      ...bridge.perception_gaps.map((b) => `  • ${b}`),
      "",
      "Interview Narrative:",
      ...bridge.interview_narrative.map((b) => `  • ${b}`),
      "",
      `Winning Angle: ${bridge.winning_angle}`,
      "",
      "COVER LETTER",
      result.cover_letter,
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
          Titan Positioning Engine
        </h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          Strategically reposition your real experience to match the employer's business model, mission, and role seniority — with a full summary and cover letter. No fabrication.
        </p>
      </div>

      <div className="mb-10 mx-auto max-w-2xl">
        <ol className="space-y-5">
          {[
            { step: "Reframe Your Experience", desc: "Elevate task-based descriptions into value-based business language." },
            { step: "Bridge Domain Gaps", desc: "Translate public sector, operations, or other backgrounds into the employer's language." },
            { step: "Generate Your Positioning Package", desc: "Receive an executive summary, strategic narrative, and tailored cover letter." },
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
            <label className="mb-1.5 block text-sm font-medium text-foreground">Your Experience</label>
            <p className="mb-1.5 text-xs text-muted-foreground">
              Paste your resume summary, a few bullets, or a short section. The more context, the better.
            </p>
            <Textarea
              placeholder="Paste your experience here..."
              value={experience}
              onChange={(e) => { setExperience(e.target.value); setErrors((p) => ({ ...p, experience: undefined })); }}
              rows={7}
              className={errors.experience ? "border-destructive" : ""}
            />
            {errors.experience && <p className="mt-1 text-xs text-destructive">{errors.experience}</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Target Job Description</label>
            <p className="mb-1.5 text-xs text-muted-foreground">
              Paste the full job description. We'll extract priorities and mission language.
            </p>
            <Textarea
              placeholder="Paste the job description..."
              value={jd}
              onChange={(e) => { setJd(e.target.value); setErrors((p) => ({ ...p, jd: undefined })); }}
              rows={7}
              className={errors.jd ? "border-destructive" : ""}
            />
            {errors.jd && <p className="mt-1 text-xs text-destructive">{errors.jd}</p>}
          </div>

          <Button onClick={handleRun} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate Positioning Package
          </Button>
          <p className="text-xs text-muted-foreground">
            Takes 15–20 seconds. Executive-level. Zero fabrication.
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
              <Section
                title="Professional Summary"
                copyText={result.professional_summary}
              >
                <p className="text-sm leading-relaxed text-muted-foreground">{result.professional_summary}</p>
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
                  <div className="rounded-md bg-secondary/50 px-3 py-2">
                    <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-1">Winning Angle</p>
                    <p className="text-sm text-muted-foreground">{result.strategic_bridge.winning_angle}</p>
                  </div>
                </div>
              </Section>

              <Section
                title="Cover Letter — Pinnacle Format"
                copyText={result.cover_letter}
              >
                <div className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {result.cover_letter}
                </div>
              </Section>

              <Section title="Positioning Intelligence">
                <p className="text-sm leading-relaxed text-muted-foreground">{result.positioning_intelligence}</p>
              </Section>

              <div className="flex items-center gap-3 pt-2">
                <Button variant="outline" size="sm" onClick={handleDownload} className="gap-2">
                  <Download className="h-3.5 w-3.5" />
                  Download Package
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
