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

      // ── Strict field validation: reject contaminated content, leave empty if uncertain ──

      const isContactPattern = (v: string): boolean => {
        if (!v) return false;
        if (/[\w.+-]+@[\w.-]+\.\w{2,}/.test(v)) return true;
        if (/(?:\(\d{3}\)[\s.-]?\d{3}[\s.-]?\d{4}|\d{3}[-.\s]\d{3}[-.\s]\d{4}|\b\d{10}\b)/.test(v)) return true;
        if (/\d{1,5}\s+[\w\s]+(?:street|st|avenue|ave|boulevard|blvd|road|rd|drive|dr|lane|ln|court|ct|way)\b/i.test(v)) return true;
        return false;
      };

      const isCamelCaseArtifact = (v: string): boolean => /^[A-Z]{10,}$/.test(v.replace(/\s+/g, ""));

      const actionVerbs = new Set([
        "communicate","communicated","managed","led","developed","created","built",
        "improved","directed","established","implemented","executed","organized",
        "analyzed","designed","maintained","delivered","coordinated","supported",
        "reduced","increased","streamlined","automated","facilitated","negotiated",
        "spearheaded","launched","oversaw","supervised","trained","partnered",
        "resolved","provided","reported","documented","monitored","tracked",
        "planned","produced","optimized",
      ]);

      const startsWithActionVerb = (v: string): boolean => {
        const first = v.split(/[\s,]/)[0]?.toLowerCase() || "";
        return actionVerbs.has(first);
      };

      const resumeKeywords = /\b(benefits|resources|operations|marketing|finance|technology|information|administration|management|services|solutions)\b/i;

      // Name: reject placeholders, section headers, verbs, contact patterns
      const validateName = (name: string): string => {
        if (!name) return "";
        if (/^full\s+name$/i.test(name.trim())) return "";
        if (/^(EXPERIENCE|EDUCATION|SKILLS|SUMMARY|PROFILE|CONTACT|CERTIFICATIONS?)/i.test(name.trim())) return "";
        if (name.length > 60) return "";
        if (isCamelCaseArtifact(name)) return "";
        if (isContactPattern(name)) return "";
        if (startsWithActionVerb(name)) return "";
        return name;
      };

      // Location: must look like "City, ST" — reject bullet fragments
      const validateLocation = (loc: string): string => {
        if (!loc) return "";
        if (startsWithActionVerb(loc)) return "";
        if (resumeKeywords.test(loc)) return "";
        if (isContactPattern(loc)) return "";
        if (isCamelCaseArtifact(loc)) return "";
        // Basic "City, ST" shape check
        if (!/[A-Z][a-z]/.test(loc)) return "";
        return loc;
      };

      const cleanName = validateName(rawHeader.name) || validateName(preExtractedContact?.name || "") || "";
      const cleanLocation = validateLocation(rawHeader.location) || validateLocation(preExtractedContact?.location || "") || "";

      const mergedHeader = {
        name: cleanName,
        title: rawHeader.title && !isCamelCaseArtifact(rawHeader.title) && !isContactPattern(rawHeader.title) ? rawHeader.title : "",
        email: rawHeader.email || preExtractedContact?.email || "",
        phone: rawHeader.phone || preExtractedContact?.phone || "",
        linkedin: rawHeader.linkedin || preExtractedContact?.linkedin || "",
        location: cleanLocation,
      };

      // ── Build experience: reject entries where company/title is contact info ──
      const cleanExperience = (data.experience || []).filter((exp: any) => {
        const company = (exp.company || "").trim();
        const title = (exp.title || "").trim();
        const combined = `${company} ${title}`.trim();
        // Reject if company or title is a phone number, email, or address
        if (isContactPattern(combined)) return false;
        // Reject purely numeric "companies" (phone fragments)
        if (/^[\d()+\-.\s]+$/.test(company)) return false;
        // Reject CamelCase artifacts as company names
        if (isCamelCaseArtifact(company)) return false;
        if (isCamelCaseArtifact(title)) return false;
        return true;
      });

      // Also scrub individual bullets within experience entries
      for (const exp of cleanExperience) {
        if (Array.isArray(exp.bullets)) {
          exp.bullets = exp.bullets.filter((b: string) => {
            if (!b) return false;
            // Remove bullets that are purely contact info
            if (isContactPattern(b) && b.replace(/[\w.+-]+@[\w.-]+\.\w{2,}/g, "").replace(/[\d()+\-.\s]/g, "").trim().length < 5) return false;
            return true;
          });
        }
      }

      // ── Build education: only degree/institution/year content ──
      const cleanEducation = (data.education || []).filter((edu: any) => {
        const inst = (edu.institution || "").trim();
        const deg = (edu.degree || "").trim();
        // Must have at least institution or degree
        if (!inst && !deg) return false;
        // Reject CamelCase artifacts
        if (isCamelCaseArtifact(inst) || isCamelCaseArtifact(deg)) return false;
        // Reject professional titles as institution names
        if (/^(DIRECTOR|MANAGER|SPECIALIST|ANALYST|COORDINATOR|ENGINEER|SUPERVISOR|CONSULTANT|OFFICER|PRESIDENT)/i.test(inst)) return false;
        // Reject contact info in institution or degree fields
        if (isContactPattern(inst) || isContactPattern(deg)) return false;
        // Reject action-verb-led text (experience bullets)
        if (startsWithActionVerb(inst) || startsWithActionVerb(deg)) return false;
        return true;
      });

      const resume: CalibratedResumeData = {
        header: mergedHeader,
        summary: data.summary || "",
        core_competencies: data.core_competencies || [],
        experience: cleanExperience,
        independent_projects: data.independent_projects || [],
        skills: data.skills || [],
        certifications: data.certifications || [],
        education: cleanEducation,
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
