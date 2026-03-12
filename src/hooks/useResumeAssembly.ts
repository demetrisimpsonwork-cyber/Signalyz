import { useState, useCallback } from "react";
import type { DirectorCalibrationResult } from "@/components/DirectorCalibrationBlock";
import type { ExtractedContactInfo } from "@/lib/contactExtractor";
import { invokeResilient, FRIENDLY_FAIL_MSG } from "@/lib/resilientEdgeFn";
import { evaluateConfidence, type ConfidenceResult } from "@/lib/resumeConfidence";

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
  confidence: ConfidenceResult | null;
  /** The raw (pre-confirmation) resume when confidence is low */
  pendingResume: CalibratedResumeData | null;
  /** Accept user-corrected data and finalize assembly */
  confirmResume: (corrected: CalibratedResumeData) => void;
  /** Skip confirmation and use the raw data as-is */
  skipConfirmation: () => void;
  assemble: (directorResult: DirectorCalibrationResult | null, originalResume: string, preExtractedContact?: ExtractedContactInfo, alignmentResult?: Record<string, unknown>) => Promise<void>;
}

const STEPS = [
  "Pulling signal-optimized components…",
  "Calibrating language coherence…",
  "Assembling final document…",
];

export function useResumeAssembly(): UseResumeAssemblyReturn {
  const [assembledResume, setAssembledResume] = useState<CalibratedResumeData | null>(null);
  const [pendingResume, setPendingResume] = useState<CalibratedResumeData | null>(null);
  const [confidence, setConfidence] = useState<ConfidenceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  const finalizeResume = useCallback((resume: CalibratedResumeData) => {
    setAssembledResume(resume);
    setPendingResume(null);
    setStep(3);
    try {
      localStorage.setItem("resumix_calibrated_resume_data", JSON.stringify(resume));
    } catch {}
  }, []);

  const confirmResume = useCallback((corrected: CalibratedResumeData) => {
    // Re-evaluate confidence on corrected data (for logging), then finalize
    const newConf = evaluateConfidence(corrected);
    setConfidence(newConf);
    finalizeResume(corrected);
  }, [finalizeResume]);

  const skipConfirmation = useCallback(() => {
    if (pendingResume) {
      finalizeResume(pendingResume);
    }
  }, [pendingResume, finalizeResume]);

  const assemble = useCallback(async (directorResult: DirectorCalibrationResult | null, originalResume: string, preExtractedContact?: ExtractedContactInfo, alignmentResult?: Record<string, unknown>) => {
    setLoading(true);
    setError(null);
    setStep(0);
    setPendingResume(null);
    setConfidence(null);

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

      // ── Strict field validation helpers ──

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

      const validateLocation = (loc: string): string => {
        if (!loc) return "";
        if (startsWithActionVerb(loc)) return "";
        if (resumeKeywords.test(loc)) return "";
        if (isContactPattern(loc)) return "";
        if (isCamelCaseArtifact(loc)) return "";
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

      // ── Title / Company field sanitizers ──

      const locationRx = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,?\s+[A-Z]{2}(?:\s+\d{5})?$/;
      const educationKeywords = /\b(university|college|bachelor|master|b\.?s\.?|b\.?a\.?|m\.?s\.?|m\.?a\.?|m\.?b\.?a\.?|ph\.?d|associate|diploma|gpa|degree|school|institute|academy)\b/i;
      const sectionHeaders = /^(EXPERIENCE|EDUCATION|SKILLS|SUMMARY|PROFILE|CONTACT|CERTIFICATIONS?|CORE\s+COMPETENCIES|PROFESSIONAL\s+SUMMARY|WORK\s+HISTORY)\s*$/i;

      const isTitleContaminated = (v: string): boolean => {
        if (!v) return false;
        // Location-only strings
        if (locationRx.test(v.trim())) return true;
        // Education fragments
        if (educationKeywords.test(v)) return true;
        // Section headers
        if (sectionHeaders.test(v.trim())) return true;
        // Bullet-length text (real titles are short)
        if (v.length > 80) return true;
        // Starts with action verb (it's a bullet, not a title)
        if (startsWithActionVerb(v)) return true;
        // Contact info leaked into title
        if (isContactPattern(v)) return true;
        return false;
      };

      const isCompanyContaminated = (v: string): boolean => {
        if (!v) return false;
        if (locationRx.test(v.trim())) return true;
        if (educationKeywords.test(v)) return true;
        if (sectionHeaders.test(v.trim())) return true;
        if (v.length > 80) return true;
        if (startsWithActionVerb(v)) return true;
        if (isContactPattern(v)) return true;
        return false;
      };

      const cleanExperience = (data.experience || []).filter((exp: any) => {
        const company = (exp.company || "").trim();
        const title = (exp.title || "").trim();
        const combined = `${company} ${title}`.trim();
        if (isContactPattern(combined)) return false;
        if (/^[\d()+\-.\s]+$/.test(company)) return false;
        if (isCamelCaseArtifact(company)) return false;
        if (isCamelCaseArtifact(title)) return false;
        return true;
      });

      for (const exp of cleanExperience) {
        // Sanitize title field — blank out contaminated values
        if (isTitleContaminated(exp.title)) {
          exp.title = "";
        }
        // Sanitize company field
        if (isCompanyContaminated(exp.company)) {
          exp.company = "";
        }

        if (Array.isArray(exp.bullets)) {
          exp.bullets = exp.bullets.filter((b: string) => {
            if (!b) return false;
            if (isContactPattern(b) && b.replace(/[\w.+-]+@[\w.-]+\.\w{2,}/g, "").replace(/[\d()+\-.\s]/g, "").trim().length < 5) return false;
            return true;
          });
        }
      }

      const cleanEducation = (data.education || []).filter((edu: any) => {
        const inst = (edu.institution || "").trim();
        const deg = (edu.degree || "").trim();
        if (!inst && !deg) return false;
        if (isCamelCaseArtifact(inst) || isCamelCaseArtifact(deg)) return false;
        if (/^(DIRECTOR|MANAGER|SPECIALIST|ANALYST|COORDINATOR|ENGINEER|SUPERVISOR|CONSULTANT|OFFICER|PRESIDENT)/i.test(inst)) return false;
        if (isContactPattern(inst) || isContactPattern(deg)) return false;
        if (startsWithActionVerb(inst) || startsWithActionVerb(deg)) return false;
        return true;
      });

      // Omit sections that have no clean entries rather than inserting malformed data
      const resume: CalibratedResumeData = {
        header: mergedHeader,
        summary: data.summary || "",
        core_competencies: Array.isArray(data.core_competencies) && data.core_competencies.length > 0 ? data.core_competencies : [],
        experience: cleanExperience.length > 0 ? cleanExperience : [],
        independent_projects: Array.isArray(data.independent_projects) && data.independent_projects.length > 0 ? data.independent_projects : [],
        skills: Array.isArray(data.skills) && data.skills.length > 0 ? data.skills : [],
        certifications: Array.isArray(data.certifications) && data.certifications.length > 0 ? data.certifications : [],
        education: cleanEducation.length > 0 ? cleanEducation : [],
        signal_keywords: data.signal_keywords || [],
      };

      // ── Confidence check ──
      const conf = evaluateConfidence(resume);
      setConfidence(conf);

      if (conf.isLow) {
        // Park the resume for user confirmation instead of rendering contaminated output
        console.log("[useResumeAssembly] Low confidence (" + conf.score + "), issues:", conf.issues);
        setPendingResume(resume);
        setStep(3);
      } else {
        finalizeResume(resume);
      }
    } catch (err: any) {
      setError(err.message || "Failed to assemble resume. Please retry.");
    } finally {
      setLoading(false);
    }
  }, [finalizeResume]);

  return { assembledResume, loading, error, step, confidence, pendingResume, confirmResume, skipConfirmation, assemble };
}
