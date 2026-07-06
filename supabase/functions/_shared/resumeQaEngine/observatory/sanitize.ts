const BLOCKED_VALUE_PATTERNS =
  /resume_text|jd_text|original_resume|generated_resume|@|\.com|github\.com|linkedin\.com|demetri@|phone:/i;

const PII_KEY_PATTERN = /email|phone|linkedin|resume_text|jd_text|^name$|address/i;

const ALLOWED_COLUMN_KEYS = new Set([
  "bullet_regression_count",
  "target_role",
  "top_rules",
  "likely_false_positive_rules",
]);

export function assertObservatoryRowSafe(row: Record<string, unknown>): void {
  const visit = (value: unknown, path: string): void => {
    if (typeof value === "string") {
      if (value.length > 120) {
        throw new Error(`resume_qa_observatory: oversized field at ${path}`);
      }
      if (BLOCKED_VALUE_PATTERNS.test(value)) {
        throw new Error(`resume_qa_observatory: blocked content at ${path}`);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
        if (PII_KEY_PATTERN.test(key) && !ALLOWED_COLUMN_KEYS.has(key) && key !== "rule_id") {
          throw new Error(`resume_qa_observatory: blocked key ${key}`);
        }
        visit(nested, `${path}.${key}`);
      }
    }
  };

  for (const [key, value] of Object.entries(row)) {
    if (PII_KEY_PATTERN.test(key) && !ALLOWED_COLUMN_KEYS.has(key)) {
      throw new Error(`resume_qa_observatory: blocked column ${key}`);
    }
    visit(value, key);
  }
}

export function sanitizeTargetRole(targetRole: string): string {
  return (targetRole || "unknown").slice(0, 80).replace(/@|\.com/gi, "").trim() || "unknown";
}

export function sanitizeMatchedTerms(terms: string[]): string[] {
  return terms
    .map((t) => t.slice(0, 60).trim())
    .filter((t) => t.length > 0 && !BLOCKED_VALUE_PATTERNS.test(t));
}

export function sanitizeId(value: string | undefined, max = 64): string | null {
  if (!value) return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}
