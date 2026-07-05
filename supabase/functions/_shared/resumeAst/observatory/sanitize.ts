const BLOCKED_VALUE_PATTERNS =
  /resume_text|jd_text|original_resume|generated_resume|@|\.com|github\.com|linkedin\.com|phone:/i;

const PII_KEY_PATTERN = /email|phone|linkedin|resume_text|jd_text|^name$|address|bullet_text/i;

export function assertAstObservatoryRowSafe(row: Record<string, unknown>): void {
  const visit = (value: unknown, path: string): void => {
    if (typeof value === "string") {
      if (value.length > 120) {
        throw new Error(`resume_ast_observatory: oversized field at ${path}`);
      }
      if (BLOCKED_VALUE_PATTERNS.test(value)) {
        throw new Error(`resume_ast_observatory: blocked content at ${path}`);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
        if (PII_KEY_PATTERN.test(key)) {
          throw new Error(`resume_ast_observatory: blocked key ${key}`);
        }
        visit(nested, `${path}.${key}`);
      }
    }
  };

  for (const [key, value] of Object.entries(row)) {
    if (PII_KEY_PATTERN.test(key)) {
      throw new Error(`resume_ast_observatory: blocked column ${key}`);
    }
    visit(value, key);
  }
}

export function sanitizeId(value: string | undefined, max = 64): string | null {
  if (!value) return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}

export function sanitizeErrorClass(value: string | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 80).replace(/[^a-zA-Z0-9_.-]/g, "_");
}
