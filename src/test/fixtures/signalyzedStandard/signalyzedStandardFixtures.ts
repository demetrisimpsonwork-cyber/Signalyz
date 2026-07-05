/** Signalyzed Standard v0 evaluation fixtures — Phase 3C. */
import type { SignalyzedStandardInput } from "@/lib/signalyzedStandard/types";
import { STANDARD_CODES } from "@/lib/signalyzedStandard/diagnosticCodes";

const cleanAst = {
  event: "resume_ast_shadow_report" as const,
  source_parse_ok: true,
  generated_parse_ok: true,
  validation_error_count: 0,
  warning_count: 0,
  round_trip_fidelity: 1,
  bullet_preservation_score: 0.92,
  keyword_preservation_score: 0.88,
  missing_section_count: 0,
  added_section_count: 0,
  source_sections: 5,
  generated_sections: 5,
  source_bullets: 8,
  generated_bullets: 8,
};

const cleanQa = {
  event: "resume_qa_shadow_report" as const,
  qa_score: 88,
  verdict: "pass",
  critical_issue_count: 0,
  warning_count: 0,
  issue_categories: {},
};

const cleanLink = {
  event: "resume_link_preservation_report" as const,
  source_link_count: 2,
  generated_link_count_before: 1,
  generated_link_count_after: 2,
  restored_link_count: 1,
  link_types_restored: ["github"],
  duplicate_link_count: 0,
  broken_link_count: 0,
  preservation_ok: true,
};

const cleanDocxExport = {
  event: "resume_export_validation_report" as const,
  export_id: "fixture-docx-clean",
  export_type: "docx" as const,
  template_version: "1.0.0",
  validation_passed: true,
  validation_warning_count: 0,
  validation_error_count: 0,
  link_count: 2,
  broken_link_count: 0,
  missing_expected_link_count: 0,
  duplicate_link_count: 0,
  section_count: 4,
  bullet_count: 8,
  page_count: null,
  diagnostic_codes: [],
};

export const FIXTURE_CLEAN_DEMETRI: SignalyzedStandardInput = {
  requestId: "req-clean-demetri",
  exportId: "exp-clean-demetri",
  exportType: "docx",
  ast: cleanAst,
  qa: cleanQa,
  link: cleanLink,
  export: cleanDocxExport,
};

export const FIXTURE_CLEAN_CUSTOMER_SUCCESS: SignalyzedStandardInput = {
  requestId: "req-clean-csm",
  exportId: "exp-clean-csm",
  exportType: "docx",
  ast: { ...cleanAst, source_bullets: 4, generated_bullets: 4 },
  qa: { ...cleanQa, qa_score: 90 },
  link: { ...cleanLink, source_link_count: 1, link_types_restored: [], restored_link_count: 0 },
  export: {
    ...cleanDocxExport,
    export_id: "exp-clean-csm",
    link_count: 1,
    bullet_count: 4,
  },
};

export const FIXTURE_TECHNICAL_LINKS: SignalyzedStandardInput = {
  requestId: "req-tech-links",
  exportId: "exp-tech-links",
  exportType: "docx",
  ast: cleanAst,
  qa: cleanQa,
  link: {
    ...cleanLink,
    source_link_count: 4,
    generated_link_count_after: 4,
    link_types_restored: ["github", "portfolio"],
  },
  export: {
    ...cleanDocxExport,
    export_id: "exp-tech-links",
    link_count: 4,
  },
};

export const FIXTURE_NON_TECHNICAL: SignalyzedStandardInput = {
  requestId: "req-non-tech",
  exportId: "exp-non-tech",
  exportType: "docx",
  ast: cleanAst,
  qa: cleanQa,
  link: { ...cleanLink, source_link_count: 1, generated_link_count_after: 1, preservation_ok: true },
  export: { ...cleanDocxExport, export_id: "exp-non-tech", link_count: 1 },
};

export const FIXTURE_MISSING_GITHUB: SignalyzedStandardInput = {
  requestId: "req-missing-github",
  exportId: "exp-missing-github",
  exportType: "docx",
  ast: cleanAst,
  qa: cleanQa,
  link: {
    ...cleanLink,
    preservation_ok: false,
    generated_link_count_after: 0,
    restored_link_count: 0,
    link_types_restored: [],
  },
  export: {
    ...cleanDocxExport,
    export_id: "exp-missing-github",
    link_count: 0,
    missing_expected_link_count: 2,
    diagnostic_codes: ["missing_expected_link"],
  },
};

export const FIXTURE_AI_SANDBOX_CONTAMINATION: SignalyzedStandardInput = {
  requestId: "req-ai-sandbox",
  exportId: "exp-ai-sandbox",
  exportType: "docx",
  ast: cleanAst,
  qa: {
    event: "resume_qa_shadow_report",
    qa_score: 25,
    verdict: "block_regeneration",
    critical_issue_count: 1,
    warning_count: 0,
    issue_categories: { contamination: 1 },
    issue_logs: [
      {
        rule_id: "contamination.known_signature",
        code: "cross_jd_contamination",
        confidence: "very_high",
        severity: "critical",
        matched_terms: ["ai sandbox"],
      },
    ],
  },
  link: cleanLink,
  export: cleanDocxExport,
};

export const FIXTURE_BROKEN_PLACEHOLDER: SignalyzedStandardInput = {
  requestId: "req-broken-ph",
  exportId: "exp-broken-ph",
  exportType: "docx",
  ast: cleanAst,
  qa: cleanQa,
  link: cleanLink,
  export: {
    ...cleanDocxExport,
    export_id: "exp-broken-ph",
    validation_passed: false,
    validation_error_count: 1,
    diagnostic_codes: ["broken_placeholder"],
  },
};

export const FIXTURE_SPACED_HEADINGS: SignalyzedStandardInput = {
  requestId: "req-spaced",
  exportId: "exp-spaced",
  exportType: "docx",
  ast: cleanAst,
  qa: cleanQa,
  link: cleanLink,
  export: {
    ...cleanDocxExport,
    export_id: "exp-spaced",
    validation_passed: false,
    validation_error_count: 1,
    diagnostic_codes: ["spaced_heading"],
  },
};

export const FIXTURE_JSON_ARTIFACT: SignalyzedStandardInput = {
  requestId: "req-json",
  exportId: "exp-json",
  exportType: "docx",
  ast: cleanAst,
  qa: cleanQa,
  link: cleanLink,
  export: {
    ...cleanDocxExport,
    export_id: "exp-json",
    validation_passed: false,
    validation_error_count: 1,
    diagnostic_codes: ["json_artifact"],
  },
};

export const FIXTURE_PDF_WEAK_LINKS: SignalyzedStandardInput = {
  requestId: "req-pdf-weak",
  exportId: "exp-pdf-weak",
  exportType: "pdf",
  ast: cleanAst,
  qa: cleanQa,
  link: cleanLink,
  docxExport: { ...cleanDocxExport, link_count: 2 },
  export: {
    ...cleanDocxExport,
    export_id: "exp-pdf-weak",
    export_type: "pdf",
    link_count: 0,
    page_count: 1,
    validation_passed: true,
    diagnostic_codes: [],
  },
};

export const FIXTURE_SEVERE_BULLET_REGRESSION: SignalyzedStandardInput = {
  requestId: "req-bullet-reg",
  exportId: "exp-bullet-reg",
  exportType: "docx",
  ast: cleanAst,
  qa: {
    event: "resume_qa_shadow_report",
    qa_score: 22,
    verdict: "block_regeneration",
    critical_issue_count: 1,
    warning_count: 0,
    issue_categories: { bullet_regression: 1 },
    issue_logs: [
      {
        rule_id: "bullet_regression.structured_to_parse",
        code: "bullet_regression",
        confidence: "very_high",
        severity: "critical",
        matched_terms: ["parses resumes"],
      },
    ],
  },
  link: cleanLink,
  export: cleanDocxExport,
};

export const FIXTURE_ROLE_CONTAMINATION: SignalyzedStandardInput = {
  requestId: "req-role-contam",
  exportId: "exp-role-contam",
  exportType: "docx",
  ast: cleanAst,
  qa: {
    event: "resume_qa_shadow_report",
    qa_score: 30,
    verdict: "block_regeneration",
    critical_issue_count: 1,
    warning_count: 0,
    issue_categories: { role_contamination: 1 },
    issue_logs: [
      {
        rule_id: "role_boundary.ai_term_in_non_tech_role",
        code: "role_contamination",
        confidence: "very_high",
        severity: "critical",
        matched_terms: ["model outputs"],
      },
    ],
  },
  link: cleanLink,
  export: cleanDocxExport,
};

export const VALIDATION_RUN_FIXTURES = [
  { id: "clean_demetri", label: "Demetri AI Engineer clean export", input: FIXTURE_CLEAN_DEMETRI },
  { id: "clean_csm", label: "Customer Success clean export", input: FIXTURE_CLEAN_CUSTOMER_SUCCESS },
  { id: "technical_links", label: "Technical export with GitHub/portfolio", input: FIXTURE_TECHNICAL_LINKS },
  { id: "non_technical", label: "Non-technical export", input: FIXTURE_NON_TECHNICAL },
  { id: "ai_sandbox", label: "Contaminated export with AI Sandbox", input: FIXTURE_AI_SANDBOX_CONTAMINATION },
  { id: "broken_placeholder", label: "Export with broken placeholder", input: FIXTURE_BROKEN_PLACEHOLDER },
  { id: "spaced_headings", label: "Export with spaced headings", input: FIXTURE_SPACED_HEADINGS },
] as const;

export { STANDARD_CODES };
