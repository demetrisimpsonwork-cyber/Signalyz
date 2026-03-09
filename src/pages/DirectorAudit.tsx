import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

import { Loader2, Copy, Check, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import DirectorCalibrationBlock, { type DirectorCalibrationResult } from "@/components/DirectorCalibrationBlock";
import DirectorQARunner from "@/components/DirectorQARunner";
import { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle } from "docx";
import { saveAs } from "file-saver";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const buildPlainText = (result: DirectorCalibrationResult): string => {
  const roleLabel = (result._role_tier_label || "Director").toUpperCase();
  const lines: string[] = [
    "SIGNAL POSITIONING REPORT",
    "====================================",
    "",
    `${roleLabel} SIGNAL TIER`,
    `Tier: ${result.director_signal_tier.tier}`,
    `Rationale: ${result.director_signal_tier.rationale}`,
    "",
    "DIMENSION EVALUATION",
    ...result.dimensions.flatMap((d) => [
      `${d.name}: ${d.classification}`,
      `  Strength — ${d.strength_signal}`,
      `  Risk     — ${d.risk_signal}`,
      "",
    ]),
    "HIRING STAGE FRICTION",
    `Recruiter Filter Risk: ${result.hiring_stage_friction.recruiter_filter_risk.level} — ${result.hiring_stage_friction.recruiter_filter_risk.observation}`,
    `Hiring Manager Friction: ${result.hiring_stage_friction.hiring_manager_friction.level} — ${result.hiring_stage_friction.hiring_manager_friction.observation}`,
    `Executive Skepticism: ${result.hiring_stage_friction.executive_skepticism.level} — ${result.hiring_stage_friction.executive_skepticism.observation}`,
    `Primary Friction Stage: ${result.hiring_stage_friction.primary_friction_stage}`,
    "",
  ];

  if (result.pattern_detection.undersignaling_patterns.length > 0) {
    lines.push("UNDERSIGNALING PATTERNS");
    result.pattern_detection.undersignaling_patterns.forEach((p) => lines.push(`— ${p}`));
    lines.push("");
  }
  if (result.pattern_detection.ownership_inflation_patterns.length > 0) {
    lines.push("OWNERSHIP INFLATION PATTERNS");
    result.pattern_detection.ownership_inflation_patterns.forEach((p) => lines.push(`— ${p}`));
    lines.push("");
  }

  if (result.signal_classifier) {
    const sc = result.signal_classifier;
    lines.push("SIGNAL CLASSIFIER — SENIORITY SCORING");
    lines.push(`Inferred Level: ${sc.target_level_inferred}`);
    lines.push(`Overall Alignment: ${sc.overall_seniority_alignment}${sc.total_score != null ? ` (${sc.total_score}/175)` : ""}`);
    lines.push("");
    const dimLabels: Record<string, string> = {
      commercial: "Commercial Impact Attribution",
      ownership: "End-to-End Ownership Scope",
      authority: "Decision Authority",
      cross_functional: "Cross-Functional Leadership",
      lifecycle: "Lifecycle Governance",
      risk: "Risk Compression",
      narrative: "Narrative Cohesion",
    };
    Object.entries(sc.dimension_scores).forEach(([key, dim]) => {
      lines.push(`${dimLabels[key] ?? key}: ${dim.score}/25`);
      if (dim.rationale) lines.push(`  Rationale: ${dim.rationale}`);
      if (dim.evidence_quotes?.length) lines.push(`  Evidence: ${dim.evidence_quotes.join(" | ")}`);
      if (dim.missing.length) lines.push(`  Missing: ${dim.missing.join(", ")}`);
    });
    lines.push("");
    lines.push("Top Gaps:");
    sc.top_3_gaps.forEach((g, i) => lines.push(`${i + 1}. ${g}`));
    lines.push("");
  }

  if (result.gap_analyzer) {
    const ga = result.gap_analyzer;
    lines.push("GAP ANALYZER — UPGRADE PRIORITY");
    if (ga.priority_order.length) {
      lines.push(`Priority Order: ${ga.priority_order.join(" → ")}`);
      lines.push("");
    }
    ga.rewrite_targets.forEach((t, i) => {
      lines.push(`${i + 1}. [${t.upgrade_type}] ${t.bullet_reference}`);
      lines.push(`   Reason: ${t.reason}`);
      if (t.version_a) lines.push(`   A (Upper-bound): ${t.version_a}`);
      if (t.version_b) lines.push(`   B (Conservative): ${t.version_b}`);
      if (t.chooser_line) lines.push(`   → ${t.chooser_line}`);
      if (!t.version_a && t.rewritten_bullet) lines.push(`   Rewritten: ${t.rewritten_bullet}`);
    });
    lines.push("");
  }

  if (result.consistency_validator) {
    const cv = result.consistency_validator;
    lines.push("CONSISTENCY VALIDATOR");
    lines.push(`Status: ${cv.status.toUpperCase()}`);
    if (cv.issues.length > 0) {
      cv.issues.forEach((issue, i) => lines.push(`${i + 1}. ${issue}`));
    } else {
      lines.push("No material consistency issues detected.");
    }
    lines.push("");
  }

  if (result.run_id) {
    lines.push(`Run ID: ${result.run_id}`);
    if (result._replay) lines.push("(Deterministic Replay)");
  }

  return lines.join("\n");
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const DirectorAudit = () => {
  const [experience, setExperience] = useState("");
  const [jd, setJd] = useState("");
  const [result, setResult] = useState<DirectorCalibrationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ experience?: string }>({});
  const [copied, setCopied] = useState(false);
  const deterministic = false;

  const validate = () => {
    const errs: typeof errors = {};
    if (!experience.trim()) errs.experience = "Experience / Resume Text is required.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("director-calibration", {
        body: {
          experience: experience.trim(),
          jd: jd.trim() || undefined,
          deterministic,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setResult(data as DirectorCalibrationResult);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(buildPlainText(result));
    setCopied(true);
    toast.success("Report copied to clipboard", { duration: 1500 });
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownloadDocx = async () => {
    if (!result) return;
    const text = buildPlainText(result);
    const paragraphs = text.split("\n").map(
      (line) => new Paragraph({
        spacing: { after: line === "" ? 120 : 40 },
        children: [new TextRun({ text: line, size: 21, font: "Calibri", bold: line === line.toUpperCase() && line.length > 3 })],
      })
    );
    const doc = new Document({
      sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } }, children: paragraphs }],
    });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, "Signal_Positioning_Report.docx");
    toast.success("DOCX downloaded");
  };

  return (
    <div className="container max-w-5xl py-10">
      {/* Header */}
      <div className="mb-8">
        <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-1.5">
          Signal Positioning Engine
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-foreground mb-2">
          Signal Positioning Report
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
          Diagnoses where your signal breaks down across every hiring stage and rebuilds your positioning from the threshold up. 11-section output. Zero fabrication.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_1.6fr]">
        {/* ── Left: Input Form ─────────────────────────────────────────────── */}
        <div className="space-y-5">
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="px-4 pt-3.5 pb-2.5 border-b border-border/60">
              <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
                Input
              </p>
            </div>
            <div className="p-4 space-y-5">
              {/* Experience */}
              <div className="space-y-1.5">
                <Label htmlFor="experience" className="text-xs font-medium">
                  Experience / Resume Text
                  <span className="ml-1 text-destructive">*</span>
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Paste a resume summary, bullet set, or leadership experience section.
                </p>
                <Textarea
                  id="experience"
                  placeholder="Paste your resume bullets, summary, or experience section..."
                  value={experience}
                  onChange={(e) => {
                    setExperience(e.target.value);
                    if (errors.experience) setErrors({});
                  }}
                  rows={10}
                  className={errors.experience ? "border-destructive" : ""}
                />
                {errors.experience && (
                  <p className="text-xs text-destructive">{errors.experience}</p>
                )}
              </div>

              {/* JD */}
              <div className="space-y-1.5">
                <Label htmlFor="jd" className="text-xs font-medium">
                  Job Description
                  <span className="ml-1.5 text-muted-foreground font-normal">(optional)</span>
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Providing the target JD sharpens dimension calibration against role-specific thresholds.
                </p>
                <Textarea
                  id="jd"
                  placeholder="Paste the target job description..."
                  value={jd}
                  onChange={(e) => setJd(e.target.value)}
                  rows={6}
                />
              </div>


              <Button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full gap-2 transition-transform hover:scale-[1.03] active:scale-[0.97]"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? "Running Analysis…" : (<><span className="hidden md:inline">✦ Run Signal Positioning Report</span><span className="md:hidden">✦ Run Signal Report</span></>)}
              </Button>
            </div>
          </div>

          {/* Legend */}
          <div className="rounded-lg border bg-card p-4 space-y-2">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
              Evaluation Dimensions
            </p>
            {[
              "Scope of Ownership",
              "Strategic Leverage",
              "Accountability Density",
              "Executive Signal Quality",
            ].map((d) => (
              <div key={d} className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-muted-foreground/50 shrink-0" />
                <p className="text-xs text-muted-foreground">{d}</p>
              </div>
            ))}
          </div>

          {/* QA Runner */}
          <DirectorQARunner />
        </div>

        {/* ── Right: Results ───────────────────────────────────────────────── */}
        <div className="space-y-4">
          {loading && (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card min-h-[320px] gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Running positioning analysis…</p>
              <p className="text-xs text-muted-foreground/60">
                Evaluating four dimensions against role-specific thresholds
              </p>
            </div>
          )}

          {result && !loading && (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground font-medium">Positioning Report</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-muted-foreground border border-border/60 transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                    Copy
                  </button>
                </div>
              </div>

              <DirectorCalibrationBlock result={result} />

              {/* Download Full Package — elevated CTA */}
              <Button
                onClick={handleDownloadDocx}
                className="w-full gap-2 transition-transform hover:scale-[1.03] active:scale-[0.97]"
              >
                <Download className="h-4 w-4" />
                Download Full Positioning Package
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DirectorAudit;
