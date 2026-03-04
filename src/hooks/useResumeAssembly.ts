import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { DirectorCalibrationResult } from "@/components/DirectorCalibrationBlock";

export interface CalibratedResumeData {
  header: {
    name: string;
    title: string;
    email: string;
    phone: string;
    linkedin: string;
    location: string;
  };
  summary: string;
  core_competencies: string[];
  experience: Array<{
    company: string;
    title: string;
    dates: string;
    bullets: string[];
  }>;
  education: Array<{
    institution: string;
    degree: string;
    year: string;
  }>;
  signal_keywords: string[];
}

interface UseResumeAssemblyReturn {
  assembledResume: CalibratedResumeData | null;
  loading: boolean;
  error: string | null;
  step: number;
  assemble: (directorResult: DirectorCalibrationResult, originalResume: string) => Promise<void>;
}

const STEPS = [
  "Pulling signal-optimized components…",
  "Calibrating language coherence…",
  "Assembling final document…",
];

export function useResumeAssembly(): UseResumeAssemblyReturn {
  const [assembledResume, setAssembledResume] = useState<CalibratedResumeData | null>(() => {
    try {
      const saved = localStorage.getItem("resumix_calibrated_resume");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  const assemble = useCallback(async (directorResult: DirectorCalibrationResult, originalResume: string) => {
    setLoading(true);
    setError(null);
    setStep(0);

    // Animate through steps
    const stepTimers = [
      setTimeout(() => setStep(1), 1200),
      setTimeout(() => setStep(2), 2400),
    ];

    try {
      const { data, error: fnError } = await supabase.functions.invoke("assemble-calibrated-resume", {
        body: { directorResult, originalResume },
      });

      stepTimers.forEach(clearTimeout);

      if (fnError) throw new Error(fnError.message || "Assembly failed");
      if (data?.status === "error") throw new Error(data.message || "Assembly failed");

      const resume: CalibratedResumeData = {
        header: data.header || { name: "", title: "", email: "", phone: "", linkedin: "", location: "" },
        summary: data.summary || "",
        core_competencies: data.core_competencies || [],
        experience: data.experience || [],
        education: data.education || [],
        signal_keywords: data.signal_keywords || [],
      };

      setAssembledResume(resume);
      setStep(3); // done

      // Persist
      try {
        localStorage.setItem("resumix_calibrated_resume", JSON.stringify(resume));
      } catch {}
    } catch (err: any) {
      setError(err.message || "Failed to assemble resume. Please retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  return { assembledResume, loading, error, step, assemble };
}
