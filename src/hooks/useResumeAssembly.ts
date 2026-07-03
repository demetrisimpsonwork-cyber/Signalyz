import { useState, useCallback, useRef } from "react";
import type { DirectorCalibrationResult } from "@/components/DirectorCalibrationBlock";
import type { ExtractedContactInfo } from "@/lib/contactExtractor";
import { invokeResilient, FRIENDLY_FAIL_MSG, StructuredEdgeError, isInFlight, clearInFlight } from "@/lib/resilientEdgeFn";
import { evaluateConfidence, type ConfidenceResult } from "@/lib/resumeConfidence";
import { handleUsageLimitError } from "@/lib/usageLimitError";
import { evaluateAssemblyParseGate, PARSE_GATE_MESSAGE } from "@/lib/resumeIntake";
import { sanitizeCalibratedResume } from "@/lib/calibratedResumeSanitizer";
import { trackEvent, trackReliabilityError } from "@/lib/analytics";
import { withReportRunFields, type ReportRunInvokeFields } from "@/lib/reportRunSession";

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
  rewriteStatus: RewriteStatus | null;
  /** The raw (pre-confirmation) resume when confidence is low */
  pendingResume: CalibratedResumeData | null;
  confirmResume: (corrected: CalibratedResumeData) => void;
  skipConfirmation: () => void;
  assemble: (
    directorResult: DirectorCalibrationResult | null,
    originalResume: string,
    preExtractedContact?: ExtractedContactInfo,
    alignmentResult?: Record<string, unknown>,
    jdText?: string,
    reportRunFields?: ReportRunInvokeFields | null,
  ) => Promise<void>;
  /** Clear all assembled state — use when a new alignment run begins */
  reset: () => void;
  /** Increments on each assemble attempt — clears stale editor state */
  assemblyAttempt: number;
  /** True while assembly is loading or an edge invoke is in-flight */
  assemblyBusy: boolean;
}

export interface RewriteStatus {
  summary_ai_applied: boolean;
  experience_ai_applied: boolean;
  bullets_rewritten: number;
  bullets_total: number;
  partial: boolean;
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
  const [rewriteStatus, setRewriteStatus] = useState<RewriteStatus | null>(null);
  const [assemblyAttempt, setAssemblyAttempt] = useState(0);
  const assemblingRef = useRef(false);

  const stripEmptyParentheses = (v: string): string =>
    v.replace(/\s*\(\s*\)/g, "").replace(/\s*\(\s*[-–—]\s*\)/g, "").trim();

  const isLikelySignalGapTitle = (v: string): boolean => {
    const t = v.trim();
    if (!t) return false;
    const roleTitleRx = /\b(specialist|manager|analyst|coordinator|engineer|developer|director|lead|supervisor|associate|consultant|administrator|architect|designer|officer|president|vice\s+president|vp|intern|assistant|head\s+of|representative|technician|executive|chief|senior|junior|principal)\b/i;
    if (roleTitleRx.test(t)) return false;
    return /\b(support|accuracy|routing|eligibility|documentation|compliance|resolution)\b/i.test(t) && t.split(/\s+/).length <= 6;
  };

  const sanitizeRoleField = (v: string): string => {
    const t = stripEmptyParentheses(v || "");
    if (!t || /^[-–—.\s,]+$/.test(t)) return "";
    return t;
  };

  const finalizeResume = useCallback((resume: CalibratedResumeData) => {
    setAssembledResume(resume);
    setPendingResume(null);
    setStep(3);
    trackEvent("calibrated_resume_generated", {
      output_type: "calibrated_resume",
      success: true,
    });
    try {
      localStorage.setItem("signalyz_calibrated_resume_data", JSON.stringify(resume));
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

  const reset = useCallback(() => {
    setAssembledResume(null);
    setPendingResume(null);
    setConfidence(null);
    setError(null);
    setRewriteStatus(null);
    setStep(0);
  }, []);

  const assemble = useCallback(async (
    directorResult: DirectorCalibrationResult | null,
    originalResume: string,
    preExtractedContact?: ExtractedContactInfo,
    alignmentResult?: Record<string, unknown>,
    jdText?: string,
    reportRunFields?: ReportRunInvokeFields | null,
  ) => {
    if (assemblingRef.current || isInFlight("assembly")) return;

    // ── Parser confidence gate ──
    // Block clearly unusable resumes (too short, unparseable, or no detectable
    // experience) before spending an AI call or rendering a hollow document.
    // Only enforced when we actually have resume text — alignment-only assembly
    // (no originalResume) is allowed to proceed as before.
    if (originalResume && originalResume.trim()) {
      const gate = evaluateAssemblyParseGate(originalResume);
      if (gate.blocked) {
        console.warn("[useResumeAssembly] Parse gate blocked assembly:", gate.reason);
        trackReliabilityError("parser_failed", gate.reason || "PARSE_GATE", {
          output_type: "calibrated_resume",
        });
        setError(gate.detail || PARSE_GATE_MESSAGE);
        setStep(0);
        setLoading(false);
        return;
      }
    }

    assemblingRef.current = true;
    clearInFlight("assembly");
    setAssemblyAttempt((n) => n + 1);
    setAssembledResume(null);
    setLoading(true);
    setError(null);
    setStep(0);
    setPendingResume(null);
    setConfidence(null);
    setRewriteStatus(null);

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
          withReportRunFields(
            {
              directorResult: directorResult || undefined,
              originalResume,
              alignmentResult: alignmentResult || undefined,
              jd: jdText || undefined,
            },
            reportRunFields,
          ),
          120_000,
        );
        break;
      } catch (err: any) {
        if (handleUsageLimitError(err)) {
          stepTimers.forEach(clearTimeout);
          setLoading(false);
          assemblingRef.current = false;
          return;
        }
        const isFriendly = err.message === FRIENDLY_FAIL_MSG;
        if (isFriendly && attempts < maxAttempts) {
          console.log("[useResumeAssembly] Attempt", attempts, "failed, retrying...");
          setStep(0);
          continue;
        }
        stepTimers.forEach(clearTimeout);
        const errMsg = err instanceof StructuredEdgeError
          ? err.formatAssemblyMessage()
          : (isFriendly ? FRIENDLY_FAIL_MSG : (err.message || FRIENDLY_FAIL_MSG));
        setError(errMsg);
        trackReliabilityError("edge_function_failed", err instanceof StructuredEdgeError ? err.error_code : errMsg, {
          output_type: "calibrated_resume",
          feature_name: "calibrated_resume",
        });
        setLoading(false);
        assemblingRef.current = false;
        return;
      }
    }

    stepTimers.forEach(clearTimeout);

    if (!data) {
      setError("Resume generation is taking longer than expected. Try again — your alignment data is saved.");
      setLoading(false);
      assemblingRef.current = false;
      return;
    }

    try {
      if (data?.status === "partial" && data?.retry) {
        console.warn("[useResumeAssembly] Received partial result, using Phase 1 structure");
      }

      if (data?.rewrite_status && typeof data.rewrite_status === "object") {
        setRewriteStatus(data.rewrite_status as RewriteStatus);
      } else {
        setRewriteStatus(null);
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

      // Only flag single-word all-caps strings as artifacts — multi-word ALL CAPS names are valid
      const isCamelCaseArtifact = (v: string): boolean => {
        const trimmed = v.trim();
        // If it contains spaces, it's multi-word (like "DEMETRI SIMPSON") — not an artifact
        if (/\s/.test(trimmed)) return false;
        return /^[A-Z]{10,}$/.test(trimmed);
      };

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

      /** Convert ALL-CAPS name to Title Case */
      const toTitleCase = (s: string): string =>
        s.replace(/\b([A-Z]{2,})\b/g, (w) => w.charAt(0) + w.slice(1).toLowerCase());

      const validateName = (name: string): string => {
        if (!name) return "";
        const t = name.trim();
        // Reject common placeholders
        if (/^(full\s+name|name|your\s+name|first\s+(and\s+)?last\s+name)$/i.test(t)) return "";
        if (/^(EXPERIENCE|EDUCATION|SKILLS|SUMMARY|PROFILE|CONTACT|CERTIFICATIONS?)/i.test(t)) return "";
        if (t.length > 60) return "";
        if (isCamelCaseArtifact(t)) return "";
        if (isContactPattern(t)) return "";
        if (startsWithActionVerb(t)) return "";
        // Convert ALL-CAPS to Title Case for display
        const isAllCaps = t === t.toUpperCase() && /[A-Z]/.test(t);
        return isAllCaps ? toTitleCase(t) : t;
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
        if (locationRx.test(v.trim())) return true;
        if (educationKeywords.test(v)) return true;
        if (sectionHeaders.test(v.trim())) return true;
        if (v.length > 80) return true;
        if (startsWithActionVerb(v)) return true;
        if (isContactPattern(v)) return true;
        if (/^o\s+[A-Z]/.test(v.trim())) return true;
        if (v.trim().split(/\s+/).length > 10) return true;
        if (/\$[\d,.]+/.test(v)) return true;
        // Lowercase-starting fragments (e.g., "beverage from")
        if (/^[a-z]/.test(v.trim())) return true;
        // Ends with preposition — sentence fragment
        if (/\b(from|for|and|with|the|of|to|in|on|at|by)\s*$/i.test(v.trim()) && v.trim().split(/\s+/).length <= 4) return true;
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
        if (/^o\s+[A-Z]/.test(v.trim())) return true;
        if (v.trim().split(/\s+/).length > 10) return true;
        if (/\$[\d,.]+/.test(v)) return true;
        return false;
      };

      /** Validate institution field — reject financial figures, sentence fragments, date-only strings, location-only */
      const isInstitutionContaminated = (v: string): boolean => {
        if (!v) return false;
        const t = v.trim();
        if (/\$[\d,.]+/.test(t)) return true;
        if (t.split(/\s+/).length > 8) return true;
        if (startsWithActionVerb(t)) return true;
        if (isContactPattern(t)) return true;
        if (/^\d{4}\s*[-–—to]+\s*\d{4}$/.test(t)) return true;
        if (/^\d{4}$/.test(t)) return true;
        if (/^(DIRECTOR|MANAGER|SPECIALIST|ANALYST|COORDINATOR|ENGINEER|SUPERVISOR|CONSULTANT|OFFICER|PRESIDENT)/i.test(t)) return true;
        if (isCamelCaseArtifact(t)) return true;
        if (/^o\s+[A-Z]/.test(t)) return true;
        // Location-only: "City, ST" or "City, State" with no school name
        if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,?\s+[A-Z]{2}(?:\s+\d{5})?$/.test(t)) return true;
        // Must contain an education keyword OR be clearly a proper noun institution name
        const eduKw = /\b(university|college|institute|school|academy|seminary|polytechnic|conservatory)\b/i;
        if (!eduKw.test(t) && t.length < 5) return true;
        return false;
      };

      /** Validate degree field — must look like an actual academic degree */
      const DEGREE_KEYWORDS = /\b(bachelor|master|associate|doctor|ph\.?d|m\.?b\.?a|b\.?s\.?|b\.?a\.?|m\.?s\.?|m\.?a\.?|b\.?b\.?a|b\.?sc|m\.?sc|diploma|certificate|ged|high\s+school|juris\s+doctor|j\.?d\.?|ll\.?m|ll\.?b|d\.?min|ed\.?d|a\.?a\.?s?|a\.?s\.?)\b/i;
      const isDegreeContaminated = (v: string): boolean => {
        if (!v) return false;
        const t = v.trim();
        // Must contain a degree keyword — if not, it's likely a misclassified fragment
        if (!DEGREE_KEYWORDS.test(t)) return true;
        if (/\$[\d,.]+/.test(t)) return true;
        if (startsWithActionVerb(t)) return true;
        if (t.split(/\s+/).length > 12) return true;
        if (/^o\s+[A-Z]/.test(t)) return true;
        if (isContactPattern(t)) return true;
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
        exp.title = sanitizeRoleField(exp.title);
        exp.company = sanitizeRoleField(exp.company);
        exp.dates = sanitizeRoleField(exp.dates);
        if (isTitleContaminated(exp.title) || isLikelySignalGapTitle(exp.title)) {
          exp.title = "";
        }
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
        if (isContactPattern(inst) || isContactPattern(deg)) return false;
        if (startsWithActionVerb(inst) || startsWithActionVerb(deg)) return false;
        return true;
      });

      // Sanitize institution and degree fields in surviving education entries
      for (const edu of cleanEducation) {
        if (isInstitutionContaminated(edu.institution)) {
          edu.institution = "";
        }
        if (isDegreeContaminated(edu.degree)) {
          edu.degree = "";
        }
      }

      // Omit sections that have no clean entries rather than inserting malformed data
      let resume: CalibratedResumeData = {
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

      // Phase 10.0: scrub stale target-company artifacts and repair parse corruption
      // before confidence scoring, preview, or export.
      resume = sanitizeCalibratedResume(resume, {
        jdText: jdText || "",
        originalResumeText: originalResume,
      }).resume;

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
      assemblingRef.current = false;
    }
  }, [finalizeResume]);

  const assemblyBusy = loading || isInFlight("assembly");

  return { assembledResume, loading, error, step, confidence, rewriteStatus, pendingResume, confirmResume, skipConfirmation, assemble, reset, assemblyAttempt, assemblyBusy };
}
