import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface LinkedInSignalTabProps {
  experience: string;
  inferredRole: string;
  signalKeywords?: string[];
  onRunAlignment?: () => void;
}

interface HeadlineVariant {
  label: string;
  text: string;
}

const LinkedInSignalTab = ({ experience, inferredRole, signalKeywords = [], onRunAlignment }: LinkedInSignalTabProps) => {
  const [headline, setHeadline] = useState("");
  const [aboutSection, setAboutSection] = useState("");
  const [headlineVariants, setHeadlineVariants] = useState<HeadlineVariant[]>([]);
  const [calibratedAbout, setCalibratedAbout] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<string | null>(null);

  const handleCopy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedIdx(key);
    toast.success("Copied", { duration: 1500 });
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  const calibrateAll = async () => {
    setLoading(true);
    try {
      // Run both in parallel
      const [headlineRes, aboutRes] = await Promise.all([
        supabase.functions.invoke("generate-pro-content", {
          body: { type: "linkedin_headline", experience, currentHeadline: headline, inferredRole },
        }),
        supabase.functions.invoke("generate-pro-content", {
          body: { type: "linkedin_summary", experience, currentAbout: aboutSection, inferredRole },
        }),
      ]);
      if (headlineRes.error) throw headlineRes.error;
      if (aboutRes.error) throw aboutRes.error;
      if (Array.isArray(headlineRes.data)) setHeadlineVariants(headlineRes.data);
      if (aboutRes.data?.summary) setCalibratedAbout(aboutRes.data.summary);
    } catch {
      toast.error("Failed to calibrate LinkedIn profile.");
    } finally {
      setLoading(false);
    }
  };

  if (!inferredRole) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <p className="text-sm text-muted-foreground">Run an alignment first to get role-targeted LinkedIn calibration</p>
        <Button variant="outline" size="sm" onClick={onRunAlignment}>
          Run Alignment →
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Context card */}
      <div className="rounded-lg border bg-card px-4 py-3">
        <p className="text-sm font-medium text-foreground">
          Calibrating LinkedIn for: <span className="text-primary">{inferredRole}</span>
        </p>
      </div>

      {/* Signal keywords */}
      {signalKeywords.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Your Resume Signal Keywords</p>
          <div className="flex flex-wrap gap-2">
            {signalKeywords.slice(0, 5).map((kw, i) => (
              <span key={i} className="px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                {kw}
              </span>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">Your LinkedIn will be optimized around these signals.</p>
        </div>
      )}

      {/* Headline input */}
      <div className="space-y-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground" style={{ letterSpacing: "0.15em" }}>LinkedIn Headline</p>
          <p className="text-xs text-muted-foreground mt-1">Paste your current headline, or leave blank to build from scratch.</p>
        </div>
        <Textarea
          placeholder="Paste your current headline here..."
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          rows={2}
        />
      </div>

      {/* About input */}
      <div className="space-y-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground" style={{ letterSpacing: "0.15em" }}>LinkedIn About Section</p>
          <p className="text-xs text-muted-foreground mt-1">Paste your current About section, or leave blank.</p>
        </div>
        <Textarea
          placeholder="Paste your current About section..."
          value={aboutSection}
          onChange={(e) => setAboutSection(e.target.value)}
          rows={5}
        />
      </div>

      {/* Single CTA */}
      <Button onClick={calibrateAll} disabled={loading} className="w-full gap-2">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span style={{ color: "inherit" }}>✦</span>}
        Calibrate My LinkedIn Profile
      </Button>

      {/* Results: Headlines */}
      {headlineVariants.length > 0 && (
        <div className="space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Headline Variants</p>
          {headlineVariants.map((v, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Before */}
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Before</p>
                <p className="text-sm text-muted-foreground">{headline || <span className="italic">No headline provided</span>}</p>
              </div>
              {/* After */}
              <div className="rounded-lg border border-primary/20 bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-primary mb-1">{v.label}</p>
                    <p className="text-sm text-foreground">{v.text}</p>
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
      {calibratedAbout && (
        <div className="space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">About Section</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Before */}
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Before</p>
              <p className="text-sm text-muted-foreground whitespace-pre-line">{aboutSection || <span className="italic">No About section provided</span>}</p>
            </div>
            {/* After */}
            <div className="rounded-lg border-l-4 border-l-primary border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-primary mb-1">Calibrated</p>
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{calibratedAbout}</p>
                </div>
                <button onClick={() => handleCopy(calibratedAbout, "about")} className="shrink-0 p-1 rounded hover:bg-secondary">
                  {copiedIdx === "about" ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LinkedInSignalTab;
