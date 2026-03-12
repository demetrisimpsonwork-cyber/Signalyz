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
import ResumeStructureConfirm from "@/components/ResumeStructureConfirm";
import PdfFallbackState from "@/components/PdfFallbackState";
import { exportCalibratedDocx } from "@/lib/exportDocx";
import { exportCalibratedPdf } from "@/lib/exportPdf";
import { extractContactFromText } from "@/lib/contactExtractor";
import type { ResumeInputSource } from "@/components/ResumeUpload";

interface CalibratedResumeTabProps {
  isPro: boolean;
  onUpgrade: () => void;
  directorResult: DirectorCalibrationResult | null;
  originalResume: string;
  onSwitchToReport?: () => void;
  hasCurrentSessionAlignment?: boolean;
  onRunAlignment?: () => void;
  onAssembled?: () => void;
  alignmentResult?: Record<string, unknown>;
  inputSource?: ResumeInputSource;
  onResumeTextReplaced?: (text: string) => void;
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
  inputSource = "paste",
  onResumeTextReplaced,
}: CalibratedResumeTabProps) => {
  const {
    assembledResume, loading, error, step, assemble,
    confidence, pendingResume, confirmResume, skipConfirmation,
  } = useResumeAssembly();
  const { editedResume, editMode, setEditMode, saved, updateField } = useResumeEditor(assembledResume);

  const currentResume = editedResume || assembledResume;
  const [showPdfFallback, setShowPdfFallback] = useState(false);

  useEffect(() => {
    if (assembledResume && onAssembled) onAssembled();
  }, [assembledResume, onAssembled]);

  const preExtractedContact = useMemo(
    () => extractContactFromText(originalResume),
    [originalResume]
  );

  useEffect(() => {
    if (!isPro) onUpgrade();
  }, [isPro, onUpgrade]);

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

  const autoAssembledRef = useRef(false);
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
        <div className="rounded-xl border bg-[#0F1C2E] p-6 space-y-4">
          <p className="text-sm text-white leading-relaxed">{error}</p>
          <Button
            onClick={() => handleAssemble()}
            variant="outline"
            className="w-full gap-2 border-white/20 text-white hover:bg-white/10"
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
            className="rounded-lg py-8 px-4"
            style={{ backgroundColor: "#F3F4F6" }}
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
        </>
      )}
    </div>
  );
};

function CalibratedResumeGateCTA({ onUpgrade }: { onUpgrade: () => void }) {
  const { user } = useAuth();
  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card min-h-[300px] gap-4 p-8 text-center">
        <Lock className="h-8 w-8 text-muted-foreground" />
        <h3 className="text-lg font-bold text-foreground">Your Calibrated Resume is ready to assemble</h3>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
          {user ? "Upgrade to Pro to auto-assemble, edit, and export your signal-optimized resume." : "Sign up to access resume assembly — 3 free analyses included."}
        </p>
        {user ? (
          <Button onClick={onUpgrade} size="lg" className="gap-2">
            <Lock className="h-4 w-4" />
            Unlock Calibrated Resume
          </Button>
        ) : (
          <Button size="lg" className="gap-2" asChild>
            <a href="/auth">Get Started Free</a>
          </Button>
        )}
      </div>
    </div>
  );
}

export default CalibratedResumeTab;
