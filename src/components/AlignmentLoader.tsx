import { useEffect, useState } from "react";
import { Check } from "lucide-react";

const STEPS = [
  "Extracting employer priority signals…",
  "Mapping your experience to weighted themes…",
  "Generating strategic positioning insights…",
  "Applying Pinnacle filter…",
];

const STEP_INTERVAL_MS = 3000;

interface AlignmentLoaderProps {
  minHeight?: string;
}

const AlignmentLoader = ({ minHeight = "280px" }: AlignmentLoaderProps) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setActiveIndex((prev) => Math.min(prev + 1, STEPS.length - 1));
    }, STEP_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setElapsed((p) => p + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="flex flex-col justify-center rounded-lg border bg-card px-6 py-8 animate-fade-in"
      style={{ minHeight }}
    >
      <div className="space-y-4 mb-6">
        {STEPS.map((label, i) => {
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
                  {label}
                </p>
                {active && (
                  <div className="mt-2 h-0.5 w-full rounded-full bg-border overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        animation: `loader-fill ${STEP_INTERVAL_MS}ms linear forwards`,
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground leading-relaxed">
        {elapsed >= 18
          ? "Signal analysis is taking longer than expected. Hang tight — complex resumes take up to 60 seconds."
          : "Full resume + job description analyses typically take 20–40 seconds."}
      </p>
    </div>
  );
};

export default AlignmentLoader;
