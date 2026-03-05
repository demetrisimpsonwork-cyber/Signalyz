import { useState, useMemo } from "react";
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
import { exportCalibratedPdf } from "@/lib/exportPdf";

/** Check if the director result has the minimum sections needed for assembly */
function hasRequiredSections(result: DirectorCalibrationResult | null): boolean {
  if (!result) return false;
  // Need at least gap_analyzer (bullets) or export_builder (resume text) or signal_classifier
  const hasGapAnalyzer = !!(result as any).gap_analyzer?.rewrite_targets?.length;
  const hasExportBuilder = !!(result as any).export_builder?.final_resume_text;
  const hasSignalClassifier = !!(result as any).signal_classifier;
  const hasDimensions = !!(result as any).dimensions?.length;
  return hasGapAnalyzer || hasExportBuilder || hasSignalClassifier || hasDimensions;
}

interface CalibratedResumeTabProps {
  isPro: boolean;
  onUpgrade: () => void;
  directorResult: DirectorCalibrationResult | null;
  originalResume: string;
  onSwitchToReport?: () => void;
}

const CalibratedResumeTab = ({
  isPro,
  onUpgrade,
  directorResult,
  originalResume,
  onSwitchToReport,
}: CalibratedResumeTabProps) => {
  const { assembledResume, loading, error, step, assemble } = useResumeAssembly();
  const { editedResume, editMode, setEditMode, saved, updateField } = useResumeEditor(assembledResume);

  const currentResume = editedResume || assembledResume;

  // Pre-extract contact info from resume text (client-side, no API)
  const preExtractedContact = useMemo(
    () => extractContactFromText(originalResume),
    [originalResume]
  );

  const handleAssemble = () => {
    if (!hasRequiredSections(directorResult)) {
      toast.error("Run the Signal Positioning Report first to generate your calibrated resume.");
      return;
    }
    assemble(directorResult!, originalResume, preExtractedContact);
  };

  const handleExportDocx = () => {
    if (!currentResume) return;
    exportCalibratedDocx(currentResume);
    toast.success("ATS resume exported");
  };

  const handleExportPdf = () => {
    exportCalibratedPdf("resume-canvas");
  };

  // Pro gate — blurred preview
  if (!isPro) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Blurred ghost preview */}
        <div className="relative">
          <div
            className="rounded-sm mx-auto bg-white p-10 space-y-6"
            style={{
              maxWidth: "720px",
              filter: "blur(6px)",
              boxShadow: "0 4px 32px rgba(0,0,0,0.12)",
              userSelect: "none",
              pointerEvents: "none",
            }}
          >
            <div className="text-center space-y-2">
              <div className="h-6 w-48 bg-gray-200 rounded mx-auto" />
              <div className="h-3 w-32 bg-gray-100 rounded mx-auto" />
              <div className="h-2 w-56 bg-gray-100 rounded mx-auto" />
            </div>
            <div className="h-px bg-gray-200" />
            <div className="space-y-1.5">
              <div className="h-2.5 w-24 bg-gray-200 rounded" />
              <div className="h-2 w-full bg-gray-100 rounded" />
              <div className="h-2 w-5/6 bg-gray-100 rounded" />
            </div>
            <div className="space-y-1.5">
              <div className="h-2.5 w-28 bg-gray-200 rounded" />
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-4 w-16 bg-gray-100 rounded-full" />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-2.5 w-20 bg-gray-200 rounded" />
              <div className="h-3 w-40 bg-gray-200 rounded" />
              <div className="h-2 w-full bg-gray-100 rounded" />
              <div className="h-2 w-full bg-gray-100 rounded" />
              <div className="h-2 w-3/4 bg-gray-100 rounded" />
            </div>
          </div>

          {/* Overlay CTA */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-xl border bg-card p-8 text-center space-y-4 shadow-lg max-w-md">
              <h3 className="text-lg font-bold text-foreground">Your Calibrated Resume is ready to assemble</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Upgrade to Pro to auto-assemble, edit, and export your signal-optimized resume.
              </p>
              <Button onClick={onUpgrade} size="lg" className="w-full gap-2">
                <Lock className="h-4 w-4" />
                Unlock Calibrated Resume
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // No director result or missing required sections
  if (!currentResume && !hasRequiredSections(directorResult)) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card min-h-[300px] gap-3 p-8">
          <AlertTriangle className="h-8 w-8" style={{ color: "#F59E0B" }} />
          <h3 className="text-base font-semibold text-foreground">No signal report detected</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Run the Signal Positioning Report first — the Calibrated Resume assembles directly from your deep analysis.
          </p>
          {onSwitchToReport && (
            <Button onClick={onSwitchToReport} variant="outline" className="gap-2 mt-2">
              <Sparkles className="h-4 w-4" />
              Go to Signal Positioning Report
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Assembly trigger or loading */}
      {!currentResume && !loading && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card min-h-[200px] gap-4 p-8">
          <p className="text-sm text-muted-foreground">Signal Positioning Report detected. Ready to assemble.</p>
          <Button onClick={handleAssemble} size="lg" className="gap-2">
            <Sparkles className="h-4 w-4" />
            Assemble Calibrated Resume
          </Button>
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

export default CalibratedResumeTab;
