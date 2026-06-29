// Metric provenance guard.
//
// Removes quantitative claims (percentages, dollar values, multipliers, volumes,
// headcount) that do NOT appear in the candidate's source resume. This prevents the
// model from inventing numbers it cannot defend in an interview.
//
// Evidence-only philosophy: a number is kept only when its digit string is present
// as a standalone token in the source text. The guard is intentionally conservative
// — when a number plausibly matches the source it is preserved, so genuine metrics
// are never destroyed. Residue left by removal is cleaned up by repairStrippedGrammar.

const LEADING_CONNECTORS =
  "(?:by|to|of|up\\s+to|over|under|nearly|approximately|about|around|reaching|totaling|totalling|exceeding|generating|saving|worth|valued\\s+at)";

// Noun units that mark a countable claim (headcount / volume).
const UNIT_WORDS =
  "(?:employees|staff|associates|reports|direct\\s+reports|team\\s+members|people|customers|clients|users|accounts|members|tickets|cases|calls|orders|transactions|units|stores|locations|sites|branches|vendors|partners|projects|hours|days|weeks|months|years|countries|regions|markets)";

/**
 * Strip quantitative claims that are not supported by the source resume text.
 */
export function stripUnsupportedMetrics(text: string, sourceText: string): string {
  if (typeof text !== "string" || !text.trim()) {
    return typeof text === "string" ? text : "";
  }
  const supported = buildNumberSet(typeof sourceText === "string" ? sourceText : "");

  const patterns: RegExp[] = [
    // Currency: "$1,200", "$2M", "by $3.5 million"
    new RegExp(
      `\\s*${LEADING_CONNECTORS}?\\s*\\$\\s?\\d[\\d,]*(?:\\.\\d+)?\\s?(?:k|m|b|million|billion|thousand)?\\b`,
      "gi",
    ),
    // Percentage: "30%", "by 12.5 percent" (no \b after % — it is a non-word char)
    new RegExp(
      `\\s*${LEADING_CONNECTORS}?\\s*\\d+(?:\\.\\d+)?\\s?(?:%|percent\\b)`,
      "gi",
    ),
    // Multiplier: "3x", "10×"
    new RegExp(
      `\\s*${LEADING_CONNECTORS}?\\s*\\d+(?:\\.\\d+)?\\s?[x×](?![A-Za-z0-9])`,
      "gi",
    ),
    // Magnitude / headcount / volume: "5,000 customers", "12 employees", "3 million units"
    new RegExp(
      `\\s*${LEADING_CONNECTORS}?\\s*\\d[\\d,]*(?:\\.\\d+)?\\+?\\s?(?:million|billion|thousand|k)?\\s?${UNIT_WORDS}\\b`,
      "gi",
    ),
  ];

  let out = text;
  for (const rx of patterns) {
    out = out.replace(rx, (match) => (metricSupported(match, supported) ? match : " "));
  }
  return out;
}

/** Build a set of standalone number tokens (commas removed) present in the source. */
function buildNumberSet(source: string): Set<string> {
  const set = new Set<string>();
  const matches = source.match(/\d[\d,]*(?:\.\d+)?/g) || [];
  for (const m of matches) {
    set.add(m.replace(/,/g, ""));
  }
  return set;
}

/** A metric phrase is supported only if every number inside it is present in the source. */
function metricSupported(match: string, supported: Set<string>): boolean {
  const numbers = match.match(/\d[\d,]*(?:\.\d+)?/g) || [];
  if (numbers.length === 0) return true;
  return numbers.every((n) => supported.has(n.replace(/,/g, "")));
}
