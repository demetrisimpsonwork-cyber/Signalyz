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

      // Sanitize header fields: reject values that look like bullet fragments or contact info in wrong fields
      const sanitizeName = (name: string): string => {
        if (!name || name === "Full Name") return "";
        // Reject names that are obviously section headers or bullet text
        if (/^(EXPERIENCE|EDUCATION|SKILLS|SUMMARY|PROFILE|CONTACT)/i.test(name.trim())) return "";
        if (name.length > 60) return "";
        return name;
      };
      const sanitizeLocation = (loc: string): string => {
        if (!loc) return "";
        // Reject locations that contain action verbs or resume keywords
        const firstWord = loc.split(/[\s,]/)[0]?.toLowerCase() || "";
        const actionVerbs = ["communicate","communicated","managed","led","developed","created","built","improved","directed","established","implemented","executed","organized","analyzed","designed","maintained","delivered","coordinated","supported","reduced","increased","streamlined","automated","facilitated","negotiated","spearheaded","launched","oversaw","supervised","trained","partnered","resolved","provided","reported","documented","monitored","tracked","planned","produced","optimized"];
        if (actionVerbs.includes(firstWord)) return "";
        if (/\b(benefits|resources|operations|marketing|finance|technology|information|administration|management)\b/i.test(loc)) return "";
        return loc;
      };
      const sanitizeField = (val: string): string => {
        if (!val) return "";
        // A field value should not be a phone number if it's not the phone field, etc.
        return val;
      };

      const cleanName = sanitizeName(rawHeader.name) || sanitizeName(preExtractedContact?.name || "") || "";
      const cleanLocation = sanitizeLocation(rawHeader.location) || sanitizeLocation(preExtractedContact?.location || "") || "";

      const mergedHeader = {
        name: cleanName,
        title: rawHeader.title || "",
        email: rawHeader.email || preExtractedContact?.email || "",
        phone: rawHeader.phone || preExtractedContact?.phone || "",
        linkedin: rawHeader.linkedin || preExtractedContact?.linkedin || "",
        location: cleanLocation,
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
