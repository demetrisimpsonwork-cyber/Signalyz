import { useEffect, useState, useRef } from "react";
import { Check, Clock, ShieldCheck } from "lucide-react";

const STEPS = [
  { label: "Reading your resume and the job…", duration: 12000 },
  { label: "Comparing recruiter and hiring-manager signals…", duration: 12000 },
  { label: "Finding the evidence behind each gap…", duration: 12000 },
  { label: "Projecting your score after repositioning…", duration: 12000 },
  { label: "Generating your hiring report…", duration: 12000 },
];

const CONFIDENCE = [
  "No fabrication — based only on your real experience.",
  "Recruiter-focused, grounded in your resume.",
  "Every finding is backed by your own evidence.",
];

interface PositioningLoaderProps {
  minHeight?: string;
}

const PositioningLoader = ({ minHeight = "300px" }: PositioningLoaderProps) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [stepProgress, setStepProgress] = useState(0);
  const stepStartRef = useRef(Date.now());

  // Advance steps based on individual durations
  useEffect(() => {
    if (activeIndex >= STEPS.length) return;
    stepStartRef.current = Date.now();
    setStepProgress(0);

    const stepDuration = STEPS[activeIndex].duration;
    const progressInterval = setInterval(() => {
      const pct = Math.min((Date.now() - stepStartRef.current) / stepDuration, 1);
      setStepProgress(pct);
    }, 50);

    const timer = setTimeout(() => {
      setActiveIndex((prev) => Math.min(prev + 1, STEPS.length - 1));
    }, stepDuration);

    return () => {
      clearInterval(progressInterval);
      clearTimeout(timer);
    };
  }, [activeIndex]);

  // Elapsed seconds counter
  useEffect(() => {
    const id = setInterval(() => setElapsed((p) => p + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const totalDuration = STEPS.reduce((s, step) => s + step.duration, 0) / 1000;
  const overallProgress = Math.min(
    ((STEPS.slice(0, activeIndex).reduce((s, step) => s + step.duration, 0) +
      STEPS[activeIndex].duration * stepProgress) /
      (totalDuration * 1000)) *
      100,
    99
  );

  const confidence = CONFIDENCE[Math.floor(elapsed / 5) % CONFIDENCE.length];
  const activeLabel = STEPS[Math.min(activeIndex, STEPS.length - 1)]?.label ?? "";

  return (
    <div
      className="flex flex-col justify-center rounded-lg border bg-card px-5 py-7 sm:px-6 sm:py-8 animate-fade-in"
      style={{ minHeight }}
      role="status"
      aria-live="polite"
      aria-label="Generating your hiring report"
    >
      <span className="sr-only">{activeLabel}</span>
      {/* Overall progress bar */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-foreground">Generating your hiring report</span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {elapsed}s
          </span>
        </div>
        <div
          className="h-1.5 w-full rounded-full bg-border overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(overallProgress)}
        >
          <div
            className="h-full rounded-full bg-primary transition-all duration-200 ease-out"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-3 mb-5">
        {STEPS.map((step, i) => {
          const done = i < activeIndex;
          const active = i === activeIndex;
          return (
            <div
              key={i}
              className={`flex items-start gap-3 transition-opacity duration-500 ${
                active || done ? "opacity-100" : "opacity-30"
              }`}
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
                <p
                  className={`text-sm leading-snug transition-colors duration-300 ${
                    active
                      ? "font-semibold text-foreground"
                      : done
                      ? "font-medium text-primary"
                      : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </p>
                {active && (
                  <div className="mt-1.5 h-0.5 w-full rounded-full bg-border overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-100 ease-linear"
                      style={{ width: `${stepProgress * 100}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-1.5 text-xs text-primary/90 mb-2" aria-hidden="true">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
        <span className="transition-opacity duration-500">{confidence}</span>
      </div>

      <p className="text-center text-xs text-muted-foreground leading-relaxed">
        {elapsed >= 120
          ? "Almost there — finishing your report."
          : elapsed >= 90
          ? "Longer resumes can take up to 3 minutes. Hang tight."
          : elapsed >= 45
          ? "Running multiple passes for an accurate read."
          : "This usually takes 1–3 minutes. Your data stays private."}
      </p>
    </div>
  );
};

export default PositioningLoader;
