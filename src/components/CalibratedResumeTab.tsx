import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Lock, RefreshCw, AlertTriangle, User } from "lucide-react";
import { toast } from "sonner";
import type { DirectorCalibrationResult } from "@/components/DirectorCalibrationBlock";
import { useResumeAssembly } from "@/hooks/useResumeAssembly";
import { useResumeEditor } from "@/hooks/useResumeEditor";
import ResumeAssemblyLoader from "@/components/ResumeAssemblyLoader";
import ResumeCanvas from "@/components/ResumeCanvas";
import ResumeToolbar from "@/components/ResumeToolbar";
import SignalKeywordsBlock from "@/components/SignalKeywordsBlock";
import RepositioningChangesPanel from "@/components/RepositioningChangesPanel";
import ResumeStructureConfirm from "@/components/ResumeStructureConfirm";
import PdfFallbackState from "@/components/PdfFallbackState";
import { exportCalibratedDocx } from "@/lib/exportDocx";
import { exportCalibratedPdf } from "@/lib/exportPdf";
import { extractContactFromText } from "@/lib/contactExtractor";
import type { ResumeInputSource } from "@/components/ResumeUpload";
import type { CalibratedResumeData } from "@/hooks/useResumeAssembly";

/** Convert structured resume data to plain text for scoring */
function resumeDataToText(r: CalibratedResumeData): string {
  const lines: string[] = [];
  if (r.header.name) lines.push(r.header.name);
  if (r.header.title) lines.push(r.header.title);
  const contact = [r.header.email, r.header.phone, r.header.linkedin, r.header.location].filter(Boolean).join(" | ");
  if (contact) lines.push(contact);
  if (r.summary) { lines.push("", "SUMMARY", r.summary); }
  if (r.core_competencies.length) { lines.push("", "CORE COMPETENCIES", r.core_competencies.join(" · ")); }
  if (r.experience.length) {
    lines.push("", "EXPERIENCE");
    for (const exp of r.experience) {
      const header = [exp.title, exp.company, exp.dates].filter(Boolean).join(" | ");
      lines.push(header);
      for (const b of exp.bullets) lines.push(`- ${b}`);
    }
  }
  if (r.independent_projects?.length) {
    lines.push("", "PROJECTS");
    for (const p of r.independent_projects) {
      lines.push(p.name + (p.description ? ` — ${p.description}` : ""));
      for (const b of p.bullets) lines.push(`- ${b}`);
    }
  }
  if (r.skills.length) { lines.push("", "SKILLS", r.skills.join(", ")); }
  if (r.certifications.length) { lines.push("", "CERTIFICATIONS", r.certifications.join(", ")); }
  if (r.education.length) {
    lines.push("", "EDUCATION");
    for (const edu of r.education) lines.push([edu.degree, edu.institution, edu.year].filter(Boolean).join(" — "));
  }
  return lines.join("\n");
}
interface CalibratedResumeTabProps {
  isPro: boolean;
  onUpgrade: () => void;
  directorResult: DirectorCalibrationResult | null;
  originalResume: string;
  jdText?: string;
  onSwitchToReport?: () => void;
  hasCurrentSessionAlignment?: boolean;
  onRunAlignment?: () => void;
  onAssembled?: () => void;
  alignmentResult?: Record<string, unknown>;
  inputSource?: ResumeInputSource;
  onResumeTextReplaced?: (text: string) => void;
  onRerunSignalAnalysis?: (calibratedText: string) => void;
  originalResumeBeforeCalibration?: string | null;
}

const CalibratedResumeTab = ({
  isPro,
  onUpgrade,
  directorResult,
  originalResume,
  onSwitchToReport,
  hasCurrentSessionAlignment = false,
  onRunAlignment,
  onAssembled,
  alignmentResult,
  jdText,
  inputSource = "paste",
  onResumeTextReplaced,
  onRerunSignalAnalysis,
  originalResumeBeforeCalibration,
}: CalibratedResumeTabProps) => {
  const {
    assembledResume, loading, error, step, assemble,
    confidence, pendingResume, confirmResume, skipConfirmation, reset: resetAssembly,
  } = useResumeAssembly();
  const { editedResume, editMode, setEditMode, saved, updateField } = useResumeEditor(assembledResume);

  const currentResume = editedResume || assembledResume;
  const [showPdfFallback, setShowPdfFallback] = useState(false);
  const autoAssembledRef = useRef(false);

  // Clear stale calibrated resume when a new alignment run starts (hasCurrentSessionAlignment resets to false)
  const prevAlignmentRef = useRef(hasCurrentSessionAlignment);
  useEffect(() => {
    if (prevAlignmentRef.current && !hasCurrentSessionAlignment) {
      resetAssembly();
      autoAssembledRef.current = false;
    }
    prevAlignmentRef.current = hasCurrentSessionAlignment;
  }, [hasCurrentSessionAlignment, resetAssembly]);

  useEffect(() => {
    if (assembledResume && onAssembled) onAssembled();
  }, [assembledResume, onAssembled]);

  const preExtractedContact = useMemo(
    () => extractContactFromText(originalResume),
    [originalResume]
  );

  // Gate CTA handles upgrade prompting inline — no auto-trigger modal

  const handleAssemble = (overrideResume?: string) => {
    const resumeText = overrideResume || originalResume;
    const contact = overrideResume ? extractContactFromText(overrideResume) : preExtractedContact;
    assemble(directorResult, resumeText, contact, alignmentResult as Record<string, unknown>);
  };

  // When confidence is low AND input was PDF, show fallback instead of confirm step
  // DOCX with successfully extracted experience should auto-confirm, never trigger fallback
  useEffect(() => {
    if (pendingResume && confidence?.isLow) {
      if (inputSource === "docx" && pendingResume.experience.length > 0) {
        // DOCX parsed successfully — skip confirmation entirely
        skipConfirmation();
        return;
      }
      if (inputSource === "pdf") {
        setShowPdfFallback(true);
      }
    }
  }, [pendingResume, confidence, inputSource]);

  // autoAssembledRef declared above
  useEffect(() => {
    if (isPro && hasCurrentSessionAlignment && !currentResume && !pendingResume && !loading && !error && !autoAssembledRef.current && !showPdfFallback) {
      autoAssembledRef.current = true;
      handleAssemble();
    }
  }, [isPro, hasCurrentSessionAlignment, currentResume, pendingResume, loading, error, showPdfFallback]);

  const handleExportDocx = () => {
    if (!currentResume) return;
    exportCalibratedDocx(currentResume);
    toast.success("ATS resume exported");
  };

  const handleExportPdf = () => {
    if (!currentResume) return;
    exportCalibratedPdf(currentResume);
  };

  const handleCleanTextProvided = (text: string) => {
    setShowPdfFallback(false);
    autoAssembledRef.current = false;
    onResumeTextReplaced?.(text);
    // Re-assemble with the clean text
    const contact = extractContactFromText(text);
    assemble(directorResult, text, contact, alignmentResult as Record<string, unknown>);
  };

  const handleContinueWithEditMode = () => {
    setShowPdfFallback(false);
    // Skip to the field confirmation step (already have pendingResume)
  };

  if (!isPro) {
    return <CalibratedResumeGateCTA onUpgrade={onUpgrade} />;
  }

  if (!hasCurrentSessionAlignment) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card min-h-[300px] gap-3 p-8">
          <AlertTriangle className="h-8 w-8" style={{ color: "#F59E0B" }} />
          <h3 className="text-base font-semibold text-foreground">Run an alignment first to generate your Calibrated Resume</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            The Calibrated Resume requires a completed alignment run in this session. Paste your resume and job description in the Alignment Engine to get started.
          </p>
          {onRunAlignment && (
            <Button onClick={onRunAlignment} variant="outline" className="gap-2 mt-2">
              <Sparkles className="h-4 w-4" />
              Run Alignment →
            </Button>
          )}
        </div>
      </div>
    );
  }

  // PDF fallback: confidence is low, show guided options instead of contaminated output
  if (showPdfFallback && pendingResume && confidence?.isLow) {
    return (
      <PdfFallbackState
        onCleanTextProvided={handleCleanTextProvided}
        onContinueWithEditMode={handleContinueWithEditMode}
      />
    );
  }

  return (
    <div className="max-w-5xl md:max-w-tool mx-auto space-y-4">
      {!currentResume && !pendingResume && !loading && !error && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card min-h-[200px] gap-4 p-8">
          <p className="text-sm text-muted-foreground">Preparing to assemble your calibrated resume…</p>
        </div>
      )}

      {loading && <ResumeAssemblyLoader currentStep={step} />}

      {error && !loading && (
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Assembly interrupted</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{error}</p>
            </div>
          </div>
          <Button
            onClick={() => handleAssemble()}
            variant="outline"
            className="w-full gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Retry Assembly
          </Button>
        </div>
      )}

      {/* Low-confidence confirmation step (non-PDF, or after user chose "Review & Edit") */}
      {pendingResume && !loading && !currentResume && confidence && !showPdfFallback && (
        <ResumeStructureConfirm
          resume={pendingResume}
          issues={confidence.issues}
          onConfirm={confirmResume}
          onSkip={skipConfirmation}
        />
      )}


      {currentResume && !loading && (
        <>
          {/* Name prompt when extraction failed */}
          {!currentResume.header.name && <NamePrompt onSubmit={(name) => updateField("header.name", name)} />}

          <ResumeToolbar
            editMode={editMode}
            onToggleEdit={() => setEditMode(!editMode)}
            onReassemble={() => handleAssemble()}
            onExportDocx={handleExportDocx}
            onExportPdf={handleExportPdf}
            loading={loading}
            saved={saved}
          />

          <div
            className="rounded-lg py-8 px-4 bg-muted"
          >
            <div id="resume-canvas">
              <ResumeCanvas
                resume={currentResume}
                editMode={editMode}
                onUpdate={updateField}
                saved={saved}
              />
            </div>
          </div>

          <SignalKeywordsBlock keywords={currentResume.signal_keywords} />

          <RepositioningChangesPanel
            originalResume={originalResume}
            calibratedResume={currentResume}
            jdText={jdText}
          />

          {/* Re-run Signal Analysis with calibrated text */}
          {onRerunSignalAnalysis && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex-1 min-w-0 space-y-0.5">
                <p className="text-sm font-medium text-foreground">See your new score</p>
                <p className="text-xs text-muted-foreground">
                  {originalResumeBeforeCalibration
                    ? "Re-run the Alignment Engine with your calibrated resume to measure the signal improvement."
                    : "Original resume baseline not found — re-run alignment from the Alignment tab first."}
                </p>
              </div>
              <Button
                size="sm"
                className="gap-2 shrink-0"
                disabled={!originalResumeBeforeCalibration}
                onClick={() => {
                  const text = resumeDataToText(currentResume);
                  onRerunSignalAnalysis(text);
                }}
              >
                <RefreshCw className="h-4 w-4" />
                Re-score Now
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

function CalibratedResumeGateCTA({ onUpgrade }: { onUpgrade: () => void }) {
  const { user } = useAuth();
  const { hasConsumedOneTimeCredit } = useSubscription();
  const ctaLabel = hasConsumedOneTimeCredit ? "Buy Another Single Report — $9" : "Fix This Now → $9";
  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card min-h-[300px] gap-4 p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <span className="text-2xl text-primary">✦</span>
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-bold text-foreground tracking-tight">
            Your resume is ready to be repositioned — not rewritten
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
            {user
              ? "The Calibrated Resume takes your exact experience and repositions every bullet to match the signals this role actually weights. No fabrication — just professional framing."
              : "Sign up to access the Calibrated Resume builder — repositioned from your real experience."}
          </p>
          {user && (
            <p className="text-[11px] font-semibold text-destructive/80">Submitting your current version means the same gaps keep filtering you out.</p>
          )}
        </div>
        {user ? (
          <div className="space-y-3 w-full max-w-xs">
            <Button onClick={onUpgrade} size="lg" className="gap-2 w-full">
              {ctaLabel}
            </Button>
            <p className="text-[11px] text-destructive/70 italic text-center">Every application you send without fixing this is likely being ignored.</p>
          </div>
        ) : (
          <Button size="lg" className="gap-2" asChild>
            <a href="/auth">Get Started Free</a>
          </Button>
        )}
      </div>
    </div>
  );
}

function NamePrompt({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="rounded-lg border border-dashed bg-card p-5 flex flex-col sm:flex-row items-start sm:items-center gap-3">
      <User className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5 sm:mt-0" />
      <div className="flex-1 space-y-1">
        <p className="text-sm font-medium text-foreground">Enter your full name</p>
        <p className="text-xs text-muted-foreground">We couldn't extract your name automatically. Please type it below.</p>
      </div>
      <div className="flex items-center gap-2 w-full sm:w-auto">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. Demetri Simpson"
          className="h-9 text-sm w-full sm:w-52"
        />
        <Button
          size="sm"
          disabled={value.trim().length < 2}
          onClick={() => onSubmit(value.trim())}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

export default CalibratedResumeTab;
