import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Lock, Sparkles, AlertTriangle } from "lucide-react";
import CoverLetterEngine from "@/components/CoverLetterEngine";

interface CoverLetterTabProps {
  isPro: boolean;
  onUpgrade: () => void;
  experience: string;
  jd: string;
  alignmentResult: Record<string, unknown>;
  inferredRole: string;
  hasCurrentSessionAlignment?: boolean;
  onRunAlignment?: () => void;
}

const CoverLetterTab = ({
  isPro,
  onUpgrade,
  experience,
  jd,
  alignmentResult,
  inferredRole,
  hasCurrentSessionAlignment = false,
  onRunAlignment,
}: CoverLetterTabProps) => {
  // Auto-trigger upgrade modal for non-Pro users
  useEffect(() => {
    if (!isPro) onUpgrade();
  }, [isPro, onUpgrade]);

  if (!isPro) {
    return <CoverLetterGateCTA onUpgrade={onUpgrade} />;
  }

  if (!hasCurrentSessionAlignment) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card min-h-[300px] gap-3 p-5">
          <AlertTriangle className="h-8 w-8" style={{ color: "#F59E0B" }} />
          <h3 className="text-base font-semibold text-foreground">Run an alignment first to generate your Cover Letter</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            The Cover Letter requires a completed alignment run in this session. Paste your resume and job description in the Alignment Engine to get started.
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
    <div className="max-w-3xl mx-auto">
      <CoverLetterEngine
        experience={experience}
        jd={jd}
        alignmentResult={alignmentResult}
        inferredRole={inferredRole}
        isPro={isPro}
        onUpgrade={onUpgrade}
      />
    </div>
  );
};

function CoverLetterGateCTA({ onUpgrade }: { onUpgrade: () => void }) {
  const { user } = useAuth();
  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card min-h-[300px] gap-4 p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <span className="text-2xl text-primary">✦</span>
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-bold text-foreground tracking-tight">
            Your cover letter is reinforcing the same gaps your resume has
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
            {user
              ? "A signal-calibrated cover letter closes the positioning gap your resume can't fix alone — framed around the exact signals this role weights."
              : "Sign up to generate a signal-calibrated cover letter built from your alignment analysis."}
          </p>
          {user && (
            <p className="text-[11px] font-semibold text-destructive/80">Generic cover letters get skipped — this one addresses your specific blocker.</p>
          )}
        </div>
        {user ? (
          <div className="space-y-3 w-full max-w-xs">
            <Button onClick={onUpgrade} size="lg" className="gap-2 w-full">
              Fix This Now → $9
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

export default CoverLetterTab;
