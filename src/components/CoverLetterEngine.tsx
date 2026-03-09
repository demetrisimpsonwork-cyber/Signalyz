import { useState, useMemo, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, RefreshCw, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { saveAs } from "file-saver";
import { extractContactFromText } from "@/lib/contactExtractor";

interface CoverLetterEngineProps {
  experience: string;
  jd: string;
  alignmentResult: Record<string, unknown>;
  inferredRole: string;
  isPro: boolean;
  onUpgrade: () => void;
}

type Tone = "confident" | "strategic" | "direct";

const TONES: { value: Tone; label: string }[] = [
  { value: "confident", label: "Confident" },
  { value: "strategic", label: "Strategic" },
  { value: "direct", label: "Direct" },
];

const STEPS = [
  "Extracting role hiring signals…",
  "Calibrating your narrative…",
  "Assembling cover letter…",
];

/** Try to extract a company name from the JD text */
function inferCompanyName(jd: string): string | undefined {
  if (!jd) return undefined;
  // Common patterns: "at CompanyName", "Company: CompanyName", "About CompanyName"
  const patterns = [
    /(?:company|employer|organization)[:\s]+([A-Z][\w &.,'-]+)/i,
    /(?:about|join|at)\s+([A-Z][\w &.,'-]{2,40})(?:\s*[,.\n])/i,
  ];
  for (const rx of patterns) {
    const m = jd.match(rx);
    if (m?.[1] && m[1].length < 50) return m[1].trim();
  }
  return undefined;
}

/** Try to extract a hiring manager name from the JD */
function inferHiringManager(jd: string): string | undefined {
  if (!jd) return undefined;
  const patterns = [
    /(?:hiring\s+manager|recruiter|contact)[:\s]+([A-Z][a-z]+\s+[A-Z][a-z]+)/i,
    /(?:report(?:s|ing)\s+to)[:\s]+([A-Z][a-z]+\s+[A-Z][a-z]+)/i,
  ];
  for (const rx of patterns) {
    const m = jd.match(rx);
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}

function formatDate(): string {
  return new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

const CoverLetterEngine = ({ experience, jd, alignmentResult, inferredRole, isPro, onUpgrade }: CoverLetterEngineProps) => {
  const [loading, setLoading] = useState(false);
  const [letter, setLetter] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tone, setTone] = useState<Tone>("confident");
  const [step, setStep] = useState(0);
  const [hasGenerated, setHasGenerated] = useState(false);

  const contact = useMemo(() => extractContactFromText(experience), [experience]);
  const companyName = useMemo(() => inferCompanyName(jd), [jd]);
  const hiringManager = useMemo(() => inferHiringManager(jd), [jd]);

  const salutation = hiringManager ? `Dear ${hiringManager},` : "Dear Hiring Manager,";

  const generate = async () => {
    if (!isPro) { onUpgrade(); return; }
    setLoading(true);
    setError(null);
    setLetter("");
    setStep(0);

    const stepTimers = [
      setTimeout(() => setStep(1), 1200),
      setTimeout(() => setStep(2), 2800),
    ];

    try {
      if (!experience?.trim() || !jd?.trim()) {
        throw new Error("Missing resume or job description content.");
      }
      const { data, error: fnError } = await supabase.functions.invoke("generate-pro-content", {
        body: {
          type: "cover_letter",
          experience: experience.trim(),
          jd: jd.trim(),
          alignmentResult: alignmentResult || {},
          inferredRole: inferredRole || "",
          companyName: companyName || "",
          tone,
        },
      });

      stepTimers.forEach(clearTimeout);

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      if (!data?.letter) throw new Error("No letter content returned.");
      setLetter(data.letter || "");
      setHasGenerated(true);
      setStep(3);
    } catch (e: any) {
      stepTimers.forEach(clearTimeout);
      const msg = e?.message || "Cover letter generation failed.";
      console.error("Cover letter generation error:", msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Auto-regenerate when tone changes after first generation
  const prevToneRef = useRef(tone);
  useEffect(() => {
    if (prevToneRef.current !== tone && hasGenerated && !loading) {
      generate();
    }
    prevToneRef.current = tone;
  }, [tone]);

  // Auto-generate on mount
  useEffect(() => {
    if (!hasGenerated && !loading && isPro) {
      generate();
    }
  }, []);

  const fullLetterText = useMemo(() => {
    if (!letter) return "";
    const parts: string[] = [];
    // Header
    if (contact.name) parts.push(contact.name);
    const contactLine = [contact.email, contact.phone].filter(Boolean).join(" | ");
    if (contactLine) parts.push(contactLine);
    parts.push(formatDate());
    parts.push("");
    if (hiringManager || companyName) {
      if (hiringManager) parts.push(hiringManager);
      if (companyName) parts.push(companyName);
      parts.push("");
    }
    parts.push(salutation);
    parts.push("");
    parts.push(letter);
    parts.push("");
    parts.push("Sincerely,");
    if (contact.name) parts.push(contact.name);
    return parts.join("\n");
  }, [letter, contact, hiringManager, companyName, salutation]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(fullLetterText);
    setCopied(true);
    toast.success("Copied to clipboard", { duration: 1500 });
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownloadDocx = async () => {
    const paragraphs = fullLetterText.split("\n").map(
      (line) => new Paragraph({ spacing: { after: line === "" ? 120 : 60 }, children: [new TextRun({ text: line, size: 24, font: "Calibri" })] })
    );
    const doc = new Document({ sections: [{ children: paragraphs }] });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, "Cover_Letter.docx");
    toast.success("DOCX downloaded");
  };

  const toneSelector = (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-muted-foreground font-medium">Tone:</span>
      <div className="flex gap-1">
        {TONES.map((t) => (
          <button
            key={t.value}
            onClick={() => setTone(t.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
              tone === t.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {toneSelector}
      {loading ? (
        <div className="rounded-lg border bg-card p-5 space-y-4">
          {STEPS.map((label, i) => {
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
                    <div className="w-1.5 h-1.5 rounded-full bg-primary active-pulse" />
                  ) : null}
                </div>
                <span className={`text-sm ${done ? "text-foreground" : active ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      ) : error ? (
        <div className="rounded-lg border bg-card p-5 space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Cover letter generation interrupted. This can happen with complex inputs — click retry to try again.
          </p>
          <Button onClick={generate} variant="outline" className="w-full gap-2">
            <RefreshCw className="h-4 w-4" /> Retry
          </Button>
        </div>
      ) : letter ? (
        <>
          <div className="relative rounded-lg border bg-card p-5 md:p-6">
            <button onClick={handleCopy} className="absolute top-3 right-3 p-1.5 rounded hover:bg-secondary transition-colors">
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
            </button>
            <div className="space-y-1 pr-8">
              {contact.name && (
                <p className="text-foreground font-semibold text-[15px] md:text-[16px]">{contact.name}</p>
              )}
              {(contact.email || contact.phone) && (
                <p className="text-muted-foreground text-[13px]">
                  {[contact.email, contact.phone].filter(Boolean).join(" | ")}
                </p>
              )}
              <p className="text-muted-foreground text-[13px]">{formatDate()}</p>

              {(hiringManager || companyName) && (
                <div className="pt-3">
                  {hiringManager && <p className="text-foreground text-[15px]">{hiringManager}</p>}
                  {companyName && <p className="text-foreground text-[15px]">{companyName}</p>}
                </div>
              )}

              <p className="text-foreground text-[15px] md:text-[16px] pt-4">{salutation}</p>

              <div className="space-y-4 pt-3">
                {letter.split("\n\n").filter(Boolean).map((p, i) => (
                  <p key={i} className="text-foreground leading-relaxed text-[15px] md:text-[16px]">{p}</p>
                ))}
              </div>

              <div className="pt-4">
                <p className="text-foreground text-[15px] md:text-[16px]">Sincerely,</p>
                {contact.name && (
                  <p className="text-foreground font-semibold text-[15px] md:text-[16px]">{contact.name}</p>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={generate} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Regenerate
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadDocx} className="gap-1.5">
              <Download className="h-3.5 w-3.5" /> Download DOCX
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
};

export default CoverLetterEngine;
