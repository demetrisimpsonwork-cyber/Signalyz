import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { DirectorCalibrationResult } from "@/components/DirectorCalibrationBlock";
import type { ExtractedContactInfo } from "@/lib/contactExtractor";

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
  independent_projects: Array<{
    name: string;
    description: string;
    bullets: string[];
  }>;
  skills: string[];
  certifications: string[];
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
  assemble: (directorResult: DirectorCalibrationResult, originalResume: string, preExtractedContact?: ExtractedContactInfo) => Promise<void>;
}

const STEPS = [
  "Pulling signal-optimized components…",
  "Calibrating language coherence…",
  "Assembling final document…",
];

export function useResumeAssembly(): UseResumeAssemblyReturn {
  const [assembledResume, setAssembledResume] = useState<CalibratedResumeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  const assemble = useCallback(async (directorResult: DirectorCalibrationResult, originalResume: string, preExtractedContact?: ExtractedContactInfo) => {
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

      // Handle partial result with retry flag
      if (data?.status === "partial" && data?.retry) {
        // Use the partial result but show a message
        console.warn("[useResumeAssembly] Received partial result, using Phase 1 structure");
      }

      // Merge pre-extracted contact into header (fill gaps only)
      const rawHeader = data.header || { name: "", title: "", email: "", phone: "", linkedin: "", location: "" };
      const mergedHeader = {
        name: rawHeader.name || preExtractedContact?.name || "",
        title: rawHeader.title || "",
        email: rawHeader.email || preExtractedContact?.email || "",
        phone: rawHeader.phone || preExtractedContact?.phone || "",
        linkedin: rawHeader.linkedin || preExtractedContact?.linkedin || "",
        location: rawHeader.location || preExtractedContact?.location || "",
      };

      const resume: CalibratedResumeData = {
        header: mergedHeader,
        summary: data.summary || "",
        core_competencies: data.core_competencies || [],
        experience: data.experience || [],
        independent_projects: data.independent_projects || [],
        skills: data.skills || [],
        certifications: data.certifications || [],
        education: data.education || [],
        signal_keywords: data.signal_keywords || [],
      };

      setAssembledResume(resume);
      setStep(3); // done

      // Persist
      try {
        localStorage.setItem("resumix_calibrated_resume_data", JSON.stringify(resume));
      } catch {}
    } catch (err: any) {
      setError(err.message || "Failed to assemble resume. Please retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  return { assembledResume, loading, error, step, assemble };
}
