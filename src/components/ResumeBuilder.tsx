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

interface ResumeBuilderProps {
  experience: string;
  jd: string;
  calibratedBullet: string;
  originalBullet: string;
  matchScore: number;
  isPro: boolean;
  onUpgrade: () => void;
}

interface ResumeData {
  name: string;
  email: string;
  phone: string;
  positioningStatement: string;
  signalGapNotice: string;
}

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
  const [resumeData, setResumeData] = useState<ResumeData | null>(null);
  const [showContactForm, setShowContactForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const handleBuildClick = () => {
    if (!isPro) {
      onUpgrade();
      return;
    }
    setShowContactForm(true);
  };

  const handleGenerate = async () => {
    if (!name.trim()) {
      toast.error("Please enter your name.");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-resume-summary", {
        body: { experience, jd, calibratedBullet, matchScore },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setResumeData({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        positioningStatement: data.positioning_statement,
        signalGapNotice: data.signal_gap_notice,
      });
      setShowContactForm(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to generate resume summary.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadDocx = async () => {
    if (!resumeData) return;

    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              margin: { top: 720, bottom: 720, left: 720, right: 720 },
            },
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 80 },
              children: [
                new TextRun({
                  text: resumeData.name,
                  bold: true,
                  size: 32,
                  font: "Calibri",
                }),
              ],
            }),
            ...(resumeData.email || resumeData.phone
              ? [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 200 },
                    children: [
                      new TextRun({
                        text: [resumeData.email, resumeData.phone].filter(Boolean).join("  |  "),
                        size: 20,
                        font: "Calibri",
                        color: "666666",
                      }),
                    ],
                  }),
                ]
              : []),
            new Paragraph({
              border: {
                bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
              },
              spacing: { after: 200 },
              children: [],
            }),
            new Paragraph({
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 100, after: 100 },
              children: [
                new TextRun({
                  text: "PROFESSIONAL SUMMARY",
                  bold: true,
                  size: 22,
                  font: "Calibri",
                  allCaps: true,
                }),
              ],
            }),
            new Paragraph({
              spacing: { after: 200 },
              children: [
                new TextRun({
                  text: resumeData.positioningStatement,
                  size: 21,
                  font: "Calibri",
                }),
              ],
            }),
            new Paragraph({
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 100, after: 100 },
              children: [
                new TextRun({
                  text: "EXPERIENCE",
                  bold: true,
                  size: 22,
                  font: "Calibri",
                  allCaps: true,
                }),
              ],
            }),
            new Paragraph({
              spacing: { after: 100 },
              bullet: { level: 0 },
              children: [
                new TextRun({
                  text: calibratedBullet,
                  size: 21,
                  font: "Calibri",
                }),
              ],
            }),
            new Paragraph({
              spacing: { before: 300, after: 100 },
              children: [
                new TextRun({
                  text: "SIGNAL GAP NOTICE",
                  bold: true,
                  size: 22,
                  font: "Calibri",
                  allCaps: true,
                }),
              ],
            }),
            new Paragraph({
              spacing: { after: 100 },
              children: [
                new TextRun({
                  text: resumeData.signalGapNotice,
                  size: 21,
                  font: "Calibri",
                  italics: true,
                  color: "666666",
                }),
              ],
            }),
          ],
        },
      ],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${resumeData.name.replace(/\s+/g, "_")}_Calibrated_Resume.docx`);
    toast.success("DOCX downloaded successfully.");
  };

  if (resumeData) {
    return (
      <div className="space-y-4">
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
                {resumeData.name}
              </p>
              {(resumeData.email || resumeData.phone) && (
                <p className="mt-1.5 text-muted-foreground" style={{ fontSize: "13px" }}>
                  {[resumeData.email, resumeData.phone].filter(Boolean).join("  ·  ")}
                </p>
              )}
            </div>

            {/* Professional Summary */}
            <div>
              <p className="font-bold uppercase text-foreground mb-2" style={{ fontSize: "12px", letterSpacing: "0.12em" }}>
                Professional Summary
              </p>
              <p className="text-foreground leading-relaxed" style={{ fontSize: "14px" }}>
                {resumeData.positioningStatement}
              </p>
            </div>

            {/* Experience */}
            <div>
              <p className="font-bold uppercase text-foreground mb-2" style={{ fontSize: "12px", letterSpacing: "0.12em" }}>
                Experience
              </p>
              <div className="pl-4" style={{ borderLeft: "2px solid hsl(var(--primary) / 0.25)" }}>
                <p className="text-foreground leading-relaxed" style={{ fontSize: "14px" }}>
                  {calibratedBullet}
                </p>
              </div>
            </div>

            {/* Signal Gap Notice */}
            <div className="pt-4" style={{ borderTop: "1px solid #e8e8e8" }}>
              <p className="font-bold uppercase text-muted-foreground mb-2" style={{ fontSize: "11px", letterSpacing: "0.12em" }}>
                Signal Gap Notice
              </p>
              <p className="text-muted-foreground italic leading-relaxed" style={{ fontSize: "13px" }}>
                {resumeData.signalGapNotice}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
          <Input
            placeholder="Full Name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            placeholder="Email (optional)"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            placeholder="Phone (optional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <Button onClick={handleGenerate} disabled={loading} className="w-full gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          {loading ? "Generating…" : "Generate Calibrated Resume"}
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      onClick={handleBuildClick}
      className="w-full gap-2"
    >
      <FileText className="h-4 w-4" />
      Build My Calibrated Resume
      {!isPro && (
        <span className="ml-1 text-[10px] uppercase tracking-wider text-primary font-semibold">Pro</span>
      )}
    </Button>
  );
};

export default ResumeBuilder;
