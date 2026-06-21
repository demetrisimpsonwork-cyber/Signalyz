/**
 * Pre-alignment credential gate — blocks runs only when the JD appears to
 * require licensed/regulated credentials absent from the resume.
 *
 * Designed to avoid false positives from state lists, common English, and
 * post-hire onboarding requirements.
 */

export interface CredentialGateMatch {
  label: string;
  matchedText: string;
  /** Short excerpt from the JD around the match */
  jdExcerpt: string;
  inResume: boolean;
}

export interface CredentialGateResult {
  blocked: boolean;
  matches: CredentialGateMatch[];
}

const REQUIREMENT_CONTEXT =
  /\b(required|must have|must hold|must possess|active|valid|current|license[ds]?|licensure|certified|certification|credential|degree|qualification|eligible|board[- ]?certif|registered)\b/i;

const MEDICAL_CONTEXT =
  /\b(physician|medical|doctor|surgeon|hospital|clinical|patient|healthcare provider|practicing)\b/i;

/** US state eligibility footers — comma-separated two-letter codes */
const STATE_LIST_RE =
  /\b(?:following|eligible|accepting applications in(?: the following)?|available in(?: the following)?|currently accepting applications in(?: the following)?)\s+states?\s*:?\s*([A-Z]{2}(?:\s*,\s*[A-Z]{2})+)/gi;

type CredentialRule = {
  label: string;
  /** Test against sanitized JD text */
  pattern: RegExp;
  /** When true, match only if requirement or domain context appears nearby */
  requireContext?: "requirement" | "medical";
};

const CREDENTIAL_RULES: CredentialRule[] = [
  { label: "Medical degree (M.D.)", pattern: /\bM\.D\.?\b|\bDoctor of Medicine\b/i, requireContext: "medical" },
  { label: "Law degree (J.D.)", pattern: /\bJ\.D\.?\b|\bJuris Doctor\b/i, requireContext: "requirement" },
  { label: "Doctor of Osteopathic Medicine (D.O.)", pattern: /\bD\.O\.?\b|\bDoctor of Osteopathic Medicine\b/i },
  { label: "Registered Nurse (RN/BSN)", pattern: /\b(RN|BSN|registered nurse)\b/i, requireContext: "requirement" },
  { label: "CPA", pattern: /\bCPA\b|\bCertified Public Accountant\b/i, requireContext: "requirement" },
  { label: "Professional Engineer (P.E.)", pattern: /\bP\.E\.?\b|\bProfessional Engineer\b/i, requireContext: "requirement" },
  { label: "PharmD", pattern: /\bPharm\.D\.?\b|\bPharmD\b/i },
  { label: "DDS/DMD", pattern: /\bDDS\b|\bDMD\b|\bDoctor of Dental\b/i },
  { label: "Nurse Practitioner (NP)", pattern: /\bN\.P\.?\b|\bNurse Practitioner\b|\bNP license\b/i, requireContext: "requirement" },
  { label: "Physician Assistant (PA-C)", pattern: /\bPA-C\b|\bPhysician Assistant\b/i },
  { label: "LCSW", pattern: /\bLCSW\b|\bLicensed Clinical Social Worker\b/i },
  { label: "LMFT", pattern: /\bLMFT\b|\bLicensed Marriage and Family Therapist\b/i },
  { label: "PMP", pattern: /\bPMP\b|\bProject Management Professional\b/i, requireContext: "requirement" },
  { label: "CFA", pattern: /\bCFA\b|\bChartered Financial Analyst\b/i, requireContext: "requirement" },
  { label: "CISSP", pattern: /\bCISS?P\b/i, requireContext: "requirement" },
  { label: "Bar admission", pattern: /\bbar admission\b/i },
  { label: "Medical license", pattern: /\bmedical licen[sc]e\b/i },
  { label: "Nursing license", pattern: /\bnursing licen[sc]e\b/i },
  {
    label: "Licensed professional",
    pattern: /\blicensed (physician|attorney|nurse|pharmacist|engineer)\b/i,
  },
  { label: "Board certification", pattern: /\bboard[- ]?certif/i },
  { label: "Attorney at law", pattern: /\battorney at law\b/i },
];

/** Lines that describe post-hire / application steps — not resume credentials */
const ONBOARDING_LINE_RE =
  /^\s*[-•*]?\s*(complete|pass|sign|submit|pay for|set up)\b.*\b(application|background check|w-?9|direct deposit|independent contractor agreement|program-specific certification|onboarding)\b/i;

function stripStateEligibilityLists(text: string): string {
  return text.replace(STATE_LIST_RE, "[state eligibility list omitted]");
}

function stripOnboardingRequirementLines(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !ONBOARDING_LINE_RE.test(line))
    .join("\n");
}

function sanitizeJdForCredentialScan(jdText: string): string {
  let sanitized = stripStateEligibilityLists(jdText);
  sanitized = stripOnboardingRequirementLines(sanitized);
  return sanitized;
}

function excerptAround(text: string, index: number, radius = 60): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  const slice = text.slice(start, end).replace(/\s+/g, " ").trim();
  return (start > 0 ? "…" : "") + slice + (end < text.length ? "…" : "");
}

function hasNearbyContext(text: string, matchIndex: number, windowSize: number, contextRe: RegExp): boolean {
  const start = Math.max(0, matchIndex - windowSize);
  const end = Math.min(text.length, matchIndex + windowSize);
  return contextRe.test(text.slice(start, end));
}

function ruleMatchesInText(
  text: string,
  rule: CredentialRule,
): Array<{ matchedText: string; index: number }> {
  const flags = rule.pattern.flags.includes("g") ? rule.pattern.flags : rule.pattern.flags + "g";
  const re = new RegExp(rule.pattern.source, flags);
  const hits: Array<{ matchedText: string; index: number }> = [];

  for (const m of text.matchAll(re)) {
    if (m.index == null) continue;
    const matchedText = m[0];

    if (rule.requireContext === "requirement") {
      if (!hasNearbyContext(text, m.index, 120, REQUIREMENT_CONTEXT)) continue;
    } else if (rule.requireContext === "medical") {
      const hasMedical = hasNearbyContext(text, m.index, 120, MEDICAL_CONTEXT);
      const hasRequirement = hasNearbyContext(text, m.index, 120, REQUIREMENT_CONTEXT);
      const isExplicitMd = /\bM\.?\s*D\.?\b/i.test(matchedText) && matchedText.includes(".");
      if (!hasMedical && !hasRequirement && !isExplicitMd) continue;
    }

    hits.push({ matchedText, index: m.index });
  }

  return hits;
}

function credentialInResume(resumeText: string, rule: CredentialRule): boolean {
  const resumeUpper = resumeText.toUpperCase();
  // Resume matches are permissive — if they claim the credential, accept it
  const plainRules: CredentialRule[] = [{ ...rule, requireContext: undefined }];
  return ruleMatchesInText(resumeText, plainRules[0]).length > 0 ||
    ruleMatchesInText(resumeUpper, plainRules[0]).length > 0;
}

/**
 * Evaluate whether the resume lacks required credentials mentioned in the JD.
 * Returns structured matches for UI transparency.
 */
export function evaluateCredentialGate(resumeText: string, jdText: string): CredentialGateResult {
  const sanitizedJd = sanitizeJdForCredentialScan(jdText);
  const matches: CredentialGateMatch[] = [];

  for (const rule of CREDENTIAL_RULES) {
    const jdHits = ruleMatchesInText(sanitizedJd, rule);
    if (jdHits.length === 0) continue;

    const inResume = credentialInResume(resumeText, rule);
    const first = jdHits[0];
    matches.push({
      label: rule.label,
      matchedText: first.matchedText,
      jdExcerpt: excerptAround(jdText, first.index),
      inResume,
    });
  }

  const blocking = matches.filter((m) => !m.inResume);
  return {
    blocked: blocking.length > 0,
    matches: blocking.length > 0 ? blocking : matches,
  };
}

/** @deprecated Use evaluateCredentialGate — kept for simple boolean checks */
export function isCredentialMismatch(resumeText: string, jdText: string): boolean {
  return evaluateCredentialGate(resumeText, jdText).blocked;
}
