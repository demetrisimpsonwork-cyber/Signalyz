import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  feedbackStorageKey,
  hasSubmittedFeedback,
  submitUserFeedback,
  type FeedbackOutcome,
  type FeedbackSource,
} from "@/lib/userFeedback";
import type { PlanTier } from "@/lib/analytics";

interface ReportFeedbackPanelProps {
  source?: FeedbackSource;
  requestId?: string;
  reportRunFingerprint?: string;
  pipelineVersion?: string;
  planTier?: PlanTier;
}

function ChoiceButton({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
        selected
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

export function ReportFeedbackPanel({
  source = "hiring_report",
  requestId,
  reportRunFingerprint,
  pipelineVersion,
  planTier,
}: ReportFeedbackPanelProps) {
  const storageKey = useMemo(
    () => feedbackStorageKey(requestId, reportRunFingerprint),
    [requestId, reportRunFingerprint],
  );

  const [submitted, setSubmitted] = useState(() => hasSubmittedFeedback(requestId, reportRunFingerprint));
  const [useful, setUseful] = useState<boolean | null>(null);
  const [applied, setApplied] = useState<boolean | null>(null);
  const [outcome, setOutcome] = useState<FeedbackOutcome | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (submitted) {
    return (
      <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-center">
        <p className="text-xs text-muted-foreground">Thanks — your feedback helps us improve Signalyz.</p>
      </div>
    );
  }

  const handleSubmit = async () => {
    if (useful === null) {
      toast.error("Let us know if this was useful.");
      return;
    }
    setSubmitting(true);
    const result = await submitUserFeedback({
      source,
      useful,
      appliedWithResume: applied,
      outcome: applied ? outcome : null,
      comment,
      requestId,
      reportRunFingerprint,
      pipelineVersion,
      planTier,
    });
    setSubmitting(false);
    if (!result.ok) {
      toast.error("Could not save feedback. Please try again.");
      return;
    }
    setSubmitted(true);
    toast.success("Feedback submitted");
  };

  return (
    <div className="rounded-lg border border-border/60 bg-card px-4 py-4 space-y-4" data-feedback-key={storageKey}>
      <div>
        <p className="text-xs font-semibold text-foreground">Quick feedback</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">Help us improve — takes ~15 seconds.</p>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-medium text-muted-foreground">Was this useful?</p>
        <div className="flex flex-wrap gap-2">
          <ChoiceButton label="Yes" selected={useful === true} onClick={() => setUseful(true)} />
          <ChoiceButton label="No" selected={useful === false} onClick={() => setUseful(false)} />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-medium text-muted-foreground">Did you apply with this resume?</p>
        <div className="flex flex-wrap gap-2">
          <ChoiceButton label="Yes" selected={applied === true} onClick={() => setApplied(true)} />
          <ChoiceButton
            label="No"
            selected={applied === false}
            onClick={() => {
              setApplied(false);
              setOutcome(null);
            }}
          />
        </div>
      </div>

      {applied === true && (
        <div className="space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground">What happened so far?</p>
          <div className="flex flex-wrap gap-2">
            <ChoiceButton label="Got interview" selected={outcome === "interview"} onClick={() => setOutcome("interview")} />
            <ChoiceButton label="Rejected" selected={outcome === "rejected"} onClick={() => setOutcome("rejected")} />
            <ChoiceButton label="Still waiting" selected={outcome === "waiting"} onClick={() => setOutcome("waiting")} />
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-[11px] font-medium text-muted-foreground">Anything else? (optional)</p>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="What worked or what felt off?"
          className="min-h-[72px] text-xs resize-none"
          maxLength={2000}
        />
      </div>

      <Button size="sm" className="w-full sm:w-auto" disabled={submitting} onClick={handleSubmit}>
        {submitting ? "Sending…" : "Submit feedback"}
      </Button>
    </div>
  );
}
