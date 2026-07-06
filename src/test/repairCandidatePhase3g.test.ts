// @vitest-environment node
/**
 * Phase 3G — Auto-Repair Candidate Queue validation.
 */
import { describe, it, expect } from "vitest";
import { STANDARD_CODES } from "@/lib/signalyzedStandard/diagnosticCodes";
import { classifyRepairCandidate } from "@/lib/signalyzedStandard/repairCandidates/classifyRepairCandidate";
import {
  assertNoPiiInRepairCandidatePayload,
  buildRepairCandidateReport,
  toRepairCandidateEventRow,
} from "@/lib/signalyzedStandard/repairCandidates/sanitizeRepairCandidate";
import { buildRepairCandidateDashboardMetrics } from "@/lib/signalyzedStandard/repairCandidates/aggregates";
import { buildRepairCandidateSignals } from "@/lib/signalyzedStandard/repairCandidates/repairCandidateSignals";
import type { BulletPreservationSummary, LinkPreservationSummary, QaShadowSummary } from "@/lib/signalyzedStandard/types";

const bulletSupported: BulletPreservationSummary = {
  event: "resume_bullet_preservation_report",
  protected_bullet_count: 3,
  weakened_bullet_count: 2,
  restored_bullet_count: 2,
  duplicate_bullet_count: 0,
  hallucination_guard_passed: true,
  preservation_ok: true,
  affected_sections: ["experience"],
};

const linkSupported: LinkPreservationSummary = {
  event: "resume_link_preservation_report",
  source_link_count: 2,
  generated_link_count_before: 1,
  generated_link_count_after: 2,
  restored_link_count: 1,
  link_types_restored: ["github"],
  duplicate_link_count: 0,
  broken_link_count: 0,
  preservation_ok: true,
};

const keywordLossQa: QaShadowSummary = {
  event: "resume_qa_shadow_report",
  qa_score: 95,
  verdict: "pass",
  critical_issue_count: 0,
  warning_count: 1,
  issue_categories: { keyword_loss: 1 },
  issue_logs: [
    {
      rule_id: "keyword_preservation.high_value_loss",
      code: "keyword_loss",
      confidence: "medium",
      severity: "medium",
      matched_terms: ["ci/cd"],
    },
  ],
};

const duplicateBulletsQa: QaShadowSummary = {
  event: "resume_qa_shadow_report",
  qa_score: 95,
  verdict: "pass",
  critical_issue_count: 0,
  warning_count: 1,
  issue_categories: { formatting: 1 },
  issue_logs: [
    {
      rule_id: "formatting.duplicate_bullets",
      code: "formatting_duplicate_bullets",
      confidence: "medium",
      severity: "medium",
      matched_terms: ["duplicate_bullet"],
    },
  ],
};

describe("Phase 3G repair candidate classification", () => {
  it("LOW_BULLET_PRESERVATION with guard support → preserve_high_value_bullet safe future repair", () => {
    const result = classifyRepairCandidate({
      request_id: "req-ai",
      export_id: "prod-3e-std-1-ai-engineer",
      export_type: "docx",
      verdict: "needs_review",
      hard_blocker_count: 0,
      diagnostic_codes: [
        STANDARD_CODES.AST_LOW_BULLET_PRESERVATION,
        STANDARD_CODES.QA_ADVISORY_WARNING,
      ],
      bullet: bulletSupported,
    });
    expect(result.candidate).toBe(true);
    expect(result.candidate_type).toBe("preserve_high_value_bullet");
    expect(result.risk_level).toBe("low");
    expect(result.recommended_future_action).toBe("safe_future_repair");
    expect(result.reason_code).toBe("low_bullet_preservation_guard_verified");
  });

  it("MISSING_EXPECTED_LINK with link report support → restore_source_link", () => {
    const result = classifyRepairCandidate({
      request_id: "req-link",
      export_id: "exp-link",
      export_type: "docx",
      verdict: "needs_review",
      hard_blocker_count: 0,
      diagnostic_codes: [STANDARD_CODES.LINKS_MISSING_EXPECTED],
      link: linkSupported,
    });
    expect(result.candidate).toBe(true);
    expect(result.candidate_type).toBe("restore_source_link");
    expect(result.recommended_future_action).toBe("safe_future_repair");
  });

  it("MISSING_EXPECTED_LINK without link support → not restore candidate", () => {
    const result = classifyRepairCandidate({
      diagnostic_codes: [STANDARD_CODES.LINKS_MISSING_EXPECTED],
      link: null,
    });
    expect(result.candidate_type).not.toBe("restore_source_link");
  });

  it("PDF_LINK_EXTRACTION_WEAK → pdf_link_validation_review monitor_only", () => {
    const result = classifyRepairCandidate({
      export_type: "pdf",
      verdict: "needs_review",
      hard_blocker_count: 0,
      diagnostic_codes: [
        STANDARD_CODES.PDF_LINK_EXTRACTION_WEAK,
        STANDARD_CODES.LINKS_MISSING_EXPECTED,
      ],
    });
    expect(result.candidate).toBe(true);
    expect(result.candidate_type).toBe("pdf_link_validation_review");
    expect(result.recommended_future_action).toBe("monitor_only");
  });

  it("keyword loss advisory → keyword_preservation_review", () => {
    const result = classifyRepairCandidate({
      diagnostic_codes: [STANDARD_CODES.QA_ADVISORY_WARNING],
      qa: keywordLossQa,
    });
    expect(result.candidate).toBe(true);
    expect(result.candidate_type).toBe("keyword_preservation_review");
    expect(result.recommended_future_action).toBe("needs_human_review");
  });

  it("duplicate bullets → dedupe_bullets safe future repair", () => {
    const result = classifyRepairCandidate({
      diagnostic_codes: [STANDARD_CODES.QA_ADVISORY_WARNING],
      qa: duplicateBulletsQa,
    });
    expect(result.candidate).toBe(true);
    expect(result.candidate_type).toBe("dedupe_bullets");
    expect(result.recommended_future_action).toBe("safe_future_repair");
  });

  it("unsupported claim → do_not_repair, not safe candidate", () => {
    const result = classifyRepairCandidate({
      verdict: "unsafe",
      hard_blocker_count: 1,
      diagnostic_codes: [STANDARD_CODES.QA_UNSUPPORTED_CLAIM],
    });
    expect(result.candidate).toBe(false);
    expect(result.recommended_future_action).toBe("do_not_repair");
    expect(result.reason_code).toBe("high_risk_unsupported_claim");
  });

  it("role contamination → do_not_repair", () => {
    const result = classifyRepairCandidate({
      verdict: "unsafe",
      hard_blocker_count: 1,
      diagnostic_codes: [STANDARD_CODES.QA_ROLE_CONTAMINATION],
    });
    expect(result.candidate).toBe(false);
    expect(result.recommended_future_action).toBe("do_not_repair");
  });

  it("cross-job contamination → do_not_repair", () => {
    const result = classifyRepairCandidate({
      verdict: "unsafe",
      hard_blocker_count: 1,
      diagnostic_codes: [STANDARD_CODES.QA_CROSS_JOB_CONTAMINATION],
    });
    expect(result.candidate).toBe(false);
    expect(result.recommended_future_action).toBe("do_not_repair");
  });

  it("ready export with no diagnostics → candidate=false", () => {
    const result = classifyRepairCandidate({
      export_id: "prod-3e-std-2-customer-success",
      verdict: "ready",
      hard_blocker_count: 0,
      diagnostic_codes: [],
    });
    expect(result.candidate).toBe(false);
    expect(result.candidate_type).toBe("none");
    expect(result.reason_code).toBe("ready_no_diagnostics");
  });
});

describe("Phase 3G sanitization and persistence", () => {
  it("sanitizer blocks raw content patterns", () => {
    const result = classifyRepairCandidate({
      request_id: "req-1",
      export_id: "exp-1",
      export_type: "docx",
      diagnostic_codes: [STANDARD_CODES.AST_LOW_BULLET_PRESERVATION],
      bullet: bulletSupported,
    });
    const report = buildRepairCandidateReport(result);
    expect(assertNoPiiInRepairCandidatePayload(report as unknown as Record<string, unknown>)).toBe(true);

    const row = toRepairCandidateEventRow({
      result,
      standard_score: 96,
      standard_verdict: "needs_review",
      hard_blocker_count: 0,
    });
    const serialized = JSON.stringify(row);
    expect(serialized).not.toMatch(/resume_text|jd_text|bullet_text|@|https?:\/\//i);
    expect(assertNoPiiInRepairCandidatePayload(row as unknown as Record<string, unknown>)).toBe(true);
  });

  it("classifyRepairCandidate never throws on partial input", () => {
    expect(() => classifyRepairCandidate({ diagnostic_codes: [] })).not.toThrow();
    expect(() =>
      classifyRepairCandidate({
        verdict: "unsafe",
        hard_blocker_count: 2,
        diagnostic_codes: [STANDARD_CODES.QA_CROSS_JOB_CONTAMINATION],
      }),
    ).not.toThrow();
  });
});

describe("Phase 3G five Phase 3E production-like exports", () => {
  const cases = [
    {
      label: "Demetri AI Engineer",
      export_id: "prod-3e-std-1-ai-engineer",
      verdict: "needs_review" as const,
      codes: [STANDARD_CODES.QA_ADVISORY_WARNING, STANDARD_CODES.AST_LOW_BULLET_PRESERVATION],
      bullet: bulletSupported,
      qa: duplicateBulletsQa,
      expected_type: "preserve_high_value_bullet",
      expected_action: "safe_future_repair",
    },
    {
      label: "Customer Success",
      export_id: "prod-3e-std-2-customer-success",
      verdict: "ready" as const,
      codes: [] as string[],
      expected_type: "none",
      expected_action: "monitor_only",
    },
    {
      label: "Technical GitHub",
      export_id: "prod-3e-std-3-technical",
      verdict: "needs_review" as const,
      codes: [STANDARD_CODES.QA_ADVISORY_WARNING],
      qa: keywordLossQa,
      expected_type: "keyword_preservation_review",
      expected_action: "needs_human_review",
    },
    {
      label: "Non-technical",
      export_id: "prod-3e-std-4-non-technical",
      verdict: "ready" as const,
      codes: [] as string[],
      expected_type: "none",
      expected_action: "monitor_only",
    },
    {
      label: "Link-dropped",
      export_id: "prod-3e-std-5-link-dropped",
      verdict: "needs_review" as const,
      codes: [STANDARD_CODES.AST_LOW_BULLET_PRESERVATION],
      bullet: bulletSupported,
      expected_type: "preserve_high_value_bullet",
      expected_action: "safe_future_repair",
    },
  ];

  it("classifies five Phase 3E exports as expected", () => {
    const results = cases.map((c) => {
      const signals = buildRepairCandidateSignals({ qa: c.qa, bullet: c.bullet });
      return classifyRepairCandidate({
        export_id: c.export_id,
        export_type: c.export_type ?? "docx",
        verdict: c.verdict,
        hard_blocker_count: 0,
        diagnostic_codes: c.codes,
        bullet: c.bullet,
        qa: c.qa,
        signals,
      });
    });

    for (let i = 0; i < cases.length; i++) {
      expect(results[i].candidate_type, cases[i].label).toBe(cases[i].expected_type);
      expect(results[i].recommended_future_action, cases[i].label).toBe(cases[i].expected_action);
    }

    const metrics = buildRepairCandidateDashboardMetrics(results);
    console.log("\n=== Phase 3G candidate dashboard sample ===");
    console.log(JSON.stringify({ results, metrics }, null, 2));

    expect(metrics.candidate_count).toBe(3);
    expect(results.filter((r) => r.recommended_future_action === "do_not_repair")).toHaveLength(0);
  });
});

describe("Phase 3G true-blocker controls", () => {
  it("true blockers never become safe_future_repair", () => {
    const blockers = [
      [STANDARD_CODES.QA_UNSUPPORTED_CLAIM],
      [STANDARD_CODES.QA_ROLE_CONTAMINATION],
      [STANDARD_CODES.QA_CROSS_JOB_CONTAMINATION],
      [STANDARD_CODES.QA_SEVERE_BULLET_REGRESSION],
    ];

    for (const codes of blockers) {
      const result = classifyRepairCandidate({
        verdict: "unsafe",
        hard_blocker_count: 1,
        diagnostic_codes: codes,
      });
      expect(result.recommended_future_action).not.toBe("safe_future_repair");
      expect(result.candidate).toBe(false);
    }
  });
});
