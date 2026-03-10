import { useState, useMemo, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Sparkles, Lock, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { DirectorCalibrationResult } from "@/components/DirectorCalibrationBlock";
import { useResumeAssembly } from "@/hooks/useResumeAssembly";
import { useResumeEditor } from "@/hooks/useResumeEditor";
import ResumeAssemblyLoader from "@/components/ResumeAssemblyLoader";
import ResumeCanvas from "@/components/ResumeCanvas";
import ResumeToolbar from "@/components/ResumeToolbar";
import SignalKeywordsBlock from "@/components/SignalKeywordsBlock";
import { exportCalibratedDocx } from "@/lib/exportDocx";
import { exportCalibratedPdf } from "@/lib/exportPdf";
import { extractContactFromText } from "@/lib/contactExtractor";




interface CalibratedResumeTabProps {
  isPro: boolean;
  onUpgrade: () => void;
  directorResult: DirectorCalibrationResult | null;
  originalResume: string;
  onSwitchToReport?: () => void;
  /** Whether an alignment run exists in the current session (not from localStorage) */
  hasCurrentSessionAlignment?: boolean;
  onRunAlignment?: () => void;
  /** Called when resume assembly completes successfully */
  onAssembled?: () => void;
  /** Alignment result to use when no director result exists */
  alignmentResult?: Record<string, unknown>;
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
}: CalibratedResumeTabProps) => {
  const { assembledResume, loading, error, step, assemble } = useResumeAssembly();
  const { editedResume, editMode, setEditMode, saved, updateField } = useResumeEditor(assembledResume);

  const currentResume = editedResume || assembledResume;

  // Notify parent when assembly completes
  useEffect(() => {
    if (assembledResume && onAssembled) onAssembled();
  }, [assembledResume, onAssembled]);

  // Pre-extract contact info from resume text (client-side, no API)
  const preExtractedContact = useMemo(
    () => extractContactFromText(originalResume),
    [originalResume]
  );

  // Auto-trigger upgrade modal for non-Pro users
  useEffect(() => {
    if (!isPro) onUpgrade();
  }, [isPro, onUpgrade]);

  const handleAssemble = () => {
    assemble(directorResult, originalResume, preExtractedContact, alignmentResult as Record<string, unknown>);
  };

  // Auto-assemble when alignment exists and no resume yet
  const autoAssembledRef = useRef(false);
  useEffect(() => {
    if (isPro && hasCurrentSessionAlignment && !currentResume && !loading && !error && !autoAssembledRef.current) {
      autoAssembledRef.current = true;
      handleAssemble();
    }
  }, [isPro, hasCurrentSessionAlignment, currentResume, loading, error]);

  const handleExportDocx = () => {
    if (!currentResume) return;
    exportCalibratedDocx(currentResume);
    toast.success("ATS resume exported");
  };

  const handleExportPdf = () => {
    if (!currentResume) return;
    // Ensure latest data is in localStorage for PDF export
    try {
      localStorage.setItem("resumix_calibrated_resume_data", JSON.stringify(currentResume));
    } catch {}
    exportCalibratedPdf("resume-canvas");
  };

  // Pro gate — show CTA with button that triggers popup
  if (!isPro) {
    return <CalibratedResumeGateCTA onUpgrade={onUpgrade} />;
  }

  // Gate: require current-session alignment before anything else
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

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Loading state while auto-assembling */}
      {!currentResume && !loading && !error && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card min-h-[200px] gap-4 p-8">
          <p className="text-sm text-muted-foreground">Preparing to assemble your calibrated resume…</p>
        </div>
      )}

      {loading && <ResumeAssemblyLoader currentStep={step} />}

      {error && !loading && (
        <div className="rounded-xl border bg-[#0F1C2E] p-6 space-y-4">
          <p className="text-sm text-white leading-relaxed">{error}</p>
          <Button
            onClick={handleAssemble}
            variant="outline"
            className="w-full gap-2 border-white/20 text-white hover:bg-white/10"
          >
            <RefreshCw className="h-4 w-4" />
            Retry Assembly
          </Button>
        </div>
      )}

      {currentResume && !loading && (
        <>
          <ResumeToolbar
            editMode={editMode}
            onToggleEdit={() => setEditMode(!editMode)}
            onReassemble={handleAssemble}
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
