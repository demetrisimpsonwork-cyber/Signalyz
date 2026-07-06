import { STANDARD_CODES } from "./diagnosticCodes.ts";

export type DiagnosticCategory =
  | "export_integrity"
  | "link_integrity"
  | "evidence_preservation"
  | "grounding"
  | "ast_structure"
  | "advisory"
  | "other";

const CODE_TO_CATEGORY: Record<string, DiagnosticCategory> = {
  [STANDARD_CODES.EXPORT_FAILED]: "export_integrity",
  [STANDARD_CODES.EXPORT_EMPTY_FILE]: "export_integrity",
  [STANDARD_CODES.EXPORT_BROKEN_PLACEHOLDER]: "export_integrity",
  [STANDARD_CODES.EXPORT_JSON_ARTIFACT]: "export_integrity",
  [STANDARD_CODES.EXPORT_SPACED_HEADING]: "export_integrity",
  [STANDARD_CODES.EXPORT_BLANK_PDF]: "export_integrity",
  [STANDARD_CODES.LINKS_MISSING_EXPECTED]: "link_integrity",
  [STANDARD_CODES.LINKS_DUPLICATE]: "link_integrity",
  [STANDARD_CODES.LINKS_BROKEN]: "link_integrity",
  [STANDARD_CODES.PDF_LINK_EXTRACTION_WEAK]: "link_integrity",
  [STANDARD_CODES.AST_LOW_BULLET_PRESERVATION]: "evidence_preservation",
  [STANDARD_CODES.QA_SEVERE_BULLET_REGRESSION]: "evidence_preservation",
  [STANDARD_CODES.QA_UNSUPPORTED_CLAIM]: "grounding",
  [STANDARD_CODES.QA_CROSS_JOB_CONTAMINATION]: "grounding",
  [STANDARD_CODES.QA_CONTAMINATION_ARTIFACT]: "grounding",
  [STANDARD_CODES.QA_ROLE_CONTAMINATION]: "grounding",
  [STANDARD_CODES.AST_PARSE_FAILURE]: "ast_structure",
  [STANDARD_CODES.AST_MALFORMED_SOURCE]: "ast_structure",
  [STANDARD_CODES.STRUCTURE_EMPTY_BULLETS]: "ast_structure",
  [STANDARD_CODES.STRUCTURE_MISSING_CORE_SECTION]: "ast_structure",
  [STANDARD_CODES.AST_SECTION_MISMATCH]: "ast_structure",
  [STANDARD_CODES.QA_ADVISORY_WARNING]: "advisory",
};

export function categorizeDiagnosticCode(code: string): DiagnosticCategory {
  return CODE_TO_CATEGORY[code] ?? "other";
}

export function groupDiagnosticsByCategory(
  codes: string[],
): Record<DiagnosticCategory, string[]> {
  const groups: Record<DiagnosticCategory, string[]> = {
    export_integrity: [],
    link_integrity: [],
    evidence_preservation: [],
    grounding: [],
    ast_structure: [],
    advisory: [],
    other: [],
  };
  for (const code of codes) {
    groups[categorizeDiagnosticCode(code)].push(code);
  }
  return groups;
}

export function topDiagnosticCodes(codes: string[], limit = 5): string[] {
  const counts = new Map<string, number>();
  for (const code of codes) {
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([code]) => code);
}

export function isAdvisoryDiagnosticCode(code: string): boolean {
  return categorizeDiagnosticCode(code) === "advisory";
}

export function isHardBlockerCategory(category: DiagnosticCategory): boolean {
  return category !== "advisory" && category !== "other";
}
