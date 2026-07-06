// @vitest-environment node
/**
 * Phase 3G.1 — Repair candidate signal fidelity patch.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      upsert: vi.fn(() => ({
        then: (cb: (arg: { error: { message: string } }) => void) => {
          cb({ error: { message: "simulated failure" } });
          return Promise.resolve();
        },
      })),
    })),
  },
}));

import { STANDARD_CODES } from "@/lib/signalyzedStandard/diagnosticCodes";
import { classifyRepairCandidate } from "@/lib/signalyzedStandard/repairCandidates/classifyRepairCandidate";
import { buildQaAdvisorySummary } from "@/lib/signalyzedStandard/repairCandidates/qaAdvisorySummary";
import { buildRepairCandidateSignals } from "@/lib/signalyzedStandard/repairCandidates/repairCandidateSignals";
import {
  assertNoPiiInRepairCandidatePayload,
  buildRepairCandidateReport,
} from "@/lib/signalyzedStandard/repairCandidates/sanitizeRepairCandidate";
import { buildAndLogRepairCandidate } from "@/lib/signalyzedStandard/repairCandidates/observability";
import type { BulletPreservationSummary, QaShadowSummary } from "@/lib/signalyzedStandard/types";

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

function classifyWithSignals(input: {
  codes: string[];
  verdict?: string;
  hard_blocker_count?: number;
  qa?: QaShadowSummary | null;
  bullet?: BulletPreservationSummary | null;
}) {
  const signals = buildRepairCandidateSignals({
    qa: input.qa,
    bullet: input.bullet,
  });
  return classifyRepairCandidate({
    export_id: "exp-signal",
    export_type: "docx",
    verdict: input.verdict ?? "needs_review",
    hard_blocker_count: input.hard_blocker_count ?? 0,
    diagnostic_codes: input.codes,
    qa: input.qa,
    bullet: input.bullet,
    signals,
  });
}

describe("Phase 3G.1 signal fidelity", () => {
  it("Technical GitHub advisory + QA keyword-loss summary → keyword_preservation_review", () => {
    const before = classifyRepairCandidate({
      diagnostic_codes: [STANDARD_CODES.QA_ADVISORY_WARNING],
    });
    expect(before.candidate_type).toBe("none");
    expect(before.recommended_future_action).toBe("monitor_only");
    expect(before.reason_code).toBe("no_actionable_diagnostics");

    const after = classifyWithSignals({
      codes: [STANDARD_CODES.QA_ADVISORY_WARNING],
      qa: keywordLossQa,
    });
    expect(after.candidate).toBe(true);
    expect(after.candidate_type).toBe("keyword_preservation_review");
    expect(after.risk_level).toBe("medium");
    expect(after.recommended_future_action).toBe("needs_human_review");
    expect(after.observability?.qa_signal_present).toBe(true);
    expect(after.observability?.keyword_loss_count).toBe(1);
  });

  it("advisory warning without QA context remains monitor_only", () => {
    const result = classifyRepairCandidate({
      diagnostic_codes: [STANDARD_CODES.QA_ADVISORY_WARNING],
    });
    expect(result.candidate).toBe(false);
    expect(result.recommended_future_action).toBe("monitor_only");
    expect(result.reason_code).toBe("no_actionable_diagnostics");
  });

  it("LOW_BULLET_PRESERVATION with restored bullets stays safe_future_repair", () => {
    const result = classifyWithSignals({
      codes: [STANDARD_CODES.AST_LOW_BULLET_PRESERVATION, STANDARD_CODES.QA_ADVISORY_WARNING],
      qa: keywordLossQa,
      bullet: bulletSupported,
    });
    expect(result.candidate_type).toBe("preserve_high_value_bullet");
    expect(result.recommended_future_action).toBe("safe_future_repair");
    expect(result.observability?.bullet_preservation_restored_count).toBe(2);
  });

  it("PDF weak link extraction only stays monitor_only", () => {
    const result = classifyRepairCandidate({
      export_type: "pdf",
      verdict: "needs_review",
      diagnostic_codes: [STANDARD_CODES.PDF_LINK_EXTRACTION_WEAK],
    });
    expect(result.candidate_type).toBe("pdf_link_validation_review");
    expect(result.recommended_future_action).toBe("monitor_only");
  });

  it("true unsupported claim stays do_not_repair", () => {
    const qa: QaShadowSummary = {
      event: "resume_qa_shadow_report",
      qa_score: 70,
      verdict: "fail",
      critical_issue_count: 1,
      warning_count: 0,
      issue_categories: { unsupported_claim: 1 },
      issue_logs: [
        {
          rule_id: "hallucination.unsupported_metric",
          code: "unsupported_claim",
          confidence: "high",
          severity: "high",
          unsupported_claim_subtype: "true_unsupported_claim",
        },
      ],
    };
    const signals = buildRepairCandidateSignals({ qa });
    const result = classifyRepairCandidate({
      verdict: "unsafe",
      hard_blocker_count: 1,
      diagnostic_codes: [STANDARD_CODES.QA_UNSUPPORTED_CLAIM],
      qa,
      signals,
    });
    expect(result.candidate).toBe(false);
    expect(result.recommended_future_action).toBe("do_not_repair");
  });

  it("generic/advisory unsupported claim does not become do_not_repair", () => {
    const qa: QaShadowSummary = {
      event: "resume_qa_shadow_report",
      qa_score: 92,
      verdict: "pass",
      critical_issue_count: 0,
      warning_count: 1,
      issue_categories: { unsupported_claim: 1 },
      issue_logs: [
        {
          rule_id: "hallucination.advisory_phrase",
          code: "unsupported_claim",
          confidence: "medium",
          severity: "medium",
          unsupported_claim_subtype: "generic_business_phrase",
        },
      ],
    };
    const signals = buildRepairCandidateSignals({ qa });
    const result = classifyRepairCandidate({
      verdict: "needs_review",
      hard_blocker_count: 0,
      diagnostic_codes: [STANDARD_CODES.QA_ADVISORY_WARNING],
      qa,
      signals,
    });
    expect(result.recommended_future_action).not.toBe("do_not_repair");
  });

  it("no raw content in repair candidate payload", () => {
    const result = classifyWithSignals({
      codes: [STANDARD_CODES.QA_ADVISORY_WARNING],
      qa: keywordLossQa,
    });
    const report = buildRepairCandidateReport(result);
    const advisory = buildQaAdvisorySummary(keywordLossQa);
    expect(advisory?.lost_keyword_types).toEqual(["technical_tool"]);
    expect(JSON.stringify(report)).not.toContain("ci/cd");
    expect(assertNoPiiInRepairCandidatePayload(report as unknown as Record<string, unknown>)).toBe(true);
    expect(report.qa_signal_present).toBe(true);
    expect(report.keyword_loss_count).toBe(1);
  });

  it("missing summaries do not crash", () => {
    expect(() =>
      classifyRepairCandidate({
        diagnostic_codes: [STANDARD_CODES.QA_ADVISORY_WARNING],
        signals: buildRepairCandidateSignals({}),
      }),
    ).not.toThrow();
  });
});

describe("Phase 3G.1 five production-like fixtures", () => {
  const cases = [
    {
      label: "Demetri AI Engineer",
      codes: [STANDARD_CODES.QA_ADVISORY_WARNING, STANDARD_CODES.AST_LOW_BULLET_PRESERVATION],
      bullet: bulletSupported,
      expected_type: "preserve_high_value_bullet",
      expected_action: "safe_future_repair",
    },
    {
      label: "Customer Success",
      codes: [] as string[],
      verdict: "ready",
      expected_type: "none",
      expected_action: "monitor_only",
    },
    {
      label: "Technical GitHub/portfolio",
      codes: [STANDARD_CODES.QA_ADVISORY_WARNING],
      qa: keywordLossQa,
      expected_type: "keyword_preservation_review",
      expected_action: "needs_human_review",
    },
    {
      label: "Non-technical",
      codes: [] as string[],
      verdict: "ready",
      expected_type: "none",
      expected_action: "monitor_only",
    },
    {
      label: "Previously link-dropped",
      codes: [STANDARD_CODES.AST_LOW_BULLET_PRESERVATION],
      bullet: bulletSupported,
      expected_type: "preserve_high_value_bullet",
      expected_action: "safe_future_repair",
    },
  ];

  it("classifies five fixtures with signal fidelity", () => {
    const results = cases.map((c) =>
      classifyWithSignals({
        codes: c.codes,
        verdict: c.verdict ?? "needs_review",
        qa: c.qa,
        bullet: c.bullet,
      }),
    );

    console.log("\n=== Phase 3G.1 before/after candidate summaries ===");
    console.log(
      JSON.stringify(
        cases.map((c, i) => ({
          fixture: c.label,
          candidate_type: results[i].candidate_type,
          action: results[i].recommended_future_action,
          keyword_loss_count: results[i].observability?.keyword_loss_count ?? 0,
          qa_signal_present: results[i].observability?.qa_signal_present ?? false,
        })),
        null,
        2,
      ),
    );

    for (let i = 0; i < cases.length; i++) {
      expect(results[i].candidate_type, cases[i].label).toBe(cases[i].expected_type);
      expect(results[i].recommended_future_action, cases[i].label).toBe(cases[i].expected_action);
    }
  });
});

describe("Phase 3G.1 observability resilience", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_ENABLE_SIGNALYZED_STANDARD_SHADOW", "true");
  });

  it("DB insert failure never blocks export", () => {
    expect(() =>
      buildAndLogRepairCandidate({
        result: {
          standard_version: "0.1.0",
          signalyzed_score: 98,
          verdict: "needs_review",
          confidence: "medium",
          hard_blocker_count: 0,
          warning_count: 1,
          categories: {
            grounding: 95,
            identity: 100,
            links: 100,
            export_integrity: 100,
            formatting: 100,
            ats_structure: 100,
            stability_placeholder: 100,
          },
          diagnostic_codes: [STANDARD_CODES.QA_ADVISORY_WARNING],
          recommended_action: "ready_for_internal_warning",
        },
        sourceReports: { qa: keywordLossQa },
        requestId: "req-db-fail",
        exportId: "exp-db-fail",
        exportType: "docx",
      }),
    ).not.toThrow();
  });
});
