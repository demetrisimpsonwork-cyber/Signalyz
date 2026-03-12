/**
 * Confidence scoring for PDF-extracted resume data.
 * Determines whether the Calibrated Resume can be safely assembled
 * or needs user confirmation first.
 */

import type { CalibratedResumeData } from "@/hooks/useResumeAssembly";

export interface ConfidenceResult {
  score: number; // 0-100
  isLow: boolean;
  issues: string[];
}

const CONTACT_RX = /[\w.+-]+@[\w.-]+\.\w{2,}|(?:\(\d{3}\)[\s.-]?\d{3}[\s.-]?\d{4}|\d{3}[-.\s]\d{3}[-.\s]\d{4}|\b\d{10}\b)/;
const CAMELCASE_ARTIFACT_RX = /^[A-Z]{10,}$/;
const ACTION_VERBS = new Set([
  "communicate","communicated","managed","led","developed","created","built",
  "improved","directed","established","implemented","executed","organized",
  "analyzed","designed","maintained","delivered","coordinated","supported",
  "reduced","increased","streamlined","automated","facilitated","negotiated",
  "spearheaded","launched","oversaw","supervised","trained","partnered",
]);

/**
 * Evaluate confidence in the assembled resume structure.
 * Returns a score (0-100) and a list of detected issues.
 */
export function evaluateConfidence(resume: CalibratedResumeData): ConfidenceResult {
  const issues: string[] = [];
  let deductions = 0;

  const h = resume.header;

  // 1. Name missing or placeholder
  if (!h.name || h.name.length < 2) {
    issues.push("name_missing");
    deductions += 30;
  } else if (/^(full\s+name|name|your\s+name)$/i.test(h.name.trim())) {
    issues.push("name_placeholder");
    deductions += 30;
  }

  // 2. Contact info in experience fields
  for (const exp of resume.experience) {
    const combined = `${exp.company} ${exp.title}`;
    if (CONTACT_RX.test(combined)) {
      issues.push("contact_in_experience");
      deductions += 20;
      break;
    }
    if ((!/\s/.test(exp.company.trim()) && CAMELCASE_ARTIFACT_RX.test(exp.company.trim())) ||
        (!/\s/.test(exp.title.trim()) && CAMELCASE_ARTIFACT_RX.test(exp.title.trim()))) {
      issues.push("artifact_in_experience");
      deductions += 15;
      break;
    }
  }

  // 3. Education contamination
  for (const edu of resume.education) {
    const inst = edu.institution || "";
    const deg = edu.degree || "";
    const firstWord = inst.split(/[\s,]/)[0]?.toLowerCase() || "";
    if (ACTION_VERBS.has(firstWord)) {
      issues.push("education_has_bullets");
      deductions += 15;
      break;
    }
    if (!/\s/.test(inst.trim()) && CAMELCASE_ARTIFACT_RX.test(inst.trim())) {
      issues.push("education_has_artifact");
      deductions += 15;
      break;
    }
    if (CONTACT_RX.test(inst) || CONTACT_RX.test(deg)) {
      issues.push("education_has_contact");
      deductions += 15;
      break;
    }
  }

  // 4. Location looks like a bullet fragment
  if (h.location) {
    const firstWord = h.location.split(/[\s,]/)[0]?.toLowerCase() || "";
    if (ACTION_VERBS.has(firstWord)) {
      issues.push("location_contaminated");
      deductions += 10;
    }
  }

  // 5. Very few experience entries (possible mis-parse)
  if (resume.experience.length === 0) {
    issues.push("no_experience");
    deductions += 15;
  }

  // 6. Title looks contaminated
  if (h.title && CONTACT_RX.test(h.title)) {
    issues.push("title_contaminated");
    deductions += 10;
  }

  const score = Math.max(0, 100 - deductions);
  // Always require confirmation if the name couldn't be extracted
  const hasNameIssue = issues.includes("name_missing") || issues.includes("name_placeholder");

  return {
    score,
    isLow: score < 70 || hasNameIssue,
    issues,
  };
}
