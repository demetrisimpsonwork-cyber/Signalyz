import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface LinkedInSignalTabProps {
  experience: string;
  inferredRole: string;
}

interface HeadlineVariant {
  label: string;
  text: string;
}

const LinkedInSignalTab = ({ experience, inferredRole }: LinkedInSignalTabProps) => {
  const [headline, setHeadline] = useState("");
  const [aboutSection, setAboutSection] = useState("");
  const [headlineVariants, setHeadlineVariants] = useState<HeadlineVariant[]>([]);
  const [calibratedAbout, setCalibratedAbout] = useState("");
  const [loadingHeadline, setLoadingHeadline] = useState(false);
  const [loadingAbout, setLoadingAbout] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<string | null>(null);

  const handleCopy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedIdx(key);
    toast.success("Copied", { duration: 1500 });
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  const calibrateHeadline = async () => {
    setLoadingHeadline(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-pro-content", {
        body: { type: "linkedin_headline", experience, currentHeadline: headline, inferredRole },
      });
      if (error) throw error;
      if (Array.isArray(data)) setHeadlineVariants(data);
    } catch { toast.error("Failed to generate headlines."); }
    finally { setLoadingHeadline(false); }
  };

  const calibrateAbout = async () => {
    setLoadingAbout(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-pro-content", {
        body: { type: "linkedin_summary", experience, currentAbout: aboutSection, inferredRole },
      });
      if (error) throw error;
      if (data?.summary) setCalibratedAbout(data.summary);
    } catch { toast.error("Failed to calibrate summary."); }
    finally { setLoadingAbout(false); }
  };

  if (!inferredRole) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <p className="text-sm text-muted-foreground">Run an alignment first to get role-targeted LinkedIn calibration</p>
        <Button variant="outline" size="sm" onClick={() => document.getElementById("alignment-tool")?.scrollIntoView({ behavior: "smooth" })}>
          Run Alignment →
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Headline Calibrator */}
      <div className="space-y-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground" style={{ letterSpacing: "0.15em" }}>LinkedIn Headline Calibrator</p>
          <p className="text-xs text-muted-foreground mt-1">Calibrate your full professional identity</p>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Your current LinkedIn headline</label>
          <Textarea
            placeholder="Paste your current headline here..."
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            rows={2}
          />
          <p className="text-xs text-muted-foreground">No headline yet? Leave blank and we'll build from your resume.</p>
        </div>
        <Button onClick={calibrateHeadline} disabled={loadingHeadline} className="w-full gap-2">
          {loadingHeadline ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Calibrate My Headline
        </Button>
        {headlineVariants.length > 0 && (
          <div className="space-y-3">
            {headlineVariants.map((v, i) => (
              <div key={i} className="rounded-lg border bg-card p-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">{v.label}</p>
                  <p className="text-sm text-foreground mt-1">{v.text}</p>
                </div>
                <button onClick={() => handleCopy(v.text, `h${i}`)} className="shrink-0 p-1 rounded hover:bg-secondary">
                  {copiedIdx === `h${i}` ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary Calibrator */}
      <div className="space-y-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground" style={{ letterSpacing: "0.15em" }}>LinkedIn Summary Calibrator</p>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Your current LinkedIn About section</label>
          <Textarea
            placeholder="Paste your current About section... or leave blank to build from scratch."
            value={aboutSection}
            onChange={(e) => setAboutSection(e.target.value)}
            rows={5}
          />
        </div>
        <Button onClick={calibrateAbout} disabled={loadingAbout} className="w-full gap-2">
          {loadingAbout ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Calibrate My Summary
        </Button>
        {calibratedAbout && (
          <div className="rounded-lg border-l-4 border-l-primary border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{calibratedAbout}</p>
              <button onClick={() => handleCopy(calibratedAbout, "about")} className="shrink-0 p-1 rounded hover:bg-secondary">
                {copiedIdx === "about" ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LinkedInSignalTab;
