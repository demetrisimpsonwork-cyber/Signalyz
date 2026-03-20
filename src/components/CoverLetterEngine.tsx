import { useState, useMemo, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, RefreshCw, Download, Pencil, Eye } from "lucide-react";
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
  "Mapping transferable capabilities…",
  "Calibrating narrative structure…",
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

const COVER_LETTER_SECTIONS = [
  { min: 2, max: 3, target: 2 },
  { min: 2, max: 3, target: 3 },
  { min: 2, max: 3, target: 2 },
  { min: 1, max: 2, target: 2 },
  { min: 1, max: 2, target: 2 },
] as const;

function splitIntoSentences(text: string): string[] {
  const matches = text.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g) ?? [];
  return matches
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function segmentCoverLetterBody(text: string): string {
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "";

  const sentences = splitIntoSentences(normalized);
  if (!sentences.length) return normalized;

  const sections: string[][] = COVER_LETTER_SECTIONS.map(() => []);
  let cursor = 0;

  for (let i = 0; i < COVER_LETTER_SECTIONS.length; i++) {
    const config = COVER_LETTER_SECTIONS[i];
    const remaining = sentences.length - cursor;
    const minForRest = COVER_LETTER_SECTIONS.slice(i + 1).reduce((sum, section) => sum + section.min, 0);
    const maxForCurrent = Math.min(config.max, Math.max(remaining - minForRest, 0));
    const minForCurrent = Math.min(config.min, maxForCurrent);

    let take = Math.min(config.target, maxForCurrent);
    if (take < minForCurrent) take = minForCurrent;

    if (take > 0) {
      sections[i] = sentences.slice(cursor, cursor + take);
      cursor += take;
    }
  }

  while (cursor < sentences.length) {
    let allocated = false;

    for (let i = 0; i < COVER_LETTER_SECTIONS.length && cursor < sentences.length; i++) {
      const room = COVER_LETTER_SECTIONS[i].max - sections[i].length;
      if (room > 0) {
        sections[i].push(sentences[cursor]);
        cursor += 1;
        allocated = true;
      }
    }

    if (!allocated) break;
  }

  return sections
    .map((section) => section.join(" ").trim())
    .filter(Boolean)
    .join("\n\n");
}

const CoverLetterEngine = ({ experience, jd, alignmentResult, inferredRole, isPro, onUpgrade }: CoverLetterEngineProps) => {
  const [loading, setLoading] = useState(false);
  const [letter, setLetter] = useState("");
  const [editedLetter, setEditedLetter] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tone, setTone] = useState<Tone>("confident");
  const [step, setStep] = useState(0);
  const [hasGenerated, setHasGenerated] = useState(false);

  const contact = useMemo(() => extractContactFromText(experience), [experience]);
  const companyName = useMemo(() => inferCompanyName(jd), [jd]);
  const hiringManager = useMemo(() => inferHiringManager(jd), [jd]);

  const addresseeLine = useMemo(() => {
    if (hiringManager) return hiringManager;
    if (companyName) return `Hiring Team, ${companyName}`;
    return "Hiring Team";
  }, [hiringManager, companyName]);

  const salutation = hiringManager ? `Dear ${hiringManager},` : "Dear Hiring Team,";

  // The active letter content (edited or original)
  const activeLetter = editedLetter || letter;

  const generate = async () => {
    if (!isPro) { onUpgrade(); return; }
    setLoading(true);
    setError(null);
    setLetter("");
    setEditedLetter("");
    setIsEditing(false);
    setStep(0);

    const stepTimers = [
      setTimeout(() => setStep(1), 1000),
      setTimeout(() => setStep(2), 2200),
      setTimeout(() => setStep(3), 3800),
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
      const filteredLetter = antiAIFilter(data.letter || "");
      const segmentedLetter = segmentCoverLetterBody(filteredLetter);
      setLetter(segmentedLetter || filteredLetter);
      setHasGenerated(true);
      setStep(4);
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
    if (!activeLetter) return "";
    const parts: string[] = [];
    if (contact.name) parts.push(contact.name);
    const contactLine = [contact.email, contact.phone].filter(Boolean).join(" | ");
    if (contactLine) parts.push(contactLine);
    parts.push("");
    parts.push(formatDate());
    parts.push("");
    parts.push(addresseeLine);
    parts.push("");
    parts.push(salutation);
    parts.push("");
    const paragraphs = splitParagraphs(activeLetter);
    paragraphs.forEach((p, i) => {
      parts.push(p);
      if (i < paragraphs.length - 1) parts.push("");
    });
    parts.push("");
    parts.push("Sincerely,");
    if (contact.name) parts.push(contact.name);
    return parts.join("\n");
  }, [activeLetter, contact, hiringManager, companyName, salutation]);

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
    toast.success("Downloaded Cover Letter");
  };

  const handleToggleEdit = () => {
    if (!isEditing) {
      // Enter edit mode — seed edited letter from current
      setEditedLetter(activeLetter);
    }
    setIsEditing(!isEditing);
  };

  const handleEditChange = (value: string) => {
    setEditedLetter(value);
  };

  return (
    <div className="space-y-3">
      {/* Context + Tone selector */}
      <div className="rounded-lg border bg-card px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            Calibrating for: <span className="text-primary">{inferredRole || "Target Role"}</span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Signal-aligned cover letter built from your alignment analysis</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mr-1">Tone</span>
          {TONES.map((t) => (
            <button
              key={t.value}
              onClick={() => setTone(t.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all border ${
                tone === t.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:text-foreground hover:border-foreground/30"
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
      ) : activeLetter ? (
        <>
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-2 rounded-lg border bg-card px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={generate} disabled={loading} className="gap-1.5 text-xs">
                <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Regenerate</span>
              </Button>
              <Button
                variant={isEditing ? "default" : "outline"}
                size="sm"
                onClick={handleToggleEdit}
                className="gap-1.5 text-xs"
              >
                {isEditing ? <Eye className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                {isEditing ? "Preview" : "Edit"}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5 text-xs">
                {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownloadDocx} className="gap-1.5 text-xs">
                <Download className="h-3 w-3" />
                <span className="hidden sm:inline">Export .docx</span>
              </Button>
            </div>
          </div>

          {/* Letter card */}
          {isEditing ? (
            <div
             className="mx-auto rounded-sm relative"
              style={{
                maxWidth: "720px",
                boxShadow: "0 4px 32px rgba(0,0,0,0.12)",
                padding: "clamp(24px, 5vw, 56px) clamp(20px, 5vw, 56px)",
                backgroundColor: "white",
              }}
            >
              {/* Header (read-only in edit mode) */}
              <div style={{ marginBottom: "20px" }}>
                {contact.name && (
                  <p className="text-foreground" style={{ fontSize: "18px", fontWeight: 700, marginBottom: "2px", fontFamily: "'Georgia', 'Times New Roman', serif" }}>{contact.name}</p>
                )}
                {(contact.email || contact.phone) && (
                  <p className="text-muted-foreground" style={{ fontSize: "11px", marginBottom: "0", fontFamily: "'Georgia', 'Times New Roman', serif" }}>
                    {[contact.email, contact.phone].filter(Boolean).join("  |  ")}
                  </p>
                )}
              </div>
              <p className="text-muted-foreground" style={{ fontSize: "11px", marginBottom: "16px", fontFamily: "'Georgia', 'Times New Roman', serif" }}>{formatDate()}</p>
              {(hiringManager || companyName) && (
                <div style={{ marginBottom: "16px" }}>
                  {hiringManager && <p className="text-foreground" style={{ fontSize: "12px", fontFamily: "'Georgia', 'Times New Roman', serif" }}>{hiringManager}</p>}
                  {companyName && <p className="text-foreground" style={{ fontSize: "12px", fontFamily: "'Georgia', 'Times New Roman', serif" }}>{companyName}</p>}
                </div>
              )}
              <p className="text-foreground" style={{ fontSize: "12px", marginBottom: "16px", fontFamily: "'Georgia', 'Times New Roman', serif" }}>{salutation}</p>

              {/* Editable body */}
              <textarea
                value={editedLetter}
                onChange={(e) => handleEditChange(e.target.value)}
                className="w-full border border-border/50 rounded-md bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
                style={{
                  fontFamily: "'Georgia', 'Times New Roman', serif",
                  fontSize: "11.5px",
                  lineHeight: "1.7",
                  padding: "12px",
                  minHeight: "280px",
                }}
              />

              {/* Closing (read-only) */}
              <div style={{ marginTop: "20px" }}>
                <p className="text-foreground" style={{ fontSize: "12px", marginBottom: "4px", fontFamily: "'Georgia', 'Times New Roman', serif" }}>Sincerely,</p>
                {contact.name && (
                  <p className="text-foreground" style={{ fontSize: "12px", fontWeight: 700, fontFamily: "'Georgia', 'Times New Roman', serif" }}>{contact.name}</p>
                )}
              </div>
            </div>
          ) : (
            <div
              className="mx-auto rounded-sm relative"
              style={{
                maxWidth: "720px",
                boxShadow: "0 4px 32px rgba(0,0,0,0.12)",
                fontFamily: "'Georgia', 'Times New Roman', serif",
                padding: "clamp(24px, 5vw, 56px) clamp(20px, 5vw, 56px)",
                backgroundColor: "white",
              }}
            >
              {/* Candidate Header */}
              <div style={{ marginBottom: "20px" }}>
                {contact.name && (
                  <p className="text-foreground" style={{ fontSize: "18px", fontWeight: 700, marginBottom: "2px" }}>{contact.name}</p>
                )}
                {(contact.email || contact.phone) && (
                  <p className="text-muted-foreground" style={{ fontSize: "11px", marginBottom: "0" }}>
                    {[contact.email, contact.phone].filter(Boolean).join("  |  ")}
                  </p>
                )}
              </div>

              {/* Date */}
              <p className="text-muted-foreground" style={{ fontSize: "11px", marginBottom: "16px" }}>{formatDate()}</p>

              {/* Recipient */}
              {(hiringManager || companyName) && (
                <div style={{ marginBottom: "16px" }}>
                  {hiringManager && <p className="text-foreground" style={{ fontSize: "12px" }}>{hiringManager}</p>}
                  {companyName && <p className="text-foreground" style={{ fontSize: "12px" }}>{companyName}</p>}
                </div>
              )}

              {/* Salutation */}
              <p className="text-foreground" style={{ fontSize: "12px", marginBottom: "16px" }}>{salutation}</p>

              {/* Body — structured paragraphs */}
              <div style={{ marginBottom: "20px" }}>
                {splitParagraphs(activeLetter).map((p, i) => (
                  <p key={i} className="text-foreground" style={{
                    fontSize: "11.5px",
                    lineHeight: "1.7",
                    marginBottom: "14px",
                    fontWeight: 400,
                  }}>
                    {p}
                  </p>
                ))}
              </div>

              {/* Closing */}
              <div>
                <p className="text-foreground" style={{ fontSize: "12px", marginBottom: "4px" }}>Sincerely,</p>
                {contact.name && (
                  <p className="text-foreground" style={{ fontSize: "12px", fontWeight: 700 }}>{contact.name}</p>
                )}
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
};

export default CoverLetterEngine;
