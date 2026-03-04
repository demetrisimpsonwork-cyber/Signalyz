import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Download, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { EngineErrorCard, type DebugInfo } from "@/components/DebugPanel";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
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
  isIndependent: boolean;
}

interface ParsedResume {
  roles: ParsedRole[];
  summaryText: string;
  skillsText: string;
  certificationsText: string;
  educationText: string;
  contactLines: string[];
  otherSections: { heading: string; content: string }[];
}

// Contact info patterns
const CONTACT_PATTERNS = [
  /^[\w.-]+@[\w.-]+\.\w{2,}$/i, // email
  /^\+?\(?\d{1,4}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/i, // phone
  /^\d{3}[\s.-]\d{3}[\s.-]\d{4}$/, // phone alt
  /^[A-Z][a-z]+,?\s+[A-Z]{2}\s*\d{0,5}$/i, // City, ST or City, ST ZIP
  /^remote\b/i,
  /^linkedin\.com|github\.com|portfolio/i,
];

function isContactLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length > 80) return false;
  // Check if line contains email OR phone pattern
  if (/[\w.-]+@[\w.-]+\.\w{2,}/.test(trimmed)) return true;
  if (/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.test(trimmed)) return true;
  if (/\bremote\b/i.test(trimmed) && trimmed.length < 30) return true;
  return CONTACT_PATTERNS.some(p => p.test(trimmed));
}

function parseExperience(text: string): ParsedResume {
  const lines = text.split("\n").map((l) => l.trim());
  const roles: ParsedRole[] = [];
  let currentRole: ParsedRole | null = null;
  let summaryLines: string[] = [];
  let skillsLines: string[] = [];
  let certLines: string[] = [];
  let educationLines: string[] = [];
  let contactLines: string[] = [];
  let currentSection: "none" | "summary" | "skills" | "certs" | "experience" | "projects" | "education" = "none";

  const datePattern = /(\d{4})\s*[-–—]\s*(present|\d{4}|current)/i;
  const sectionHeaders = /^(professional\s+summary|summary|core\s+competencies|skills|certifications?|independent\s+projects?|education|experience|work\s+experience)/i;

  // First pass: extract contact info from top lines (before any section header)
  let headerEnd = 0;
  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    const line = lines[i];
    if (!line) continue;
    if (sectionHeaders.test(line) || datePattern.test(line)) break;
    if (isContactLine(line)) {
      contactLines.push(line);
    }
    headerEnd = i + 1;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Skip contact lines already extracted
    if (i < headerEnd && isContactLine(line)) continue;

    // Detect section headers
    const sectionMatch = line.match(sectionHeaders);
    if (sectionMatch) {
      if (currentRole) { roles.push(currentRole); currentRole = null; }
      const sectionName = sectionMatch[1].toLowerCase();
      if (sectionName.includes("summary")) { currentSection = "summary"; continue; }
      if (sectionName.includes("skill") || sectionName.includes("competen")) { currentSection = "skills"; continue; }
      if (sectionName.includes("certif")) { currentSection = "certs"; continue; }
      if (sectionName.includes("independent") || sectionName.includes("project")) { currentSection = "projects"; continue; }
      if (sectionName.includes("education")) { currentSection = "education"; continue; }
      if (sectionName.includes("experience") || sectionName.includes("work")) { currentSection = "experience"; continue; }
      currentSection = "none";
      continue;
    }

    // Route to current section
    if (currentSection === "summary") { summaryLines.push(line.replace(/^[•\-*]\s*/, "")); continue; }
    if (currentSection === "skills") { skillsLines.push(line.replace(/^[•\-*]\s*/, "")); continue; }
    if (currentSection === "certs") { certLines.push(line.replace(/^[•\-*]\s*/, "")); continue; }
    if (currentSection === "education") { educationLines.push(line.replace(/^[•\-*]\s*/, "")); continue; }

    // Detect role headers (lines with date ranges that aren't bullets)
    const isBullet = /^[•\-*]\s/.test(line);
    const hasDate = datePattern.test(line);

    if (hasDate && !isBullet) {
      if (currentRole) roles.push(currentRole);
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

      const isIndependent = currentSection === "projects";
      currentRole = { header: line, company, title, dateRange, bullets: [], isIndependent };
      if (currentSection !== "projects") currentSection = "experience";
      continue;
    }

    // For projects section without dates
    if (currentSection === "projects" && !isBullet && !currentRole && line.length > 5) {
      currentRole = { header: line, company: "", title: line, dateRange: "", bullets: [], isIndependent: true };
      continue;
    }

    if (isBullet && currentRole) {
      currentRole.bullets.push(line.replace(/^[•\-*]\s*/, ""));
    } else if (currentRole && (currentSection === "experience" || currentSection === "projects")) {
      if (line.length > 15) currentRole.bullets.push(line);
    } else if (!currentRole && currentSection === "none" && line.length > 15 && i >= headerEnd) {
      currentRole = { header: "Experience", company: "", title: "", dateRange: "", bullets: [], isIndependent: false };
      currentSection = "experience";
      currentRole.bullets.push(line.replace(/^[•\-*]\s*/, ""));
    }
  }

  if (currentRole) roles.push(currentRole);

  // Post-process: detect independent projects that ended up in experience
  for (const role of roles) {
    if (role.isIndependent) continue;
    const companyLower = (role.company || role.title || "").toLowerCase();
    if (!role.dateRange && (
      companyLower.includes("resumix") || companyLower.includes("vela") ||
      companyLower.includes("personal") || companyLower.includes("independent") ||
      companyLower.includes("self-") || companyLower.includes("founder") ||
      companyLower.includes("side project") || companyLower.includes("freelance")
    )) {
      role.isIndependent = true;
    }
  }

  return {
    roles,
    summaryText: summaryLines.join(" ").trim(),
    skillsText: skillsLines.join(", ").trim(),
    certificationsText: certLines.join("\n").trim(),
    educationText: educationLines.join("\n").trim(),
    contactLines,
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
  independent_projects: CalibratedRole[];
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
  const [parsedExtras, setParsedExtras] = useState<{ skills: string; certifications: string; education: string }>({ skills: "", certifications: "", education: "" });
  const [showContactForm, setShowContactForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [resumeError, setResumeError] = useState<DebugInfo | null>(null);
  const lastClickRef = useRef(0);

  const handleBuildClick = () => {
    if (!isPro) { onUpgrade(); return; }
    setShowContactForm(true);
  };

  const handleGenerate = async () => {
    if (!name.trim()) { toast.error("Please enter your name."); return; }

    // 2s debounce
    const now = Date.now();
    if (now - lastClickRef.current < 2000) return;
    lastClickRef.current = now;

    setLoading(true);
    setResumeError(null);
    try {
      const parsed = parseExperience(experience);

      const professionalRoles = parsed.roles.filter(r => !r.isIndependent);
      const independentProjects = parsed.roles.filter(r => r.isIndependent);

      const proRolesPayload = professionalRoles.map((r) => ({
        company: r.company || r.title || "Experience",
        title: r.title || "",
        date_range: r.dateRange || "",
        bullets: r.bullets,
      }));

      const indProjPayload = independentProjects.map((r) => ({
        company: r.company || r.title || "Project",
        title: r.title || "",
        date_range: r.dateRange || "",
        bullets: r.bullets,
      }));

      const allRoles = [...proRolesPayload, ...indProjPayload];

      const payload = {
        roles: allRoles,
        jd: jd?.slice(0, 8000) || "",
        matchScore,
        existingSummary: parsed.summaryText || undefined,
        skills: parsed.skillsText || undefined,
        certifications: parsed.certificationsText || undefined,
      };

      let rawText = "";
      let statusCode = 200;

      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-resume-summary`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify(payload),
          }
        );
        statusCode = response.status;
        rawText = await response.text();
      } catch (networkErr: any) {
        setResumeError({
          error_code: "NETWORK_ERROR",
          message: networkErr?.message || "Network request failed.",
          status_code: 0,
        });
        return;
      }

      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch {
        setResumeError({
          status_code: statusCode,
          error_code: "INVALID_JSON",
          message: "The server returned a non-JSON response.",
          response_snippet: rawText.slice(0, 500),
        });
        return;
      }

      if (statusCode !== 200 || data?.status === "error") {
        setResumeError({
          request_id: data?.request_id,
          status_code: statusCode,
          error_code: data?.error_code || "UNKNOWN",
          message: data?.message || data?.error || "Resume calibration failed.",
          response_snippet: rawText.slice(0, 500),
        });
        return;
      }

      setParsedExtras({
        skills: parsed.skillsText,
        certifications: parsed.certificationsText,
        education: parsed.educationText,
      });
      setResumeResult({
        positioning_statement: data.positioning_statement,
        interview_preparation_notice: data.interview_preparation_notice || data.signal_gap_notice || "",
        calibrated_roles: data.calibrated_roles || [],
        independent_projects: data.independent_projects || [],
      });
      setShowContactForm(false);
    } catch (err: any) {
      setResumeError({
        error_code: "CLIENT_EXCEPTION",
        message: err?.message || "Failed to generate calibrated resume.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadDocx = async () => {
    if (!resumeResult) return;

    const contactParts = [location.trim(), email.trim(), phone.trim()].filter(Boolean);

    const sectionHeader = (text: string) =>
      new Paragraph({
        spacing: { before: 160, after: 80 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" } },
        children: [
          new TextRun({ text: text.toUpperCase(), bold: true, size: 24, font: "Calibri", allCaps: true }),
        ],
      });

    // Professional experience roles
    const roleChildren = resumeResult.calibrated_roles.flatMap((role, ri) => {
      const header = [role.company, role.title, role.date_range].filter(Boolean).join(" | ");
      return [
        new Paragraph({
          spacing: { before: 200, after: 60 },
          children: [new TextRun({ text: header, bold: true, size: 22, font: "Calibri" })],
        }),
        ...role.calibrated_bullets.map(
          (b) =>
            new Paragraph({
              spacing: { after: 120, line: 276 },
              bullet: { level: 0 },
              children: [new TextRun({ text: b, size: 21, font: "Calibri" })],
            })
        ),
        // Add spacing after last bullet of each role
        ...(ri < resumeResult.calibrated_roles.length - 1 ? [new Paragraph({ spacing: { after: 80 }, children: [] })] : []),
      ];
    });

    // Independent projects
    const projectChildren = resumeResult.independent_projects.length > 0
      ? [
          sectionHeader("Independent Projects"),
          ...resumeResult.independent_projects.flatMap((proj) => {
            const header = [proj.company, proj.title, proj.date_range].filter(Boolean).join(" | ");
            return [
              new Paragraph({
                spacing: { before: 160, after: 60 },
                children: [new TextRun({ text: header, bold: true, size: 21, font: "Calibri" })],
              }),
              ...proj.calibrated_bullets.map(
                (b) =>
                  new Paragraph({
                    spacing: { after: 40 },
                    bullet: { level: 0 },
                    children: [new TextRun({ text: b, size: 21, font: "Calibri" })],
                  })
              ),
            ];
          }),
        ]
      : [];

    const doc = new Document({
      sections: [
        {
          properties: { page: { margin: { top: 1440, bottom: 1080, left: 1080, right: 1080 } } },
          children: [
            // Name — centered, bold, 14pt
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 40 },
              children: [new TextRun({ text: name.trim(), bold: true, size: 28, font: "Calibri" })],
            }),
            // Contact info — centered, 10pt, gray
            ...(contactParts.length > 0
              ? [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 80 },
                    children: [
                      new TextRun({
                        text: contactParts.join("  |  "),
                        size: 20,
                        font: "Calibri",
                        color: "666666",
                      }),
                    ],
                  }),
                ]
              : []),
            // Horizontal rule
            new Paragraph({
              spacing: { after: 200 },
              border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" } },
              children: [],
            }),
            // Professional Summary
            sectionHeader("Professional Summary"),
            new Paragraph({
              spacing: { after: 200, line: 276 },
              children: [new TextRun({ text: resumeResult.positioning_statement, size: 21, font: "Calibri" })],
            }),
            // Experience
            sectionHeader("Experience"),
            ...roleChildren,
            // Independent Projects (separate section)
            ...projectChildren,
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
    const contactParts = [location.trim(), email.trim(), phone.trim()].filter(Boolean);

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
            {/* Name — header */}
            <div className="text-center border-b pb-5" style={{ borderColor: "#e0e0e0" }}>
              <p className="font-bold text-foreground" style={{ fontSize: "20px", letterSpacing: "0.02em" }}>
                {name.trim()}
              </p>
              {contactParts.length > 0 && (
                <p className="mt-1.5 text-muted-foreground" style={{ fontSize: "13px" }}>
                  {contactParts.join("  ·  ")}
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

            {/* Experience — professional roles only */}
            {resumeResult.calibrated_roles.length > 0 && (
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
            )}

            {/* Independent Projects — separate section */}
            {resumeResult.independent_projects.length > 0 && (
              <div>
                <p className="font-bold uppercase text-foreground mb-3" style={{ fontSize: "12px", letterSpacing: "0.12em" }}>
                  Independent Projects
                </p>
                <div className="space-y-5">
                  {resumeResult.independent_projects.map((proj, pi) => {
                    const header = [proj.company, proj.title, proj.date_range].filter(Boolean).join(" | ");
                    return (
                      <div key={pi}>
                        <p className="font-bold text-foreground mb-1.5" style={{ fontSize: "13px" }}>
                          {header || `Project ${pi + 1}`}
                        </p>
                        <ul className="space-y-1.5 pl-4" style={{ listStyleType: "disc" }}>
                          {proj.calibrated_bullets.map((b, bi) => (
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
            )}
            {/* Skills */}
            {parsedExtras.skills && (
              <div>
                <p className="font-bold uppercase text-foreground mb-2" style={{ fontSize: "12px", letterSpacing: "0.12em" }}>
                  Skills
                </p>
                <p className="text-foreground leading-relaxed" style={{ fontSize: "14px" }}>
                  {parsedExtras.skills}
                </p>
              </div>
            )}

            {/* Education */}
            {parsedExtras.education && (
              <div>
                <p className="font-bold uppercase text-foreground mb-2" style={{ fontSize: "12px", letterSpacing: "0.12em" }}>
                  Education
                </p>
                {parsedExtras.education.split("\n").filter(Boolean).map((line, i) => (
                  <p key={i} className="text-foreground leading-relaxed" style={{ fontSize: "14px" }}>
                    {line}
                  </p>
                ))}
              </div>
            )}

            {/* Certifications */}
            {parsedExtras.certifications && (
              <div>
                <p className="font-bold uppercase text-foreground mb-2" style={{ fontSize: "12px", letterSpacing: "0.12em" }}>
                  Certifications
                </p>
                {parsedExtras.certifications.split("\n").filter(Boolean).map((line, i) => (
                  <p key={i} className="text-foreground leading-relaxed" style={{ fontSize: "14px" }}>
                    {line}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
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
          <Input placeholder="Full Name *" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          <Input placeholder="Location — e.g. New York, NY (optional)" value={location} onChange={(e) => setLocation(e.target.value)} autoComplete="off" />
          <Input placeholder="Email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          <Input
            placeholder="Phone (optional)"
            value={phone}
            autoComplete="off"
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
              if (digits.length <= 3) {
                setPhone(digits.length > 0 ? `(${digits}` : "");
              } else if (digits.length <= 6) {
                setPhone(`(${digits.slice(0, 3)}) ${digits.slice(3)}`);
              } else {
                setPhone(`(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`);
              }
            }}
          />
        </div>
        <Button onClick={handleGenerate} disabled={loading} className="w-full gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          {loading ? "Calibrating resume…" : "Generate Calibrated Resume"}
        </Button>
        {resumeError && (
          <EngineErrorCard debugInfo={resumeError} onRetry={handleGenerate} />
        )}
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
