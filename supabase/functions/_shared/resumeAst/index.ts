import { parseResumeAst } from "./parser.ts";
import { validateResumeAst, mergeDiagnostics } from "./validator.ts";
import { buildResumeAstObservability } from "./observability.ts";

export { parseResumeAst, extractAstTextCorpus, extractSourceTextCorpus } from "./parser.ts";
export { normalizeResumeAst, normalizeResumeText } from "./normalizer.ts";
export { validateResumeAst, mergeDiagnostics } from "./validator.ts";
export {
  hashContent,
  fingerprintBullet,
  fingerprintSection,
  fingerprintResume,
  buildResumeFingerprintPayload,
} from "./fingerprint.ts";
export { serializeResumeAst } from "./serializer.ts";
export {
  buildResumeAstObservability,
  logResumeAstObservability,
  assertObservabilitySafe,
} from "./observability.ts";
export { applyLinkPreservationGuard, logLinkPreservationReport, assertLinkPreservationReportSafe } from "./linkPreservation.ts";
export { extractStructuredLinks, isImportantLinkType, normalizeLinkValue, classifyUrl } from "./linkExtraction.ts";
export { RESUME_AST_PARSE_VERSION } from "./types.ts";
export type {
  ResumeAst,
  AstBullet,
  AstLinkType,
  ResumeHeader,
  ProfessionalSummary,
  ExperienceEntry,
  ProjectEntry,
  EducationEntry,
  SkillEntry,
  CertificationEntry,
  LinkEntry,
  AwardEntry,
  CustomSection,
  ValidationDiagnostic,
  ValidationResult,
  ParseResumeAstResult,
  ResumeAstObservabilitySummary,
  ResumeLinkPreservationReport,
  AstConfidence,
  BulletSource,
} from "./types.ts";

/** Feature flag — default false. Not wired to production pipeline. */
export function isResumeAstEnabled(flagValue?: string | boolean | null): boolean {
  if (flagValue === true) return true;
  if (flagValue === false || flagValue == null) return false;
  const normalized = String(flagValue).trim().toLowerCase();
  return normalized === "true" || normalized === "1";
}

/** High-level parse pipeline: normalize → parse → validate → fingerprint. */
export function buildResumeAstFromText(rawText: string) {
  const parsed = parseResumeAst(rawText);
  const validation = validateResumeAst(parsed.ast);
  const observability = buildResumeAstObservability({
    ast: parsed.ast,
    parseTimeMs: parsed.parseTimeMs,
    diagnostics: mergeDiagnostics(parsed.diagnostics, validation.diagnostics),
  });
  return {
    ...parsed,
    validation,
    observability,
  };
}
