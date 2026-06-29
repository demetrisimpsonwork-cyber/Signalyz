// Evidence-based Core Competencies curation.
//
// Replaces the previous "reorder the parsed skills" behavior with curation that
// reads like a senior resume writer assembled it:
//   • atomize compound skill lines
//   • de-duplicate and merge synonyms to canonical labels
//   • Title Case consistently (preserving acronyms)
//   • prioritize JD relevance and demonstrated capability
//   • cap to ~8–10 entries
//   • for thin resumes, surface capabilities that are literally evidenced in the
//     resume text (never invented)
//
// Evidence-only philosophy: nothing is added unless it is supported by the
// candidate's own resume/JD text.

const ACRONYMS = new Set([
  "SLA", "KPI", "KPIS", "CRM", "SQL", "P&L", "B2B", "B2C", "SAAS", "QA", "HR",
  "IT", "ERP", "POS", "API", "AWS", "SEO", "SEM", "ROI", "CX", "UX", "UI", "PMP",
  "GAAP", "AP", "AR", "EHR", "HRIS", "ATS", "SOP", "SOPS", "PHI", "PII", "EDI",
]);

const SMALL_WORDS = new Set(["of", "and", "the", "for", "to", "in", "with", "a", "an", "&"]);

// Canonical synonym map (lowercased variant -> canonical label).
const CANON: Record<string, string> = {
  "cs": "Customer Service",
  "customer support": "Customer Service",
  "client support": "Customer Service",
  "client service": "Customer Service",
  "customer care": "Customer Service",
  "guest services": "Customer Service",
  "comms": "Communication",
  "communications": "Communication",
  "verbal communication": "Communication",
  "written communication": "Communication",
  "interpersonal skills": "Communication",
  "leadership": "Team Leadership",
  "team lead": "Team Leadership",
  "team management": "Team Leadership",
  "people management": "Team Leadership",
  "staff management": "Team Leadership",
  "people leadership": "Team Leadership",
  "team building": "Team Leadership",
  "process improvement": "Process Improvement",
  "continuous improvement": "Process Improvement",
  "process optimization": "Process Improvement",
  "operational efficiency": "Process Improvement",
  "problem solving": "Problem Solving",
  "problem-solving": "Problem Solving",
  "critical thinking": "Problem Solving",
  "troubleshooting": "Problem Solving",
  "time management": "Time Management",
  "ms office": "Microsoft Office",
  "microsoft office suite": "Microsoft Office",
  "ms excel": "Microsoft Excel",
  "excel": "Microsoft Excel",
  "data analysis": "Data Analysis",
  "data analytics": "Data Analysis",
  "analytics": "Data Analysis",
  "reporting and analytics": "Data Analysis",
  "project management": "Project Management",
  "project coordination": "Project Management",
  "conflict resolution": "Conflict Resolution",
  "de-escalation": "De-escalation",
  "deescalation": "De-escalation",
  "scheduling": "Scheduling",
  "staff scheduling": "Scheduling",
  "shift scheduling": "Scheduling",
  "workforce scheduling": "Scheduling",
  "training": "Training & Development",
  "training and development": "Training & Development",
  "onboarding": "Training & Development",
  "coaching": "Training & Development",
  "mentoring": "Training & Development",
  "staff development": "Training & Development",
  "inventory": "Inventory Management",
  "inventory management": "Inventory Management",
  "stock management": "Inventory Management",
  "vendor management": "Vendor Management",
  "supplier management": "Vendor Management",
  "quality assurance": "Quality Assurance",
  "qa": "Quality Assurance",
  "quality control": "Quality Assurance",
  "compliance": "Compliance",
  "regulatory compliance": "Compliance",
  "account management": "Account Management",
  "relationship management": "Relationship Management",
  "stakeholder management": "Stakeholder Management",
  "customer success": "Customer Success",
  "customer retention": "Customer Retention",
  "sla management": "SLA Management",
  "case management": "Case Management",
  "ticketing": "Case Management",
  "documentation": "Documentation",
  "record keeping": "Documentation",
  "recordkeeping": "Documentation",
};

// Capabilities that may be surfaced for thin resumes — but ONLY when the trigger
// phrase literally appears in the candidate's evidence text. Never invented.
const CAPABILITY_EVIDENCE: { label: string; any: string[] }[] = [
  { label: "Customer Service", any: ["customer", "client service", "guest", "patron"] },
  { label: "Team Leadership", any: ["led ", "managed ", "supervised", "oversaw", "team of", "direct reports", "trained staff", "shift lead"] },
  { label: "Process Improvement", any: ["process improvement", "streamlin", "optimiz", "efficien", "workflow", "reduced time"] },
  { label: "Communication", any: ["communicat", "correspond", "liais", "presented", "drafted", "reported to"] },
  { label: "Scheduling", any: ["schedul", "shift", "staffing", "roster"] },
  { label: "Training & Development", any: ["train", "onboard", "mentor", "coach"] },
  { label: "Data Analysis", any: ["report", "dashboard", "kpi", "metric", "analy", "spreadsheet"] },
  { label: "Compliance", any: ["complian", "regulat", "policy", "audit", "sop", "safety standard"] },
  { label: "Inventory Management", any: ["inventory", "stock", "supply", "warehouse", "ordering"] },
  { label: "Conflict Resolution", any: ["de-escal", "deescal", "complaint", "dispute", "resolved issue", "grievance"] },
  { label: "Cash Handling", any: ["cash", "register", "point of sale", "pos ", "transactions"] },
  { label: "Vendor Management", any: ["vendor", "supplier", "third-party", "contractor"] },
];

export interface CurateOptions {
  min?: number;
  max?: number;
}

/**
 * Curate core competencies from parsed skills, prioritized by JD relevance and
 * demonstrated evidence, with synonym merging, Title Case, and a thoughtful
 * fallback for thin resumes.
 */
export function curateCompetencies(
  rawSkills: string[],
  jdSignals: string[],
  evidenceText: string,
  options: CurateOptions = {},
): string[] {
  const min = options.min ?? 6;
  const max = options.max ?? 10;

  const evidenceLower = (evidenceText || "").toLowerCase();
  const jdLower = (jdSignals || []).map((s) => (s || "").toLowerCase()).filter(Boolean);

  // 1. Atomize + normalize + canonicalize.
  const seen = new Set<string>();
  const candidates: { label: string; jd: number; demonstrated: boolean; multiword: boolean }[] = [];

  for (const raw of atomize(rawSkills)) {
    const normalized = canonicalize(raw);
    if (!normalized) continue;
    const dedupeKey = normalized.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    candidates.push({
      label: normalized,
      jd: jdRelevance(normalized, jdLower),
      demonstrated: isDemonstrated(normalized, evidenceLower),
      multiword: /\s/.test(normalized),
    });
  }

  // 2. Score: JD relevance dominates, then demonstrated capability, then richness.
  const scored = candidates
    .map((c, i) => {
      let score = c.jd * 3;
      if (c.demonstrated) score += 2;
      if (c.multiword) score += 0.5; // capabilities over isolated keywords
      return { ...c, score, i };
    })
    .sort((a, b) => (b.score - a.score) || (a.i - b.i));

  const result: string[] = [];
  const used = new Set<string>();
  for (const c of scored) {
    if (result.length >= max) break;
    const key = c.label.toLowerCase();
    if (used.has(key)) continue;
    used.add(key);
    result.push(c.label);
  }

  // 3. Thin-resume fallback: surface capabilities literally evidenced in the text.
  if (result.length < min) {
    for (const cap of CAPABILITY_EVIDENCE) {
      if (result.length >= min) break;
      const key = cap.label.toLowerCase();
      if (used.has(key)) continue;
      if (cap.any.some((trigger) => evidenceLower.includes(trigger))) {
        used.add(key);
        result.push(cap.label);
      }
    }
  }

  return result.slice(0, max);
}

/** Split compound skill entries into atomic skills. */
function atomize(rawSkills: string[]): string[] {
  if (!Array.isArray(rawSkills)) return [];
  const out: string[] = [];
  for (const entry of rawSkills) {
    if (typeof entry !== "string") continue;
    const parts = entry.split(/[;,|•·\u2022\u00b7\/]| {2,}/g);
    for (const part of parts) {
      const cleaned = part.replace(/^[\s\-–—•·]+/, "").replace(/[\s\-–—•·]+$/, "").trim();
      if (cleaned) out.push(cleaned);
    }
  }
  return out;
}

/** Normalize a skill to its canonical, Title-Cased label, or "" if unusable. */
function canonicalize(skill: string): string {
  let s = skill.replace(/\s{2,}/g, " ").trim();
  if (!s) return "";
  // Drop sentence-like fragments and noise.
  const wordCount = s.split(/\s+/).length;
  if (s.length > 40 || wordCount > 5) return "";
  if (!/[a-zA-Z]/.test(s)) return "";
  if (/^(skills?|competenc(?:y|ies)|proficienc(?:y|ies)|expertise|technologies|tools)$/i.test(s)) return "";

  const lower = s.toLowerCase();
  if (CANON[lower]) return CANON[lower];
  return titleCaseCompetency(s);
}

/** Title Case a competency, preserving acronyms and lowercasing small words. */
export function titleCaseCompetency(input: string): string {
  const cleaned = input.replace(/\s{2,}/g, " ").trim();
  if (!cleaned) return "";
  const words = cleaned.split(/(\s+|\/|&)/); // keep delimiters
  return words
    .map((word, idx) => {
      if (/^\s+$/.test(word) || word === "/" || word === "&") return word;
      const upper = word.toUpperCase().replace(/[^A-Z&]/g, "");
      if (ACRONYMS.has(upper)) {
        // Preserve known acronym casing (e.g. P&L, SaaS handled below).
        if (upper === "SAAS") return "SaaS";
        if (upper === "PL") return "P&L";
        return word.toUpperCase();
      }
      const lower = word.toLowerCase();
      if (idx !== 0 && SMALL_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

function jdRelevance(label: string, jdLower: string[]): number {
  if (!jdLower.length) return 0;
  const labelLower = label.toLowerCase();
  const labelWords = labelLower.split(/\s+/).filter((w) => w.length > 3);
  let score = 0;
  for (const sig of jdLower) {
    if (sig.includes(labelLower) || labelLower.includes(sig)) {
      score += 2;
      continue;
    }
    if (labelWords.some((w) => sig.includes(w))) score += 1;
  }
  return score;
}

function isDemonstrated(label: string, evidenceLower: string): boolean {
  if (!evidenceLower) return false;
  const labelLower = label.toLowerCase();
  if (evidenceLower.includes(labelLower)) return true;
  // Fall back to the most distinctive word in the label.
  const words = labelLower.split(/\s+/).filter((w) => w.length > 4 && !SMALL_WORDS.has(w));
  return words.some((w) => evidenceLower.includes(w));
}
