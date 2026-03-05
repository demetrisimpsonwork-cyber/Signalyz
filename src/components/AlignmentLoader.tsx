import { useEffect, useState, useRef } from "react";
import { Check, Clock } from "lucide-react";

const STEPS = [
  { label: "Extracting employer priority signals…", duration: 6000 },
  { label: "Mapping your experience to weighted themes…", duration: 10000 },
  { label: "Scoring alignment across 5 dimensions…", duration: 12000 },
  { label: "Generating strategic positioning insights…", duration: 10000 },
  { label: "Applying calibration filter…", duration: 7000 },
];

interface AlignmentLoaderProps {
  minHeight?: string;
}

const AlignmentLoader = ({ minHeight = "280px" }: AlignmentLoaderProps) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [stepProgress, setStepProgress] = useState(0);
  const stepStartRef = useRef(Date.now());

  // Advance steps based on their individual durations
  useEffect(() => {
    if (activeIndex >= STEPS.length) return;
    stepStartRef.current = Date.now();
    setStepProgress(0);

    const stepDuration = STEPS[activeIndex].duration;
    const progressInterval = setInterval(() => {
      const now = Date.now();
      const pct = Math.min((now - stepStartRef.current) / stepDuration, 1);
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

  return (
    <div
      className="flex flex-col justify-center rounded-lg border bg-card px-6 py-8 animate-fade-in"
      style={{ minHeight }}
    >
      {/* Overall progress bar */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-foreground">Analyzing alignment</span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {elapsed}s
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
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

      <p className="text-center text-xs text-muted-foreground leading-relaxed">
        {elapsed >= 50
          ? "Almost there — finalizing your signal analysis."
          : elapsed >= 30
          ? "Complex resumes take up to 60 seconds. Hang tight."
          : elapsed >= 15
          ? "Deep analysis in progress — scoring across 5 dimensions."
          : "Full resume + job description analyses typically take 30–45 seconds."}
      </p>
    </div>
  );
};

export default AlignmentLoader;
