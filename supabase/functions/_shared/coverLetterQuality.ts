/**
 * coverLetterQuality — deterministic quality gate for generated cover letters.
 *
 * Pure: text in → structured verdict out. No Deno/Node APIs, so it is safe to
 * import from both the edge function (to drive a single corrective rewrite) and
 * from vitest. It flags formulaic "AI draft" patterns, repeated employer-name
 * paragraph openings, and fabricated domain-experience claims. It runs on the
 * cover-letter BODY only (no salutation), so salutation logic is untouched.
 */

export interface CoverLetterQualityResult {
  ok: boolean;
  issues: string[];
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
export function analyzeCoverLetterQuality(text: string): CoverLetterQualityResult {
  if (typeof text !== "string" || !text.trim()) {
    return { ok: false, issues: ["empty letter body"] };
  }

  const issues: string[] = [];
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  for (const { label, rx } of WEAK_PHRASES) {
    if (rx.test(text)) issues.push(label);
  }

  for (const { label, rx } of FABRICATION_CLAIMS) {
    const m = rx.exec(text);
    if (m) {
      const before = text.slice(Math.max(0, m.index - 45), m.index);
      if (!NEGATION.test(before)) issues.push(label);
    }
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
