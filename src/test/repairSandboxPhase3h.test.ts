// @vitest-environment node
/**
 * Phase 3H — Repair Sandbox validation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { STANDARD_CODES } from "@/lib/signalyzedStandard/diagnosticCodes";
import { evaluateSignalyzedStandard } from "@/lib/signalyzedStandard/evaluateSignalyzedStandard";
import { classifyRepairCandidate } from "@/lib/signalyzedStandard/repairCandidates/classifyRepairCandidate";
import { buildRepairCandidateSignals } from "@/lib/signalyzedStandard/repairCandidates/repairCandidateSignals";
import { runRepairSandbox } from "@/lib/signalyzedStandard/repairSandbox";
import { evaluateSandboxResult } from "@/lib/signalyzedStandard/repairSandbox/evaluateSandboxResult";
import { selectSandboxCandidate } from "@/lib/signalyzedStandard/repairSandbox/selectSandboxCandidates";
import {
  assertNoPiiInSandboxPayload,
  buildRepairSandboxReport,
  toRepairSandboxEventRow,
} from "@/lib/signalyzedStandard/repairSandbox/sanitizeSandboxAudit";
import { buildRepairSandboxDashboardMetrics } from "@/lib/signalyzedStandard/repairSandbox/aggregates";
import { buildAndLogRepairSandbox } from "@/lib/signalyzedStandard/repairSandbox/observability";
import type {
  AstShadowSummary,
  BulletPreservationSummary,
  LinkPreservationSummary,
  QaShadowSummary,
  SignalyzedStandardInput,
} from "@/lib/signalyzedStandard/types";

const bulletBeforeRepair: BulletPreservationSummary = {
  event: "resume_bullet_preservation_report",
  protected_bullet_count: 3,
  weakened_bullet_count: 2,
  restored_bullet_count: 0,
  duplicate_bullet_count: 0,
  hallucination_guard_passed: true,
  preservation_ok: false,
  affected_sections: ["experience"],
};

const astLowBullet: AstShadowSummary = {
  event: "resume_ast_shadow_report",
  source_parse_ok: true,
  generated_parse_ok: true,
  validation_error_count: 0,
  warning_count: 1,
  round_trip_fidelity: 0.92,
  bullet_preservation_score: 0.25,
  keyword_preservation_score: 0.9,
  missing_section_count: 0,
  added_section_count: 0,
  source_sections: 4,
  generated_sections: 4,
  source_bullets: 6,
  generated_bullets: 4,
};

const linkMissing: LinkPreservationSummary = {
  event: "resume_link_preservation_report",
  source_link_count: 2,
  generated_link_count_before: 0,
  generated_link_count_after: 0,
  restored_link_count: 0,
  link_types_restored: [],
  duplicate_link_count: 0,
  broken_link_count: 0,
  preservation_ok: false,
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

function baseExport(exportId: string) {
  return {
    event: "resume_export_validation_report" as const,
    export_id: exportId,
    export_type: "docx" as const,
    template_version: "1.0.0",
    validation_passed: true,
    validation_warning_count: 0,
    validation_error_count: 0,
    link_count: 1,
    broken_link_count: 0,
    missing_expected_link_count: 0,
    duplicate_link_count: 0,
    section_count: 4,
    bullet_count: 4,
    page_count: null,
  };
}

function classifyFromInput(sourceReports: SignalyzedStandardInput) {
  const before = evaluateSignalyzedStandard(sourceReports);
  const signals = buildRepairCandidateSignals({
    result: before,
    qa: sourceReports.qa,
    link: sourceReports.link,
    bullet: sourceReports.bullet,
    ast: sourceReports.ast,
    export: sourceReports.export,
  });
  return classifyRepairCandidate({
    request_id: sourceReports.requestId,
    export_id: sourceReports.exportId,
    export_type: sourceReports.exportType,
    verdict: before.verdict,
    hard_blocker_count: before.hard_blocker_count,
    diagnostic_codes: before.diagnostic_codes,
    qa: sourceReports.qa,
    link: sourceReports.link,
    bullet: sourceReports.bullet,
    signals,
  });
}

describe("Phase 3H repair sandbox simulation", () => {
  it("preserve_high_value_bullet improves AI Engineer candidate", () => {
    const sourceReports: SignalyzedStandardInput = {
      requestId: "req-3h-ai",
      exportId: "prod-3e-std-1-ai-engineer",
      exportType: "docx",
      ast: astLowBullet,
      bullet: bulletBeforeRepair,
      qa: duplicateBulletsQa,
      export: baseExport("prod-3e-std-1-ai-engineer"),
    };

    const candidate = classifyFromInput(sourceReports);
    expect(candidate.candidate_type).toBe("preserve_high_value_bullet");
    expect(candidate.recommended_future_action).toBe("safe_future_repair");

    const sandbox = runRepairSandbox({ sourceReports, candidate });
    expect(sandbox).not.toBeNull();
    expect(sandbox!.sandbox_repair_type).toBe("preserve_high_value_bullet");
    expect(["improved", "no_change"]).toContain(sandbox!.sandbox_result);
    expect(sandbox!.sandbox_result).not.toBe("regressed");
    expect(sandbox!.after_score).toBeGreaterThanOrEqual(sandbox!.before_score);
    expect(sandbox!.diagnostic_codes_after).not.toContain(STANDARD_CODES.AST_LOW_BULLET_PRESERVATION);
  });

  it("link-dropped preserve_high_value_bullet improves or remains stable", () => {
    const sourceReports: SignalyzedStandardInput = {
      requestId: "req-3h-link",
      exportId: "prod-3e-std-5-link-dropped",
      exportType: "docx",
      ast: astLowBullet,
      bullet: bulletBeforeRepair,
      export: baseExport("prod-3e-std-5-link-dropped"),
    };

    const candidate = classifyFromInput(sourceReports);
    expect(candidate.candidate_type).toBe("preserve_high_value_bullet");

    const sandbox = runRepairSandbox({ sourceReports, candidate });
    expect(sandbox).not.toBeNull();
    expect(["improved", "no_change"]).toContain(sandbox!.sandbox_result);
    expect(sandbox!.sandbox_result).not.toBe("regressed");
  });

  it("restore_source_link improves link metrics", () => {
    const sourceReports: SignalyzedStandardInput = {
      requestId: "req-3h-restore-link",
      exportId: "prod-3h-restore-link",
      exportType: "docx",
      link: linkMissing,
      export: {
        ...baseExport("prod-3h-restore-link"),
        link_count: 0,
        missing_expected_link_count: 2,
      },
    };

    const candidate = classifyRepairCandidate({
      request_id: sourceReports.requestId,
      export_id: sourceReports.exportId,
      export_type: sourceReports.exportType,
      verdict: "needs_review",
      hard_blocker_count: 0,
      diagnostic_codes: [STANDARD_CODES.LINKS_MISSING_EXPECTED],
      link: linkMissing,
    });
    expect(candidate.candidate_type).toBe("restore_source_link");

    const sandbox = runRepairSandbox({ sourceReports, candidate });
    expect(sandbox).not.toBeNull();
    expect(sandbox!.sandbox_result).toBe("improved");
    expect(sandbox!.hard_blocker_delta).toBeLessThanOrEqual(0);
    expect(sandbox!.diagnostic_codes_after).not.toContain(STANDARD_CODES.LINKS_MISSING_EXPECTED);
  });

  it("keyword_preservation_review stays keep_human_review", () => {
    const sourceReports: SignalyzedStandardInput = {
      requestId: "req-3h-tech",
      exportId: "prod-3e-std-3-technical",
      exportType: "docx",
      qa: keywordLossQa,
      export: baseExport("prod-3e-std-3-technical"),
    };

    const candidate = classifyFromInput(sourceReports);
    expect(candidate.candidate_type).toBe("keyword_preservation_review");

    const sandbox = runRepairSandbox({ sourceReports, candidate });
    expect(sandbox).not.toBeNull();
    expect(sandbox!.sandbox_repair_type).toBe("none");
    expect(sandbox!.recommended_next_step).toBe("keep_human_review");
    expect(sandbox!.before_score).toBe(sandbox!.after_score);
  });

  it("Customer Success monitor_only produces no sandbox run", () => {
    const sourceReports: SignalyzedStandardInput = {
      requestId: "req-3h-cs",
      exportId: "prod-3e-std-2-customer-success",
      exportType: "docx",
      export: baseExport("prod-3e-std-2-customer-success"),
    };

    const candidate = classifyFromInput(sourceReports);
    expect(candidate.recommended_future_action).toBe("monitor_only");

    const sandbox = runRepairSandbox({ sourceReports, candidate });
    expect(sandbox).toBeNull();
  });

  it("true unsupported claim is excluded", () => {
    const sourceReports: SignalyzedStandardInput = {
      requestId: "req-3h-unsupported",
      exportId: "prod-3g-std-1-ai-engineer-blocker",
      exportType: "docx",
      qa: {
        event: "resume_qa_shadow_report",
        qa_score: 70,
        verdict: "fail",
        critical_issue_count: 1,
        warning_count: 0,
        issue_categories: { unsupported_claim: 1 },
        issue_logs: [
          {
            rule_id: "hallucination.untracked_terms",
            code: "unsupported_claim",
            confidence: "high",
            severity: "critical",
            unsupported_claim_subtype: "true_unsupported_claim",
          },
        ],
      },
      export: baseExport("prod-3g-std-1-ai-engineer-blocker"),
    };

    const candidate = classifyFromInput(sourceReports);
    expect(candidate.recommended_future_action).toBe("do_not_repair");

    const selection = selectSandboxCandidate({ candidate, qa: sourceReports.qa });
    expect(selection.eligible).toBe(false);

    const sandbox = runRepairSandbox({ sourceReports, candidate });
    expect(sandbox?.recommended_next_step).toBe("do_not_apply");
    expect(sandbox?.sandbox_result).toBe("unsafe_to_apply");
  });

  it("role contamination is excluded", () => {
    const candidate = classifyRepairCandidate({
      verdict: "unsafe",
      hard_blocker_count: 1,
      diagnostic_codes: [STANDARD_CODES.QA_ROLE_CONTAMINATION],
    });
    const selection = selectSandboxCandidate({ candidate });
    expect(selection.eligible).toBe(false);
    expect(selection.exclusion_reason).toBe("do_not_repair");
  });

  it("cross-job contamination is excluded", () => {
    const candidate = classifyRepairCandidate({
      verdict: "unsafe",
      hard_blocker_count: 1,
      diagnostic_codes: [STANDARD_CODES.QA_CROSS_JOB_CONTAMINATION],
    });
    const selection = selectSandboxCandidate({ candidate });
    expect(selection.eligible).toBe(false);
  });

  it("simulated regression becomes unsafe_to_apply", () => {
    const before = evaluateSignalyzedStandard({
      exportId: "exp-regression",
      exportType: "docx",
      export: baseExport("exp-regression"),
    });
    const after = {
      ...before,
      signalyzed_score: before.signalyzed_score - 20,
      verdict: "unsafe" as const,
      hard_blocker_count: 1,
      warning_count: before.warning_count + 1,
      diagnostic_codes: [...before.diagnostic_codes, STANDARD_CODES.LINKS_BROKEN],
    };

    const candidate = classifyRepairCandidate({
      export_id: "exp-regression",
      export_type: "docx",
      verdict: before.verdict,
      hard_blocker_count: before.hard_blocker_count,
      diagnostic_codes: before.diagnostic_codes,
      bullet: bulletBeforeRepair,
    });

    const sandbox = evaluateSandboxResult({
      candidate: { ...candidate, candidate_type: "preserve_high_value_bullet", candidate: true },
      before,
      after,
      sandbox_repair_type: "preserve_high_value_bullet",
    });

    expect(sandbox.sandbox_result).toBe("unsafe_to_apply");
    expect(sandbox.recommended_next_step).toBe("do_not_apply");
  });
});

describe("Phase 3H sandbox audit safety", () => {
  it("no raw repaired text stored in sandbox audit payload", () => {
    const sourceReports: SignalyzedStandardInput = {
      requestId: "req-pii",
      exportId: "prod-3e-std-1-ai-engineer",
      exportType: "docx",
      ast: astLowBullet,
      bullet: bulletBeforeRepair,
      export: baseExport("prod-3e-std-1-ai-engineer"),
    };
    const sandbox = runRepairSandbox({ sourceReports });
    expect(sandbox).not.toBeNull();

    const row = toRepairSandboxEventRow(sandbox!);
    const serialized = JSON.stringify(row);
    expect(serialized).not.toMatch(/resume_text|jd_text|bullet_text|repaired_text|generated_resume/i);
    expect(serialized).not.toMatch(/https?:\/\//i);
    expect(assertNoPiiInSandboxPayload(row as unknown as Record<string, unknown>)).toBe(true);

    const report = buildRepairSandboxReport(sandbox!);
    expect(assertNoPiiInSandboxPayload(report as unknown as Record<string, unknown>)).toBe(true);
    expect(JSON.stringify(report)).not.toContain("repaired");
  });

  it("no PII in sandbox audit payload", () => {
    const sandbox = runRepairSandbox({
      sourceReports: {
        requestId: "req-audit",
        exportId: "prod-3e-std-5-link-dropped",
        exportType: "docx",
        ast: astLowBullet,
        bullet: bulletBeforeRepair,
        export: baseExport("prod-3e-std-5-link-dropped"),
      },
    });
    expect(assertNoPiiInSandboxPayload(toRepairSandboxEventRow(sandbox!) as unknown as Record<string, unknown>)).toBe(
      true,
    );
  });
});

describe("Phase 3H sandbox observability resilience", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("insert failure never blocks export", async () => {
    vi.doMock("@/integrations/supabase/client", () => ({
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
    vi.doMock("@/lib/signalyzedStandardShadow", () => ({
      isRepairSandboxShadowEnabled: () => true,
    }));

    const { buildAndLogRepairSandbox: buildSandbox } = await import(
      "@/lib/signalyzedStandard/repairSandbox/observability"
    );

    expect(() =>
      buildSandbox({
        sourceReports: {
          requestId: "req-db-fail",
          exportId: "exp-db-fail",
          exportType: "docx",
          ast: astLowBullet,
          bullet: bulletBeforeRepair,
          export: baseExport("exp-db-fail"),
        },
      }),
    ).not.toThrow();
  });

  it("missing candidate row does not crash", () => {
    expect(() =>
      runRepairSandbox({
        sourceReports: {
          exportId: "exp-missing",
          exportType: "docx",
        },
        candidate: null,
      }),
    ).not.toThrow();

    const result = runRepairSandbox({
      sourceReports: {
        exportId: "exp-empty",
        exportType: "docx",
        export: baseExport("exp-empty"),
      },
    });
    expect(result).toBeNull();
  });
});

describe("Phase 3H five production-like repair queue rows", () => {
  const cases = [
    {
      label: "AI Engineer safe_future_repair",
      export_id: "prod-3e-std-1-ai-engineer",
      sourceReports: {
        requestId: "req-3h-1",
        exportId: "prod-3e-std-1-ai-engineer",
        exportType: "docx" as const,
        ast: astLowBullet,
        bullet: bulletBeforeRepair,
        qa: duplicateBulletsQa,
        export: baseExport("prod-3e-std-1-ai-engineer"),
      },
      expected_repair: "preserve_high_value_bullet",
      expected_result: ["improved", "no_change"],
      expected_next: "eligible_for_future_auto_repair",
    },
    {
      label: "Link-dropped safe_future_repair",
      export_id: "prod-3e-std-5-link-dropped",
      sourceReports: {
        requestId: "req-3h-5",
        exportId: "prod-3e-std-5-link-dropped",
        exportType: "docx" as const,
        ast: astLowBullet,
        bullet: bulletBeforeRepair,
        export: baseExport("prod-3e-std-5-link-dropped"),
      },
      expected_repair: "preserve_high_value_bullet",
      expected_result: ["improved", "no_change"],
      expected_next: "eligible_for_future_auto_repair",
    },
    {
      label: "Technical keyword_preservation_review",
      export_id: "prod-3e-std-3-technical",
      sourceReports: {
        requestId: "req-3h-3",
        exportId: "prod-3e-std-3-technical",
        exportType: "docx" as const,
        qa: keywordLossQa,
        export: baseExport("prod-3e-std-3-technical"),
      },
      expected_repair: "none",
      expected_result: ["no_change"],
      expected_next: "keep_human_review",
    },
    {
      label: "Customer Success monitor_only",
      export_id: "prod-3e-std-2-customer-success",
      sourceReports: {
        requestId: "req-3h-2",
        exportId: "prod-3e-std-2-customer-success",
        exportType: "docx" as const,
        export: baseExport("prod-3e-std-2-customer-success"),
      },
      expected_repair: null,
      expected_result: null,
      expected_next: null,
    },
    {
      label: "Non-technical monitor_only",
      export_id: "prod-3e-std-4-non-technical",
      sourceReports: {
        requestId: "req-3h-4",
        exportId: "prod-3e-std-4-non-technical",
        exportType: "docx" as const,
        export: baseExport("prod-3e-std-4-non-technical"),
      },
      expected_repair: null,
      expected_result: null,
      expected_next: null,
    },
  ];

  it("validates latest production-like repair queue expectations", () => {
    const outputs = cases.map((c) => ({
      label: c.label,
      sandbox: runRepairSandbox({ sourceReports: c.sourceReports }),
    }));

    for (let i = 0; i < cases.length; i++) {
      const c = cases[i];
      const sandbox = outputs[i].sandbox;
      if (c.expected_repair === null) {
        expect(sandbox, c.label).toBeNull();
        continue;
      }
      expect(sandbox, c.label).not.toBeNull();
      expect(sandbox!.sandbox_repair_type, c.label).toBe(c.expected_repair);
      expect(c.expected_result, c.label).toContain(sandbox!.sandbox_result);
      expect(sandbox!.recommended_next_step, c.label).toBe(c.expected_next);
    }

    const metrics = buildRepairSandboxDashboardMetrics(
      outputs.map((o) => o.sandbox).filter((s): s is NonNullable<typeof s> => s != null),
    );
    console.log("\n=== Phase 3H repair sandbox dashboard sample ===");
    console.log(JSON.stringify({ outputs, metrics }, null, 2));

    expect(metrics.sandbox_run_count).toBe(3);
    expect(metrics.keep_human_review_count).toBe(1);
    expect(metrics.eligible_for_future_auto_repair_count).toBe(2);
  });
});
