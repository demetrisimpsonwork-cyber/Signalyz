import { extractAstTextCorpus, parseResumeAst } from "./parser.ts";
import { listResumeSectionKinds } from "./observability.ts";
import { serializeResumeAst } from "./serializer.ts";
import { collapseWhitespace } from "./textUtils.ts";
import type { ResumeAst, ValidationDiagnostic } from "./types.ts";

export interface AstComparisonSummary {
  source_section_count: number;
  generated_section_count: number;
  source_bullet_count: number;
  generated_bullet_count: number;
  source_skill_count: number;
  generated_skill_count: number;
  missing_sections: string[];
  added_sections: string[];
  malformed_section_count: number;
  validation_error_count: number;
  warning_count: number;
  round_trip_fidelity: number;
  bullet_preservation_score: number;
  keyword_preservation_score: number;
  fingerprint_changed: boolean;
  top_validation_codes: string[];
}

function normalizeBulletText(text: string): string {
  return collapseWhitespace(text).toLowerCase();
}

function tokenizeKeywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[\s,;|/]+/)
      .map((t) => t.replace(/[^\w%+#.-]/g, ""))
      .filter((t) => t.length >= 2),
  );
}

/** Deterministic round-trip fidelity for generated AST (0–1). */
export function computeRoundTripFidelity(ast: ResumeAst): number {
  const serialized = serializeResumeAst(ast);
  const reparsed = parseResumeAst(serialized);
  const original = ast.bullets.map((b) => normalizeBulletText(b.text)).filter(Boolean);
  const roundtrip = reparsed.ast.bullets.map((b) => normalizeBulletText(b.text)).filter(Boolean);

  if (original.length === 0) return 1;

  let matched = 0;
  const used = new Set<number>();
  for (const text of original) {
    const idx = roundtrip.findIndex((candidate, i) => !used.has(i) && candidate === text);
    if (idx >= 0) {
      matched += 1;
      used.add(idx);
    }
  }

  return roundTo4(matched / original.length);
}

/** Fraction of source bullets preserved in generated output (0–1). */
export function computeBulletPreservationScore(sourceAst: ResumeAst, generatedAst: ResumeAst): number {
  const sourceBullets = [...new Set(sourceAst.bullets.map((b) => normalizeBulletText(b.text)).filter(Boolean))];
  const generatedBullets = generatedAst.bullets.map((b) => normalizeBulletText(b.text)).filter(Boolean);

  if (sourceBullets.length === 0) return 1;

  let preserved = 0;
  for (const source of sourceBullets) {
    const hit = generatedBullets.some(
      (generated) => generated === source || generated.includes(source) || source.includes(generated),
    );
    if (hit) preserved += 1;
  }

  return roundTo4(preserved / sourceBullets.length);
}

/** Fraction of source skill/keyword tokens present in generated corpus (0–1). */
export function computeKeywordPreservationScore(sourceAst: ResumeAst, generatedAst: ResumeAst): number {
  const sourceSkills = sourceAst.skills.map((s) => s.name.toLowerCase());
  const sourceTech = sourceAst.bullets.flatMap((b) => b.technologies.map((t) => t.toLowerCase()));
  const keywords = [...new Set([...sourceSkills, ...sourceTech, ...tokenizeKeywords(extractAstTextCorpus(sourceAst))])]
    .filter((k) => k.length >= 3)
    .slice(0, 120);

  if (keywords.length === 0) return 1;

  const generatedCorpus = extractAstTextCorpus(generatedAst);
  let kept = 0;
  for (const keyword of keywords) {
    if (generatedCorpus.includes(keyword)) kept += 1;
  }

  return roundTo4(kept / keywords.length);
}

function countMalformedSections(diagnostics: ValidationDiagnostic[]): number {
  const sections = new Set<string>();
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity === "error" || diagnostic.severity === "warning") {
      if (diagnostic.section) sections.add(diagnostic.section.toLowerCase());
    }
  }
  return sections.size;
}

function topValidationCodes(diagnostics: ValidationDiagnostic[], limit = 5): string[] {
  const counts = new Map<string, number>();
  for (const diagnostic of diagnostics) {
    counts.set(diagnostic.code, (counts.get(diagnostic.code) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([code]) => code);
}

export function compareResumeAsts(input: {
  sourceAst: ResumeAst;
  generatedAst: ResumeAst;
  sourceDiagnostics: ValidationDiagnostic[];
  generatedDiagnostics: ValidationDiagnostic[];
}): AstComparisonSummary {
  const sourceSections = listResumeSectionKinds(input.sourceAst);
  const generatedSections = listResumeSectionKinds(input.generatedAst);
  const sourceSet = new Set(sourceSections);
  const generatedSet = new Set(generatedSections);

  const allDiagnostics = [...input.sourceDiagnostics, ...input.generatedDiagnostics];
  const validationErrors = allDiagnostics.filter((d) => d.severity === "error").length;
  const warnings = allDiagnostics.filter((d) => d.severity === "warning" || d.severity === "info").length;

  return {
    source_section_count: sourceSections.length,
    generated_section_count: generatedSections.length,
    source_bullet_count: input.sourceAst.bullets.length,
    generated_bullet_count: input.generatedAst.bullets.length,
    source_skill_count: input.sourceAst.skills.length,
    generated_skill_count: input.generatedAst.skills.length,
    missing_sections: sourceSections.filter((section) => !generatedSet.has(section)),
    added_sections: generatedSections.filter((section) => !sourceSet.has(section)),
    malformed_section_count: countMalformedSections(allDiagnostics),
    validation_error_count: validationErrors,
    warning_count: warnings,
    round_trip_fidelity: computeRoundTripFidelity(input.generatedAst),
    bullet_preservation_score: computeBulletPreservationScore(input.sourceAst, input.generatedAst),
    keyword_preservation_score: computeKeywordPreservationScore(input.sourceAst, input.generatedAst),
    fingerprint_changed:
      (input.sourceAst.metadata.fingerprint ?? "") !== (input.generatedAst.metadata.fingerprint ?? ""),
    top_validation_codes: topValidationCodes(allDiagnostics),
  };
}

function roundTo4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
