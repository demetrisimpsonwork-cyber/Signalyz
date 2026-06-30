/**
 * Defensive JSON extraction for model responses that may include markdown fences
 * or leading/trailing prose. Mirrors the pattern in optimize-bullet.
 */

export interface ExtractJsonResult {
  data: Record<string, unknown>;
  usedBraceFallback: boolean;
}

export function stripModelJsonFences(raw: string): string {
  return raw.replace(/```(?:json)?\s*/gi, "").replace(/```\s*/g, "").trim();
}

export function extractJsonFromModelResponse(raw: string): ExtractJsonResult {
  const stripped = stripModelJsonFences(raw);

  try {
    return { data: JSON.parse(stripped) as Record<string, unknown>, usedBraceFallback: false };
  } catch {
    /* fall through */
  }

  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("JSON_EXTRACT_FAIL");
  }

  try {
    return {
      data: JSON.parse(stripped.slice(start, end + 1)) as Record<string, unknown>,
      usedBraceFallback: true,
    };
  } catch {
    throw new Error("JSON_EXTRACT_FAIL");
  }
}
