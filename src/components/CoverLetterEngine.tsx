import { useState, useMemo, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, RefreshCw, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { saveAs } from "file-saver";
import { extractContactFromText } from "@/lib/contactExtractor";
import { antiAIFilter } from "@/lib/antiAIFilter";

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

function inferCompanyName(jd: string): string | undefined {
  if (!jd) return undefined;
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
    if (contact.name) parts.push(contact.name);
    const contactLine = [contact.email, contact.phone].filter(Boolean).join(" | ");
    if (contactLine) parts.push(contactLine);
    parts.push("");
    parts.push(formatDate());
    parts.push("");
    if (hiringManager || companyName) {
      if (hiringManager) parts.push(hiringManager);
      if (companyName) parts.push(companyName);
      parts.push("");
    }
    parts.push(salutation);
    parts.push("");
    // Preserve paragraph breaks
    const paragraphs = letter.split("\n\n").filter(Boolean);
    paragraphs.forEach((p, i) => {
      parts.push(p);
      if (i < paragraphs.length - 1) parts.push("");
    });
    parts.push("");
    parts.push("Sincerely,");
    if (contact.name) parts.push(contact.name);
    return parts.join("\n");
  }, [letter, contact, hiringManager, companyName, salutation]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(fullLetterText);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownloadDocx = async () => {
    const lines = fullLetterText.split("\n");
    const paragraphs = lines.map((line, i) => {
      const isName = i === 0 && contact.name && line === contact.name;
      const isClosingName = i === lines.length - 1 && contact.name && line === contact.name;
      const isSalutation = line === salutation;
      const isSincerely = line === "Sincerely,";

      return new Paragraph({
        spacing: { after: line === "" ? 200 : 80 },
        children: [
          new TextRun({
            text: line,
            size: 24,
            font: "Calibri",
            bold: isName || isClosingName || false,
            italics: false,
          }),
        ],
      });
    });
    const doc = new Document({ sections: [{ children: paragraphs }] });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, "Cover_Letter.docx");
    toast.success("Copied to clipboard");
  };

  return (
    <div className="space-y-3">
      {/* Tone selector */}
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
          {/* Toolbar — matches Resume module pattern */}
          <div className="flex items-center justify-between gap-2 rounded-lg border bg-card px-4 py-2.5 flex-wrap">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={generate} disabled={loading} className="gap-1.5 text-xs whitespace-nowrap">
                <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                Regenerate
              </Button>
            </div>
            <div className="flex items-center gap-2 flex-col w-full md:w-auto md:flex-row">
              <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5 text-xs whitespace-nowrap w-full md:w-auto">
                {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copied" : "Copy Letter"}
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownloadDocx} className="gap-1.5 text-xs whitespace-nowrap w-full md:w-auto">
                <Download className="h-3 w-3" />
                <span className="hidden md:inline">Export Letter (.docx)</span>
                <span className="md:hidden">DOCX (.docx)</span>
              </Button>
            </div>
          </div>

          {/* Letter card — styled to match ResumeCanvas */}
          <div
            className="mx-auto bg-white rounded-sm relative"
            style={{
              maxWidth: "720px",
              boxShadow: "0 4px 32px rgba(0,0,0,0.12)",
              fontFamily: "'Georgia', 'Times New Roman', serif",
              color: "#1A1A2E",
              padding: "clamp(24px, 5vw, 56px) clamp(20px, 5vw, 56px)",
            }}
          >
            {/* Candidate Header */}
            <div style={{ marginBottom: "20px" }}>
              {contact.name && (
                <p style={{ fontSize: "18px", fontWeight: 700, color: "#1A1A2E", marginBottom: "2px" }}>{contact.name}</p>
              )}
              {(contact.email || contact.phone) && (
                <p style={{ fontSize: "11px", color: "#6B7280", marginBottom: "0" }}>
                  {[contact.email, contact.phone].filter(Boolean).join("  |  ")}
                </p>
              )}
            </div>

            {/* Date */}
            <p style={{ fontSize: "11px", color: "#6B7280", marginBottom: "16px" }}>{formatDate()}</p>

            {/* Recipient */}
            {(hiringManager || companyName) && (
              <div style={{ marginBottom: "16px" }}>
                {hiringManager && <p style={{ fontSize: "12px", color: "#1A1A2E" }}>{hiringManager}</p>}
                {companyName && <p style={{ fontSize: "12px", color: "#1A1A2E" }}>{companyName}</p>}
              </div>
            )}

            {/* Salutation */}
            <p style={{ fontSize: "12px", color: "#1A1A2E", marginBottom: "16px" }}>{salutation}</p>

            {/* Body */}
            <div style={{ marginBottom: "20px" }}>
              {letter.split("\n\n").filter(Boolean).map((p, i) => (
                <p key={i} style={{
                  fontSize: "11.5px",
                  lineHeight: "1.7",
                  color: "#1A1A2E",
                  marginBottom: "14px",
                  fontWeight: 400,
                }}>
                  {p}
                </p>
              ))}
            </div>

            {/* Closing */}
            <div>
              <p style={{ fontSize: "12px", color: "#1A1A2E", marginBottom: "4px" }}>Sincerely,</p>
              {contact.name && (
                <p style={{ fontSize: "12px", fontWeight: 700, color: "#1A1A2E" }}>{contact.name}</p>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};

export default CoverLetterEngine;
