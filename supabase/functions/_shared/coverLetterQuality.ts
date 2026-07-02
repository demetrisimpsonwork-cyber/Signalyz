/**
 * coverLetterQuality — deterministic quality gate for generated cover letters.
 *
 * Pure: text in → structured verdict out. No Deno/Node APIs, so it is safe to
 * import from both the edge function (to drive a single corrective rewrite) and
 * from vitest. It flags formulaic "AI draft" patterns, repeated employer-name
 * paragraph openings, and fabricated domain-experience claims. It runs on the
 * cover-letter BODY only (no salutation), so salutation logic is untouched.
 */

import { validateCoverLetterIntegrity } from "./coverLetterIntegrity.ts";
import {
  letterUnderusesTechnicalEvidence,
  type RoleCategory,
} from "./coverLetterRoleStyle.ts";

export interface CoverLetterQualityResult {
  ok: boolean;
  issues: string[];
}

export interface CoverLetterQualityOptions {
  /** When the role is genuinely technical, technical terms are not penalized. */
  roleCategory?: RoleCategory;
  /** Resume text — used to verify technical evidence priority for AI/product roles. */
  resumeText?: string;
  /** When true, flag fabricated senior/staff ML claims more aggressively. */
  severeTechnicalGap?: boolean;
}

// Weak / formulaic phrasing that makes a letter read like an assembled AI draft.
const WEAK_PHRASES: { label: string; rx: RegExp }[] = [
  { label: `weak opener "One example reflects"`, rx: /\bone example\b[^.]*\breflects?\b/i },
  { label: `filler "That pattern"`, rx: /\bthat pattern\b/i },
  { label: `AI tell "This demonstrates"`, rx: /\bthis demonstrates\b/i },
  { label: `cliché "The role demands"`, rx: /\bthe role demands\b/i },
  { label: `abstract "the kind of operational discipline"`, rx: /\bthe kind of operational discipline\b/i },
  { label: `cliché "environment I'm built for"`, rx: /\benvironment (?:i['’]m|i am) built for\b/i },
  { label: `cliché "model depends on"`, rx: /\bmodel depends on\b/i },
  { label: `cliché "where that approach holds up"`, rx: /\bwhere that approach holds up\b/i },
  { label: `over-stylized "low-noise diagnostic thinking"`, rx: /\blow-noise diagnostic thinking\b/i },
  { label: `generic "production systems demand"`, rx: /\bproduction systems demand\b/i },
];

// Sentence-level grammar defects — a comma or a dangling em-dash aside sitting
// directly in front of a main/linking verb. These read as comma splices and are
// the "guidance, reflects" / "requirements, reflects" / "moves fast, is" family.
const GRAMMAR_DEFECTS: { label: string; rx: RegExp }[] = [
  {
    label: "dangling em-dash aside before a main verb",
    rx: /—\s*[^—.]{2,120}?,\s*(?:reflects?|is|are|means?|requires?|applies|demonstrates?|signals?)\b/i,
  },
  {
    label: "comma splice before a main verb",
    rx: /,\s*(?:reflects?|means?|requires?|applies|demonstrates?|signals?)\b/i,
  },
  {
    label: "comma splice before a linking verb",
    rx: /,\s*(?:is|are)\s+(?:an?|the|exactly|what|specific)\b/i,
  },
];

// Over-stylized "AI marketing copy" phrasing. The GLOBAL set is always flagged.
const OVERSTYLIZED_GLOBAL: { label: string; rx: RegExp }[] = [
  { label: `over-stylized "operational layer"`, rx: /\boperational layer\b/i },
  { label: `over-stylized "mental architecture"`, rx: /\bmental architecture\b/i },
  { label: `over-stylized "specific and interesting problem"`, rx: /\bspecific and interesting problem\b/i },
  { label: `over-stylized "this role sits in"`, rx: /\bthis role sits in\b/i },
];

// Technical-sounding terms that are legitimate in a genuinely technical role but
// read as over-stylized filler elsewhere. Skipped for `technical_ai_product`.
const OVERSTYLIZED_TECH_SENSITIVE: { label: string; rx: RegExp }[] = [
  { label: `over-stylized "orchestration layer"`, rx: /\borchestration layer\b/i },
  { label: `over-stylized "frontier AI"`, rx: /\bfrontier ai\b/i },
];

// First-person / positive claims about CarMax-style domain tasks the resume
// cannot support. Negated forms (the honest gap clause) are excluded below.
const FABRICATION_CLAIMS: { label: string; rx: RegExp }[] = [
  { label: "fabricated vehicle-sales claim", rx: /\b(?:sold|selling|sales of|sell)\s+(?:used\s+)?(?:cars?|vehicles?)\b/i },
  { label: "fabricated appraisal claim", rx: /\b(?:appraised|appraising|performed|conducted|handled|did|ran)\s+(?:\w+\s+){0,3}appraisals?\b/i },
  { label: "fabricated appraisal experience", rx: /\b(?:vehicle\s+)?appraisal\s+experience\b/i },
  { label: "fabricated inspection claim", rx: /\b(?:inspected|inspecting|performed|conducted|did)\s+(?:\w+\s+){0,3}(?:vehicle\s+)?inspections?\b/i },
  { label: "fabricated inventory-reconciliation claim", rx: /\binventory\s+reconciliation\b/i },
  { label: "fabricated repair-order claim", rx: /\brepair[-\s]orders?\b/i },
  { label: "fabricated automotive-retail experience", rx: /\bautomotive[-\s]retail\s+experience\b/i },
];

// Staff / senior ML/AI claims the resume typically cannot support without explicit evidence.
const TECH_STAFF_FABRICATION: { label: string; rx: RegExp }[] = [
  { label: "fabricated production ML infrastructure claim", rx: /\b(?:built|shipped|owned|designed|led)\s+(?:\w+\s+){0,4}production ml infrastructure\b/i },
  { label: "fabricated production ML infrastructure experience", rx: /\bproduction ml infrastructure\s+experience\b/i },
  { label: "fabricated computer-vision claim", rx: /\b(?:built|shipped|owned|designed|computer[-\s]vision)\s+(?:\w+\s+){0,4}(?:computer[-\s]vision|cv)\s+(?:systems?|workflows?|pipelines?)\b/i },
  { label: "fabricated computer-vision experience", rx: /\bcomputer[-\s]vision\s+experience\b/i },
  { label: "fabricated PhD/MS credential", rx: /\b(?:my|with a|hold(?:ing)? a|earned a)\s+(?:ph\.?d\.?|doctorate|m\.?s\.?\s+in)\b/i },
  { label: "fabricated ML research claim", rx: /\b(?:formal|published|peer[-\s]reviewed)\s+ml research\b/i },
  { label: "fabricated senior engineering leadership", rx: /\b(?:senior engineering leadership|led (?:a )?team of engineers|managed engineers)\b/i },
  { label: "fabricated enterprise-scale ownership", rx: /\benterprise[-\s]scale ownership\b/i },
  { label: "fabricated shipped agentic framework claim", rx: /\b(?:shipped|built|owned)\s+(?:\w+\s+){0,4}agentic (?:ai )?(?:frameworks?|orchestration layers?)\b/i },
  { label: "fabricated shipped LLM pipeline claim", rx: /\b(?:shipped|built|owned)\s+(?:\w+\s+){0,4}llm pipelines?\b/i },
  { label: "fabricated geospatial/aerial imagery claim", rx: /\b(?:geospatial|aerial imagery|aerial image)\s+(?:experience|work|systems?)\b/i },
];

// Negation cues that turn a domain mention into an honest disclaimer, not a claim.
const NEGATION =
  /\b(?:no|not|never|without|lack(?:ing)?|haven['’]t|have not|hasn['’]t|has not|don['’]t|do not|isn['’]t|aren['’]t)\b/i;

// A paragraph that opens with an employer/prepositional "At <Name>" style lead.
// Keywords are matched in their capitalized paragraph-opening form; the name
// must be a proper noun (uppercase) so "At the start of..." is not a match.
const EMPLOYER_OPENER =
  /^(?:At|With|Back at|While at|During my (?:time|tenure) at)\s+[A-Z][A-Za-z0-9&.\-]/;

/**
 * Analyze a cover-letter body and return a verdict plus a list of human-readable
 * issues. `ok` is true only when no issues are found.
 */
export function analyzeCoverLetterQuality(
  text: string,
  options: CoverLetterQualityOptions = {},
): CoverLetterQualityResult {
  if (typeof text !== "string" || !text.trim()) {
    return { ok: false, issues: ["empty letter body"] };
  }

  const issues: string[] = [];
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  for (const { label, rx } of WEAK_PHRASES) {
    if (rx.test(text)) issues.push(label);
  }

  for (const { label, rx } of GRAMMAR_DEFECTS) {
    if (rx.test(text)) issues.push(label);
  }

  for (const { label, rx } of OVERSTYLIZED_GLOBAL) {
    if (rx.test(text)) issues.push(label);
  }

  // Technical terms are only penalized outside genuinely technical roles.
  if (options.roleCategory !== "technical_ai_product") {
    for (const { label, rx } of OVERSTYLIZED_TECH_SENSITIVE) {
      if (rx.test(text)) issues.push(label);
    }
  }

  for (const { label, rx } of FABRICATION_CLAIMS) {
    const m = rx.exec(text);
    if (m) {
      const before = text.slice(Math.max(0, m.index - 45), m.index);
      if (!NEGATION.test(before)) issues.push(label);
    }
  }

  if (options.severeTechnicalGap || options.roleCategory === "technical_ai_product") {
    for (const { label, rx } of TECH_STAFF_FABRICATION) {
      const m = rx.exec(text);
      if (m) {
        const before = text.slice(Math.max(0, m.index - 55), m.index);
        if (!NEGATION.test(before)) issues.push(label);
      }
    }
  }

  const integrity = validateCoverLetterIntegrity(text);
  if (!integrity.ok) {
    issues.push(...integrity.issues);
  }

  if (
    options.resumeText &&
    options.roleCategory &&
    letterUnderusesTechnicalEvidence(text, options.resumeText, options.roleCategory)
  ) {
    issues.push("technical role letter centers casework instead of resume technical evidence");
  }

  const employerOpeners = paragraphs.filter((p) => EMPLOYER_OPENER.test(p)).length;
  if (employerOpeners >= 2) {
    issues.push("multiple paragraphs open with an employer name");
  }

  if (paragraphs.length > 4) {
    issues.push(`too many paragraphs (${paragraphs.length}; max 4)`);
  }

  return { ok: issues.length === 0, issues };
}
