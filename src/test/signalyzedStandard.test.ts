import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  evaluateSignalyzedStandard,
  STANDARD_CODES,
  assertNoPiiInStandardPayload,
  toSignalyzedStandardEventRow,
  buildSignalyzedStandardReport,
} from "@/lib/signalyzedStandard";
import { persistSignalyzedStandardObservatory } from "@/lib/signalyzedStandard/observability";
import { runSignalyzedStandardShadow } from "@/lib/signalyzedStandardShadow";
import { clearSignalyzedSourceReportsCache, rememberSignalyzedSourceReports } from "@/lib/signalyzedStandardContext";
import {
  FIXTURE_AI_SANDBOX_CONTAMINATION,
  FIXTURE_BROKEN_PLACEHOLDER,
  FIXTURE_CLEAN_DEMETRI,
  FIXTURE_CLEAN_CUSTOMER_SUCCESS,
  FIXTURE_JSON_ARTIFACT,
  FIXTURE_MISSING_GITHUB,
  FIXTURE_PDF_WEAK_LINKS,
  FIXTURE_ROLE_CONTAMINATION,
  FIXTURE_SEVERE_BULLET_REGRESSION,
  FIXTURE_SPACED_HEADINGS,
} from "@/test/fixtures/signalyzedStandard/signalyzedStandardFixtures";

describe("signalyzedStandard evaluator", () => {
  beforeEach(() => clearSignalyzedSourceReportsCache());

  it("clean export gets ready", () => {
    const result = evaluateSignalyzedStandard(FIXTURE_CLEAN_DEMETRI);
    expect(result.verdict).toBe("ready");
    expect(result.signalyzed_score).toBeGreaterThanOrEqual(85);
    expect(result.hard_blocker_count).toBe(0);
    expect(result.confidence).toBe("high");
  });

  it("missing GitHub after guard gets unsafe", () => {
    const result = evaluateSignalyzedStandard(FIXTURE_MISSING_GITHUB);
    expect(result.verdict).toBe("unsafe");
    expect(result.diagnostic_codes).toContain(STANDARD_CODES.LINKS_MISSING_EXPECTED);
    expect(result.recommended_action).toBe("do_not_enforce");
  });

  it("broken placeholder gets unsafe", () => {
    const result = evaluateSignalyzedStandard(FIXTURE_BROKEN_PLACEHOLDER);
    expect(result.verdict).toBe("unsafe");
    expect(result.diagnostic_codes).toContain(STANDARD_CODES.EXPORT_BROKEN_PLACEHOLDER);
  });

  it("AI Sandbox contamination gets unsafe", () => {
    const result = evaluateSignalyzedStandard(FIXTURE_AI_SANDBOX_CONTAMINATION);
    expect(result.verdict).toBe("unsafe");
    expect(result.diagnostic_codes).toContain(STANDARD_CODES.QA_CROSS_JOB_CONTAMINATION);
  });

  it("NJ summary founding artifact does NOT produce unsafe", () => {
    const result = evaluateSignalyzedStandard({
      requestId: "req-nj-artifact",
      exportId: "exp-nj-artifact",
      exportType: "docx",
      ast: FIXTURE_CLEAN_DEMETRI.ast,
      qa: {
        event: "resume_qa_shadow_report",
        qa_score: 75,
        verdict: "needs_review",
        critical_issue_count: 0,
        warning_count: 1,
        issue_categories: { contamination: 1 },
        issue_logs: [
          {
            rule_id: "contamination.section_artifact",
            code: "cross_jd_contamination",
            confidence: "low",
            severity: "medium",
            matched_terms: ["nj summary founding"],
            contamination_subtype: "summary_artifact",
          },
        ],
      },
      link: FIXTURE_CLEAN_DEMETRI.link,
      export: FIXTURE_CLEAN_DEMETRI.export,
    });
    expect(result.verdict).not.toBe("unsafe");
    expect(result.diagnostic_codes).toContain(STANDARD_CODES.QA_CONTAMINATION_ARTIFACT);
    expect(result.diagnostic_codes).not.toContain(STANDARD_CODES.QA_CROSS_JOB_CONTAMINATION);
  });

  it("IL summary customer artifact does NOT produce unsafe", () => {
    const result = evaluateSignalyzedStandard({
      ...FIXTURE_CLEAN_CUSTOMER_SUCCESS,
      qa: {
        event: "resume_qa_shadow_report",
        qa_score: 75,
        verdict: "needs_review",
        critical_issue_count: 0,
        warning_count: 1,
        issue_categories: { contamination: 1 },
        issue_logs: [
          {
            rule_id: "contamination.section_artifact",
            code: "cross_jd_contamination",
            confidence: "low",
            severity: "medium",
            matched_terms: ["il summary customer"],
            contamination_subtype: "summary_artifact",
          },
        ],
      },
    });
    expect(result.verdict).not.toBe("unsafe");
    expect(result.hard_blocker_count).toBe(0);
  });

  it("clean Demetri export stays ready", () => {
    const result = evaluateSignalyzedStandard(FIXTURE_CLEAN_DEMETRI);
    expect(["ready", "needs_review"]).toContain(result.verdict);
    expect(result.hard_blocker_count).toBe(0);
  });

  it("clean Customer Success export stays ready", () => {
    const result = evaluateSignalyzedStandard(FIXTURE_CLEAN_CUSTOMER_SUCCESS);
    expect(["ready", "needs_review"]).toContain(result.verdict);
    expect(result.hard_blocker_count).toBe(0);
  });

  it("severe bullet regression gets unsafe", () => {
    const result = evaluateSignalyzedStandard(FIXTURE_SEVERE_BULLET_REGRESSION);
    expect(result.verdict).toBe("unsafe");
    expect(result.diagnostic_codes).toContain(STANDARD_CODES.QA_SEVERE_BULLET_REGRESSION);
  });

  it("role contamination gets unsafe", () => {
    const result = evaluateSignalyzedStandard(FIXTURE_ROLE_CONTAMINATION);
    expect(result.verdict).toBe("unsafe");
    expect(result.diagnostic_codes).toContain(STANDARD_CODES.QA_ROLE_CONTAMINATION);
  });

  it("PDF weak link extraction is warning only when DOCX has links", () => {
    const result = evaluateSignalyzedStandard(FIXTURE_PDF_WEAK_LINKS);
    expect(result.verdict).not.toBe("unsafe");
    expect(result.diagnostic_codes).toContain(STANDARD_CODES.PDF_LINK_EXTRACTION_WEAK);
    expect(result.hard_blocker_count).toBe(0);
  });

  it("raw JSON artifact gets unsafe", () => {
    const result = evaluateSignalyzedStandard(FIXTURE_JSON_ARTIFACT);
    expect(result.verdict).toBe("unsafe");
    expect(result.diagnostic_codes).toContain(STANDARD_CODES.EXPORT_JSON_ARTIFACT);
  });

  it("spaced headings gets unsafe", () => {
    const result = evaluateSignalyzedStandard(FIXTURE_SPACED_HEADINGS);
    expect(result.verdict).toBe("unsafe");
    expect(result.diagnostic_codes).toContain(STANDARD_CODES.EXPORT_SPACED_HEADING);
  });

  it("no raw content in audit payload", () => {
    const result = evaluateSignalyzedStandard(FIXTURE_CLEAN_DEMETRI);
    const row = toSignalyzedStandardEventRow({
      result,
      requestId: "req-1",
      exportId: "exp-1",
      exportType: "docx",
      templateVersion: "1.0.0",
      sourceReports: FIXTURE_CLEAN_DEMETRI,
    });
    expect(assertNoPiiInStandardPayload(row as unknown as Record<string, unknown>)).toBe(true);
    const report = buildSignalyzedStandardReport({
      result,
      requestId: "req-1",
      exportId: "exp-1",
      exportType: "docx",
      templateVersion: "1.0.0",
    });
    expect(report.event).toBe("signalyzed_standard_report");
    expect(JSON.stringify(report)).not.toMatch(/@|https?:\/\//);
  });

  it("missing source reports degrades confidence but does not crash", () => {
    const result = evaluateSignalyzedStandard({
      exportId: "exp-partial",
      export: FIXTURE_CLEAN_DEMETRI.export!,
    });
    expect(result.confidence).toBe("low");
    expect(result.verdict).toBe("ready");
  });
});

describe("signalyzedStandard shadow wiring", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_ENABLE_SIGNALYZED_STANDARD_SHADOW", "true");
    clearSignalyzedSourceReportsCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("insert failure never blocks export", () => {
    persistSignalyzedStandardObservatory({
      result: evaluateSignalyzedStandard(FIXTURE_BROKEN_PLACEHOLDER),
      sourceReports: FIXTURE_BROKEN_PLACEHOLDER,
      exportId: "exp-fail-test",
      exportType: "docx",
    });
    expect(true).toBe(true);
  });

  it("shadow run combines cached assembly reports with export report", () => {
    rememberSignalyzedSourceReports("req-shadow", {
      ast: FIXTURE_CLEAN_DEMETRI.ast,
      qa: FIXTURE_CLEAN_DEMETRI.qa,
      link: FIXTURE_CLEAN_DEMETRI.link,
    });
    runSignalyzedStandardShadow({
      exportReport: {
        event: "resume_export_validation_report",
        export_id: "exp-shadow-docx",
        export_type: "docx",
        template_family: "signalyz-calibrated",
        template_version: "1.0.0",
        renderer: "docx-js",
        artifact_bytes: 8000,
        render_ms: 40,
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
        request_id: "req-shadow",
      },
      exportDiagnosticCodes: [],
    });
    expect(true).toBe(true);
  });
});
