import { Check, ShieldCheck } from "lucide-react";

const STEPS = [
  "Pulling your strongest, evidence-backed points…",
  "Refining the writing so it reads naturally…",
  "Building your calibrated resume…",
];

interface ResumeAssemblyLoaderProps {
  currentStep: number;
}

const ResumeAssemblyLoader = ({ currentStep }: ResumeAssemblyLoaderProps) => {
  const activeLabel = STEPS[Math.min(currentStep, STEPS.length - 1)] ?? "";
  return (
    <div
      className="flex flex-col justify-center rounded-lg border bg-card px-5 py-7 sm:px-6 sm:py-8 animate-fade-in"
      style={{ minHeight: "200px" }}
      role="status"
      aria-live="polite"
      aria-label="Building your calibrated resume"
    >
      <span className="sr-only">{currentStep >= 3 ? "Optimized resume generated." : activeLabel}</span>
      <div className="space-y-4 mb-4">
        {STEPS.map((label, i) => {
          const done = i < currentStep;
          const active = i === currentStep;
          return (
            <div
              key={i}
              className={`flex items-start gap-3 transition-opacity duration-500 ${active || done ? "opacity-100" : "opacity-30"}`}
            >
              <div
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold transition-colors duration-500 ${
                  done
                    ? "border-primary bg-primary text-primary-foreground"
                    : active
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground"
                }`}
              >
                {done ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm leading-snug transition-colors duration-300 ${
                  active ? "font-semibold text-foreground" : done ? "font-medium text-primary" : "text-muted-foreground"
                }`}>
                  {label}
                </p>
                {active && (
                  <div className="mt-2 h-0.5 w-full rounded-full bg-border overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ animation: "loader-fill 1200ms linear forwards" }} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {currentStep < 3 ? (
        <div className="flex items-center justify-center gap-1.5 text-xs text-primary/90" aria-hidden="true">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          <span>Built only from your real experience — nothing invented.</span>
        </div>
      ) : (
        <p className="text-center text-xs text-primary font-medium">Optimized resume generated. Ready to refine.</p>
      )}
    </div>
  );
};

export default ResumeAssemblyLoader;
