import { useState, useCallback } from "react";
import type { DirectorCalibrationResult } from "@/components/DirectorCalibrationBlock";
import type { ExtractedContactInfo } from "@/lib/contactExtractor";
import { invokeResilient, FRIENDLY_FAIL_MSG } from "@/lib/resilientEdgeFn";

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
  assemble: (directorResult: DirectorCalibrationResult | null, originalResume: string, preExtractedContact?: ExtractedContactInfo, alignmentResult?: Record<string, unknown>) => Promise<void>;
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

  const assemble = useCallback(async (directorResult: DirectorCalibrationResult | null, originalResume: string, preExtractedContact?: ExtractedContactInfo, alignmentResult?: Record<string, unknown>) => {
    setLoading(true);
    setError(null);
    setStep(0);

    const stepTimers = [
      setTimeout(() => setStep(1), 1200),
      setTimeout(() => setStep(2), 2400),
    ];

    let data: any = null;
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        data = await invokeResilient(
          "assembly",
          "assemble-calibrated-resume",
          { directorResult: directorResult || undefined, originalResume, alignmentResult: alignmentResult || undefined },
          120_000,
        );
        break;
      } catch (err: any) {
        const isFriendly = err.message === FRIENDLY_FAIL_MSG;
        if (isFriendly && attempts < maxAttempts) {
          console.log("[useResumeAssembly] Attempt", attempts, "failed, retrying...");
          setStep(0);
          continue;
        }
        stepTimers.forEach(clearTimeout);
        setError(isFriendly ? FRIENDLY_FAIL_MSG : (err.message || FRIENDLY_FAIL_MSG));
        setLoading(false);
        return;
      }
    }

    stepTimers.forEach(clearTimeout);

    if (!data) {
      setError("Resume generation is taking longer than expected. Try again — your alignment data is saved.");
      setLoading(false);
      return;
    }

    try {
      if (data?.status === "partial" && data?.retry) {
        console.warn("[useResumeAssembly] Received partial result, using Phase 1 structure");
      }

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
      setStep(3);

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
