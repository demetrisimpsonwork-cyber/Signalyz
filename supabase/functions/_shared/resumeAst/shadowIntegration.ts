import { buildResumeAstFromText } from "./index.ts";
import { compareResumeAsts, type AstComparisonSummary } from "./shadowCompare.ts";
import { RESUME_AST_PARSE_VERSION } from "./types.ts";
import type { ParseResumeAstResult } from "./types.ts";

/** Parse VITE_ENABLE_RESUME_AST_SHADOW — default false. */
export function isResumeAstShadowEnabled(flagValue?: string | boolean | null): boolean {
  if (flagValue === true) return true;
  if (flagValue === false || flagValue == null) return false;
  const normalized = String(flagValue).trim().toLowerCase();
  return normalized === "true" || normalized === "1";
}

export interface ResumeAstShadowLog {
  event: "resume_ast_shadow_report";
  request_id?: string;
  run_id?: string;
  ast_version: string;
  source_parse_ok: boolean;
  generated_parse_ok: boolean;
  source_sections: number;
  generated_sections: number;
  source_bullets: number;
  generated_bullets: number;
  source_skills: number;
  generated_skills: number;
  validation_error_count: number;
  warning_count: number;
  round_trip_fidelity: number;
  bullet_preservation_score: number;
  keyword_preservation_score: number;
  missing_section_count: number;
  added_section_count: number;
  parse_time_ms: number;
  fingerprint_changed: boolean;
  error?: { name: string; message: string };
}

export interface RunResumeAstShadowInput {
  enabled: boolean;
  sourceResumeText: string;
  generatedResumeText: string;
  requestId?: string;
  runId?: string;
}

export interface RunResumeAstShadowResult {
  log: ResumeAstShadowLog | null;
  comparison: AstComparisonSummary | null;
  source?: ParseResumeAstResult | null;
  generated?: ParseResumeAstResult | null;
  error?: { name: string; message: string };
}

export interface RunSourceResumeAstShadowInput {
  enabled: boolean;
  sourceResumeText: string;
  requestId?: string;
  runId?: string;
}

export interface CachedSourceAstShadow {
  requestId?: string;
  runId?: string;
  sourceTextFingerprint: string;
  result: ParseResumeAstResult;
}

let cachedSourceShadow: CachedSourceAstShadow | null = null;

const BLOCKED_LOG_SUBSTRINGS =
  /resume_text|source_resume|generated_resume|@|\.com|github\.com|linkedin/i;

function hashSourceTextKey(text: string): string {
  let h = 0x811c9dc5;
  const normalized = text.trim().toLowerCase();
  for (let i = 0; i < normalized.length; i++) {
    h ^= normalized.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function sanitizeErrorMessage(message: string): string {
  return message.slice(0, 120).replace(/[\r\n]+/g, " ");
}

export function assertSanitizedAstShadowLog(log: ResumeAstShadowLog): void {
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      if (BLOCKED_LOG_SUBSTRINGS.test(value)) {
        throw new Error("resume_ast_shadow_report log contains blocked content");
      }
      if (value.length > 80) {
        throw new Error("resume_ast_shadow_report log contains oversized string field");
      }
      return;
    }
    if (value && typeof value === "object") {
      for (const nested of Object.values(value as Record<string, unknown>)) {
        visit(nested);
      }
    }
  };

  visit(log);
}

function logShadowError(requestId: string | undefined, error: unknown): { name: string; message: string } {
  const name = error instanceof Error ? error.name : "Error";
  const message = error instanceof Error ? error.message : "unknown";
  const sanitized = { name, message: sanitizeErrorMessage(message) };
  console.log(
    JSON.stringify({
      event: "resume_ast_shadow_report",
      request_id: requestId,
      ast_version: RESUME_AST_PARSE_VERSION,
      source_parse_ok: false,
      generated_parse_ok: false,
      error: sanitized,
    }),
  );
  return sanitized;
}

function buildShadowLog(
  input: Pick<RunResumeAstShadowInput, "requestId" | "runId">,
  comparison: AstComparisonSummary,
  source: ParseResumeAstResult,
  generated: ParseResumeAstResult,
): ResumeAstShadowLog {
  return {
    event: "resume_ast_shadow_report",
    request_id: input.requestId,
    run_id: input.runId,
    ast_version: RESUME_AST_PARSE_VERSION,
    source_parse_ok: true,
    generated_parse_ok: true,
    source_sections: comparison.source_section_count,
    generated_sections: comparison.generated_section_count,
    source_bullets: comparison.source_bullet_count,
    generated_bullets: comparison.generated_bullet_count,
    source_skills: comparison.source_skill_count,
    generated_skills: comparison.generated_skill_count,
    validation_error_count: comparison.validation_error_count,
    warning_count: comparison.warning_count,
    round_trip_fidelity: comparison.round_trip_fidelity,
    bullet_preservation_score: comparison.bullet_preservation_score,
    keyword_preservation_score: comparison.keyword_preservation_score,
    missing_section_count: comparison.missing_sections.length,
    added_section_count: comparison.added_sections.length,
    parse_time_ms: source.parseTimeMs + generated.parseTimeMs,
    fingerprint_changed: comparison.fingerprint_changed,
  };
}

/**
 * Parse source resume in shadow mode and cache for later comparison.
 * Never throws; does not mutate resume content.
 */
export function runSourceResumeAstShadow(input: RunSourceResumeAstShadowInput): CachedSourceAstShadow | null {
  if (!input.enabled) return null;
  if (!input.sourceResumeText?.trim()) return null;

  try {
    const result = buildResumeAstFromText(input.sourceResumeText);
    cachedSourceShadow = {
      requestId: input.requestId,
      runId: input.runId,
      sourceTextFingerprint: hashSourceTextKey(input.sourceResumeText),
      result,
    };
    return cachedSourceShadow;
  } catch (error) {
    logShadowError(input.requestId, error);
    return null;
  }
}

export function getCachedSourceResumeAstShadow(): CachedSourceAstShadow | null {
  return cachedSourceShadow;
}

export function clearCachedSourceResumeAstShadow(): void {
  cachedSourceShadow = null;
}

/**
 * Run Resume AST shadow comparison. Never throws; does not mutate resume output.
 */
export function runResumeAstShadow(input: RunResumeAstShadowInput): RunResumeAstShadowResult {
  if (!input.enabled) {
    return { log: null, comparison: null, source: null, generated: null };
  }

  try {
    const source =
      cachedSourceShadow?.sourceTextFingerprint === hashSourceTextKey(input.sourceResumeText)
        ? cachedSourceShadow.result
        : buildResumeAstFromText(input.sourceResumeText);
    const generated = buildResumeAstFromText(input.generatedResumeText);

    const comparison = compareResumeAsts({
      sourceAst: source.ast,
      generatedAst: generated.ast,
      sourceDiagnostics: source.validation.diagnostics,
      generatedDiagnostics: generated.validation.diagnostics,
    });

    const log = buildShadowLog(input, comparison, source, generated);
    assertSanitizedAstShadowLog(log);
    console.log(JSON.stringify(log));

    return { log, comparison, source, generated };
  } catch (error) {
    const err = logShadowError(input.requestId, error);
    return { log: null, comparison: null, source: null, generated: null, error: err };
  }
}
