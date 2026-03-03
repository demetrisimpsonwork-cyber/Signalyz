import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Download, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
} from "docx";
import { saveAs } from "file-saver";

// ─── Resume parsing utilities ─────────────────────────────────────────────────

interface ParsedRole {
  header: string;
  company: string;
  title: string;
  dateRange: string;
  bullets: string[];
}

interface ParsedResume {
  roles: ParsedRole[];
  summaryText: string;
  skillsText: string;
  certificationsText: string;
  otherSections: { heading: string; content: string }[];
}

function parseExperience(text: string): ParsedResume {
  const lines = text.split("\n").map((l) => l.trim());
  const roles: ParsedRole[] = [];
  let currentRole: ParsedRole | null = null;
  let summaryLines: string[] = [];
  let skillsLines: string[] = [];
  let certLines: string[] = [];
  let currentSection: "none" | "summary" | "skills" | "certs" | "experience" = "none";

  const datePattern = /(\d{4})\s*[-–—]\s*(present|\d{4}|current)/i;
  const sectionHeaders = /^(professional\s+summary|summary|core\s+competencies|skills|certifications?|independent\s+projects?|education)/i;

  for (const line of lines) {
    if (!line) continue;

    // Detect section headers
    const sectionMatch = line.match(sectionHeaders);
    if (sectionMatch) {
      if (currentRole) { roles.push(currentRole); currentRole = null; }
      const sectionName = sectionMatch[1].toLowerCase();
      if (sectionName.includes("summary")) { currentSection = "summary"; continue; }
      if (sectionName.includes("skill") || sectionName.includes("competen")) { currentSection = "skills"; continue; }
      if (sectionName.includes("certif")) { currentSection = "certs"; continue; }
      currentSection = "none";
      continue;
    }

    // Route to current section
    if (currentSection === "summary") { summaryLines.push(line.replace(/^[•\-*]\s*/, "")); continue; }
    if (currentSection === "skills") { skillsLines.push(line.replace(/^[•\-*]\s*/, "")); continue; }
    if (currentSection === "certs") { certLines.push(line.replace(/^[•\-*]\s*/, "")); continue; }

    // Detect role headers (lines with date ranges that aren't bullets)
    const isBullet = /^[•\-*]\s/.test(line);
    const hasDate = datePattern.test(line);

    if (hasDate && !isBullet) {
      if (currentRole) roles.push(currentRole);
      // Parse header: try "Title — Company (Dates)" or "Company | Title | Dates"
      let company = "";
      let title = "";
      let dateRange = "";
      const dateMatch = line.match(datePattern);
      if (dateMatch) dateRange = dateMatch[0];

      const headerWithoutDate = line.replace(datePattern, "").replace(/[()]/g, "").trim().replace(/[\s|—–-]+$/, "").trim();
      const parts = headerWithoutDate.split(/\s*[|—–]\s*/);
      if (parts.length >= 2) {
        title = parts[0].trim();
        company = parts[1].trim();
      } else {
        title = headerWithoutDate;
      }

      currentRole = { header: line, company, title, dateRange, bullets: [] };
      currentSection = "experience";
      continue;
    }

    if (isBullet && currentRole) {
      currentRole.bullets.push(line.replace(/^[•\-*]\s*/, ""));
    } else if (currentRole && currentSection === "experience") {
      // Non-bullet text under a role — treat as a bullet
      if (line.length > 15) currentRole.bullets.push(line);
    } else if (!currentRole && currentSection === "none" && line.length > 15) {
      // Pre-role text with no section header — might be experience without header
      if (!currentRole) {
        currentRole = { header: "Experience", company: "", title: "", dateRange: "", bullets: [] };
        currentSection = "experience";
      }
      currentRole.bullets.push(line.replace(/^[•\-*]\s*/, ""));
    }
  }

  if (currentRole) roles.push(currentRole);

  return {
    roles,
    summaryText: summaryLines.join(" ").trim(),
    skillsText: skillsLines.join(", ").trim(),
    certificationsText: certLines.join("\n").trim(),
    otherSections: [],
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalibratedRole {
  company: string;
  title: string;
  date_range: string;
  calibrated_bullets: string[];
}

interface ResumeResult {
  positioning_statement: string;
  interview_preparation_notice: string;
  calibrated_roles: CalibratedRole[];
}

interface ResumeBuilderProps {
  experience: string;
  jd: string;
  calibratedBullet: string;
  originalBullet: string;
  matchScore: number;
  isPro: boolean;
  onUpgrade: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

const ResumeBuilder = ({
  experience,
  jd,
  calibratedBullet,
  originalBullet,
  matchScore,
  isPro,
  onUpgrade,
}: ResumeBuilderProps) => {
  const [loading, setLoading] = useState(false);
  const [resumeResult, setResumeResult] = useState<ResumeResult | null>(null);
  const [showContactForm, setShowContactForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const handleBuildClick = () => {
    if (!isPro) { onUpgrade(); return; }
    setShowContactForm(true);
  };

  const handleGenerate = async () => {
    if (!name.trim()) { toast.error("Please enter your name."); return; }
    setLoading(true);
    try {
      const parsed = parseExperience(experience);
      const rolesPayload = parsed.roles.map((r) => ({
        company: r.company || r.title || "Experience",
        title: r.title || "",
        date_range: r.dateRange || "",
        bullets: r.bullets,
      }));

      const { data, error } = await supabase.functions.invoke("generate-resume-summary", {
        body: {
          roles: rolesPayload,
          jd,
          matchScore,
          existingSummary: parsed.summaryText || undefined,
          skills: parsed.skillsText || undefined,
          certifications: parsed.certificationsText || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setResumeResult({
        positioning_statement: data.positioning_statement,
        interview_preparation_notice: data.interview_preparation_notice || data.signal_gap_notice || "",
        calibrated_roles: data.calibrated_roles || [],
      });
      setShowContactForm(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to generate calibrated resume.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadDocx = async () => {
    if (!resumeResult) return;

    const sectionHeader = (text: string) =>
      new Paragraph({
        spacing: { before: 240, after: 80 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" } },
        children: [
          new TextRun({ text: text.toUpperCase(), bold: true, size: 22, font: "Calibri", allCaps: true }),
        ],
      });

    const roleChildren = resumeResult.calibrated_roles.flatMap((role) => {
      const header = [role.company, role.title, role.date_range].filter(Boolean).join(" | ");
      return [
        new Paragraph({
          spacing: { before: 160, after: 60 },
          children: [new TextRun({ text: header, bold: true, size: 21, font: "Calibri" })],
        }),
        ...role.calibrated_bullets.map(
          (b) =>
            new Paragraph({
              spacing: { after: 40 },
              bullet: { level: 0 },
              children: [new TextRun({ text: b, size: 21, font: "Calibri" })],
            })
        ),
      ];
    });

    const doc = new Document({
      sections: [
        {
          properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 80 },
              children: [new TextRun({ text: name.trim(), bold: true, size: 32, font: "Calibri" })],
            }),
            ...([email.trim(), phone.trim()].filter(Boolean).length > 0
              ? [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 200 },
                    children: [
                      new TextRun({
                        text: [email.trim(), phone.trim()].filter(Boolean).join("  |  "),
                        size: 20,
                        font: "Calibri",
                        color: "666666",
                      }),
                    ],
                  }),
                ]
              : []),
            sectionHeader("Professional Summary"),
            new Paragraph({
              spacing: { after: 200 },
              children: [new TextRun({ text: resumeResult.positioning_statement, size: 21, font: "Calibri" })],
            }),
            sectionHeader("Experience"),
            ...roleChildren,
          ],
        },
      ],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${name.trim().replace(/\s+/g, "_")}_Calibrated_Resume.docx`);
    toast.success("DOCX downloaded successfully.");
  };

  // ─── Resume Preview ──────────────────────────────────────────────────────

  if (resumeResult) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Calibrated Resume Preview
          </h3>
          <Button size="sm" onClick={handleDownloadDocx} className="gap-2">
            <Download className="h-3.5 w-3.5" />
            Download DOCX
          </Button>
        </div>

        {/* Document-style resume */}
        <div className="bg-white rounded-sm shadow-[0_2px_20px_-4px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.05)] max-w-[640px] mx-auto">
          <div className="px-10 py-10 space-y-6" style={{ fontFamily: "'Calibri', 'Segoe UI', sans-serif" }}>
            {/* Name */}
            <div className="text-center border-b pb-5" style={{ borderColor: "#e0e0e0" }}>
              <p className="font-bold text-foreground" style={{ fontSize: "20px", letterSpacing: "0.02em" }}>
                {name.trim()}
              </p>
              {(email.trim() || phone.trim()) && (
                <p className="mt-1.5 text-muted-foreground" style={{ fontSize: "13px" }}>
                  {[email.trim(), phone.trim()].filter(Boolean).join("  ·  ")}
                </p>
              )}
            </div>

            {/* Professional Summary */}
            <div>
              <p className="font-bold uppercase text-foreground mb-2" style={{ fontSize: "12px", letterSpacing: "0.12em" }}>
                Professional Summary
              </p>
              <p className="text-foreground leading-relaxed" style={{ fontSize: "14px" }}>
                {resumeResult.positioning_statement}
              </p>
            </div>

            {/* Experience — role by role */}
            <div>
              <p className="font-bold uppercase text-foreground mb-3" style={{ fontSize: "12px", letterSpacing: "0.12em" }}>
                Experience
              </p>
              <div className="space-y-5">
                {resumeResult.calibrated_roles.map((role, ri) => {
                  const header = [role.company, role.title, role.date_range].filter(Boolean).join(" | ");
                  return (
                    <div key={ri}>
                      <p className="font-bold text-foreground mb-1.5" style={{ fontSize: "13px" }}>
                        {header || `Role ${ri + 1}`}
                      </p>
                      <ul className="space-y-1.5 pl-4" style={{ listStyleType: "disc" }}>
                        {role.calibrated_bullets.map((b, bi) => (
                          <li key={bi} className="text-foreground leading-relaxed" style={{ fontSize: "14px" }}>
                            {b}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Interview Preparation Notice — OUTSIDE the resume */}
        {resumeResult.interview_preparation_notice && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-950/20 p-5 max-w-[640px] mx-auto">
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-amber-700 dark:text-amber-400 mb-2">
              Interview Preparation Notice
            </p>
            <p className="text-xs text-amber-900 dark:text-amber-300 leading-relaxed">
              {resumeResult.interview_preparation_notice}
            </p>
          </div>
        )}
      </div>
    );
  }

  // ─── Contact Form ─────────────────────────────────────────────────────────

  if (showContactForm) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Contact Information
        </h3>
        <p className="text-xs text-muted-foreground">
          Enter your details for the resume header. Only your name is required.
        </p>
        <div className="space-y-3">
          <Input placeholder="Full Name *" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <Button onClick={handleGenerate} disabled={loading} className="w-full gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          {loading ? "Calibrating resume…" : "Generate Calibrated Resume"}
        </Button>
      </div>
    );
  }

  // ─── Initial button ───────────────────────────────────────────────────────

  return (
    <Button variant="outline" onClick={handleBuildClick} className="w-full gap-2">
      <FileText className="h-4 w-4" />
      Build My Calibrated Resume
      {!isPro && (
        <span className="ml-1 text-[10px] uppercase tracking-wider text-primary font-semibold">Pro</span>
      )}
    </Button>
  );
};

export default ResumeBuilder;
