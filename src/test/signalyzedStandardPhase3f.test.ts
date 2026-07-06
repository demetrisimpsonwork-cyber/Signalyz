// @vitest-environment node
/**
 * Phase 3F — Internal Warning Readiness tests.
 */
import { describe, it, expect } from "vitest";
import { evaluateSignalyzedStandard } from "@/lib/signalyzedStandard/evaluateSignalyzedStandard";
import { STANDARD_CODES } from "@/lib/signalyzedStandard/diagnosticCodes";
import { SIGNALYZED_STANDARD_VERSION } from "@/lib/signalyzedStandard/types";
import {
  toSignalyzedStandardEventRow,
  assertNoPiiInStandardPayload,
} from "@/lib/signalyzedStandard/sanitizeStandardAudit";
import type { SignalyzedStandardEventRow } from "@/lib/signalyzedStandard/types";
import {
  filterStandardEventRows,
  isLegacyStandardRow,
  isPhase3eOrLaterRow,
  splitLegacyAndNewRows,
  parseDashboardCliArgs,
} from "@/lib/signalyzedStandard/dashboardFilters";
import { mapInternalQualityLabel } from "@/lib/signalyzedStandard/internalLabels";
import {
  buildInternalWarningSummary,
  toCompactInternalWarningSummary,
} from "@/lib/signalyzedStandard/internalWarningSummary";
import {
  categorizeDiagnosticCode,
  groupDiagnosticsByCategory,
} from "@/lib/signalyzedStandard/diagnosticGrouping";
import { resolveRecommendedOperatorAction } from "@/lib/signalyzedStandard/operatorActions";
import { evaluateInternalReadiness } from "@/lib/signalyzedStandard/readinessEvaluator";
import { FIXTURE_BROKEN_PLACEHOLDER } from "@/test/fixtures/signalyzedStandard/signalyzedStandardFixtures";

function makeRow(
  overrides: Partial<SignalyzedStandardEventRow> & { export_id?: string | null; created_at?: string },
): SignalyzedStandardEventRow & { created_at?: string } {
  return {
    request_id: "req-test",
    export_id: "prod-3e-std-1-test",
    standard_version: SIGNALYZED_STANDARD_VERSION,
    export_type: "docx",
    template_version: "1.0.0",
    signalyzed_score: 98,
    verdict: "needs_review",
    confidence: "high",
    hard_blocker_count: 0,
    warning_count: 1,
    diagnostic_codes: [STANDARD_CODES.QA_ADVISORY_WARNING],
    category_scores: {
      grounding: 100,
      identity: 100,
      links: 100,
      export_integrity: 100,
      formatting: 100,
      ats_structure: 100,
      stability_placeholder: 100,
    },
    recommended_action: "ready_for_internal_warning",
    source_reports_present: { ast: true, qa: true, link: true, bullet: true, export: true },
    sanitizer_version: "1.0",
    ...overrides,
  };
}

const LEGACY_3C = makeRow({
  export_id: "prod-3c-std-1-ai-engineer-abc123",
  verdict: "unsafe",
  signalyzed_score: 91,
  hard_blocker_count: 1,
  diagnostic_codes: [STANDARD_CODES.QA_CROSS_JOB_CONTAMINATION],
});

const LEGACY_3D = makeRow({
  export_id: "prod-3d-std-2-customer-success-def456",
  verdict: "unsafe",
  signalyzed_score: 91,
  hard_blocker_count: 1,
  diagnostic_codes: [STANDARD_CODES.QA_UNSUPPORTED_CLAIM],
});

const PHASE3E_CLEAN = makeRow({
  export_id: "prod-3e-std-2-customer-success-95465a09",
  verdict: "ready",
  signalyzed_score: 100,
  warning_count: 0,
  diagnostic_codes: [],
});

const PHASE3E_ADVISORY = makeRow({
  export_id: "prod-3e-std-1-ai-engineer-18c54b62",
  verdict: "needs_review",
  signalyzed_score: 96,
  diagnostic_codes: [
    STANDARD_CODES.QA_ADVISORY_WARNING,
    STANDARD_CODES.AST_LOW_BULLET_PRESERVATION,
  ],
});

const ALL_FIXTURE_ROWS = [LEGACY_3C, LEGACY_3D, PHASE3E_CLEAN, PHASE3E_ADVISORY];

describe("Phase 3F dashboard filters", () => {
  it("identifies legacy prod-3c/3d rows", () => {
    expect(isLegacyStandardRow(LEGACY_3C)).toBe(true);
    expect(isLegacyStandardRow(LEGACY_3D)).toBe(true);
    expect(isLegacyStandardRow(PHASE3E_CLEAN)).toBe(false);
  });

  it("identifies phase3e+ rows", () => {
    expect(isPhase3eOrLaterRow(PHASE3E_CLEAN)).toBe(true);
    expect(isPhase3eOrLaterRow(LEGACY_3C)).toBe(false);
    expect(
      isPhase3eOrLaterRow(
        makeRow({ export_id: "client-export", source_reports_present: { bullet: true } }),
      ),
    ).toBe(true);
  });

  it("excludes legacy rows with --exclude-legacy", () => {
    const filtered = filterStandardEventRows(ALL_FIXTURE_ROWS, { excludeLegacy: true });
    expect(filtered.every((r) => !isLegacyStandardRow(r))).toBe(true);
    expect(filtered.length).toBe(2);
  });

  it("filters since-version=phase3e", () => {
    const filtered = filterStandardEventRows(ALL_FIXTURE_ROWS, { sinceVersion: "phase3e" });
    expect(filtered.length).toBe(2);
    expect(filtered.every(isPhase3eOrLaterRow)).toBe(true);
  });

  it("filters --only-new-standard-version=0.1.0", () => {
    const mixed = [
      ...ALL_FIXTURE_ROWS,
      makeRow({ standard_version: "0.0.9", export_id: "old-version" }),
    ];
    const filtered = filterStandardEventRows(mixed, { onlyNewStandardVersion: "0.1.0" });
    expect(filtered.every((r) => r.standard_version === "0.1.0")).toBe(true);
  });

  it("applies --last=N after other filters", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      makeRow({ export_id: `prod-3e-row-${i}`, created_at: `2026-07-0${(i % 5) + 1}T00:00:00Z` }),
    );
    const filtered = filterStandardEventRows(many, { sinceVersion: "phase3e", last: 3 });
    expect(filtered.length).toBe(3);
  });

  it("parses CLI args", () => {
    const opts = parseDashboardCliArgs([
      "node",
      "dashboard.ts",
      "--since-version=phase3e",
      "--exclude-legacy",
      "--last=50",
      "--only-new-standard-version=0.1.0",
    ]);
    expect(opts.sinceVersion).toBe("phase3e");
    expect(opts.excludeLegacy).toBe(true);
    expect(opts.last).toBe(50);
    expect(opts.onlyNewStandardVersion).toBe("0.1.0");
  });

  it("splitLegacyAndNewRows separates cohorts", () => {
    const { legacy, newOnly, legacyAdjusted } = splitLegacyAndNewRows(ALL_FIXTURE_ROWS);
    expect(legacy.length).toBe(2);
    expect(newOnly.length).toBe(2);
    expect(legacyAdjusted.length).toBe(2);
  });
});

describe("Phase 3F internal labels", () => {
  it("maps ready score>=95 to READY_INTERNAL", () => {
    expect(
      mapInternalQualityLabel({ verdict: "ready", signalyzed_score: 100, hard_blocker_count: 0 }),
    ).toBe("READY_INTERNAL");
  });

  it("maps needs_review without blockers to REVIEW_INTERNAL", () => {
    expect(
      mapInternalQualityLabel({ verdict: "needs_review", signalyzed_score: 96, hard_blocker_count: 0 }),
    ).toBe("REVIEW_INTERNAL");
  });

  it("maps unsafe to UNSAFE_INTERNAL", () => {
    expect(
      mapInternalQualityLabel({ verdict: "unsafe", signalyzed_score: 91, hard_blocker_count: 1 }),
    ).toBe("UNSAFE_INTERNAL");
  });

  it("maps hard_blocker_count>0 to UNSAFE_INTERNAL even when verdict is needs_review", () => {
    expect(
      mapInternalQualityLabel({ verdict: "needs_review", signalyzed_score: 98, hard_blocker_count: 1 }),
    ).toBe("UNSAFE_INTERNAL");
  });

  it("advisory-only production row stays REVIEW_INTERNAL not UNSAFE_INTERNAL", () => {
    const label = mapInternalQualityLabel(PHASE3E_ADVISORY);
    expect(label).toBe("REVIEW_INTERNAL");
    expect(label).not.toBe("UNSAFE_INTERNAL");
  });
});

describe("Phase 3F internal warning summary", () => {
  it("builds sanitized summary without raw content", () => {
    const summary = buildInternalWarningSummary(PHASE3E_ADVISORY);
    expect(summary.request_id).toBe(PHASE3E_ADVISORY.request_id);
    expect(summary.internal_label).toBe("REVIEW_INTERNAL");
    expect(summary.recommended_operator_action).toBeDefined();
    expect(summary.top_diagnostic_codes.length).toBeGreaterThan(0);
    expect(summary.diagnostic_groups.advisory.length).toBeGreaterThan(0);

    const compact = toCompactInternalWarningSummary(summary);
    expect(compact).not.toHaveProperty("diagnostic_groups");
    expect(assertNoPiiInStandardPayload(compact as unknown as Record<string, unknown>)).toBe(true);
  });

  it("hard blocker row gets investigate_rule or inspect_export", () => {
    const summary = buildInternalWarningSummary(LEGACY_3C);
    expect(summary.internal_label).toBe("UNSAFE_INTERNAL");
    expect(["investigate_rule", "inspect_export"]).toContain(summary.recommended_operator_action);
  });

  it("ready row gets no_action", () => {
    const action = resolveRecommendedOperatorAction(PHASE3E_CLEAN);
    expect(action).toBe("no_action");
  });
});

describe("Phase 3F diagnostic grouping", () => {
  it("groups export integrity codes", () => {
    expect(categorizeDiagnosticCode(STANDARD_CODES.EXPORT_BROKEN_PLACEHOLDER)).toBe("export_integrity");
    expect(categorizeDiagnosticCode(STANDARD_CODES.EXPORT_JSON_ARTIFACT)).toBe("export_integrity");
  });

  it("groups link integrity codes", () => {
    expect(categorizeDiagnosticCode(STANDARD_CODES.LINKS_MISSING_EXPECTED)).toBe("link_integrity");
    expect(categorizeDiagnosticCode(STANDARD_CODES.PDF_LINK_EXTRACTION_WEAK)).toBe("link_integrity");
  });

  it("groups evidence preservation codes", () => {
    expect(categorizeDiagnosticCode(STANDARD_CODES.AST_LOW_BULLET_PRESERVATION)).toBe(
      "evidence_preservation",
    );
    expect(categorizeDiagnosticCode(STANDARD_CODES.QA_SEVERE_BULLET_REGRESSION)).toBe(
      "evidence_preservation",
    );
  });

  it("groups grounding codes", () => {
    expect(categorizeDiagnosticCode(STANDARD_CODES.QA_UNSUPPORTED_CLAIM)).toBe("grounding");
    expect(categorizeDiagnosticCode(STANDARD_CODES.QA_CROSS_JOB_CONTAMINATION)).toBe("grounding");
  });

  it("groups AST structure codes", () => {
    expect(categorizeDiagnosticCode(STANDARD_CODES.AST_PARSE_FAILURE)).toBe("ast_structure");
  });

  it("groupDiagnosticsByCategory partitions codes", () => {
    const groups = groupDiagnosticsByCategory([
      STANDARD_CODES.QA_ADVISORY_WARNING,
      STANDARD_CODES.LINKS_MISSING_EXPECTED,
      STANDARD_CODES.QA_CROSS_JOB_CONTAMINATION,
    ]);
    expect(groups.advisory).toContain(STANDARD_CODES.QA_ADVISORY_WARNING);
    expect(groups.link_integrity).toContain(STANDARD_CODES.LINKS_MISSING_EXPECTED);
    expect(groups.grounding).toContain(STANDARD_CODES.QA_CROSS_JOB_CONTAMINATION);
  });
});

describe("Phase 3F readiness evaluator", () => {
  it("returns keep_shadow when unsafe rate is high", () => {
    const legacyHeavy = Array.from({ length: 40 }, () =>
      makeRow({ verdict: "unsafe", signalyzed_score: 91, hard_blocker_count: 1 }),
    );
    const result = evaluateInternalReadiness({
      rows: legacyHeavy,
      sampleLimit: 50,
      noPiiVerified: true,
      trueBlockerControlsPass: true,
      exportValidationPassRate: 0.99,
      brokenLinkRate: 0.01,
    });
    expect(result.status).toBe("keep_shadow");
    expect(result.reasons.some((r) => r.startsWith("unsafe_rate_high"))).toBe(true);
  });

  it("returns ready_for_internal_warning when phase3e sample is clean", () => {
    const clean = Array.from({ length: 10 }, (_, i) =>
      makeRow({
        export_id: `prod-3e-clean-${i}`,
        verdict: i % 3 === 0 ? "needs_review" : "ready",
        signalyzed_score: i % 3 === 0 ? 96 : 100,
        hard_blocker_count: 0,
        diagnostic_codes: i % 3 === 0 ? [STANDARD_CODES.QA_ADVISORY_WARNING] : [],
      }),
    );
    const result = evaluateInternalReadiness({
      rows: clean,
      sampleLimit: 50,
      noPiiVerified: true,
      trueBlockerControlsPass: true,
      exportValidationPassRate: 0.99,
      brokenLinkRate: 0.005,
    });
    expect(result.status).toBe("ready_for_internal_warning");
    expect(result.unsafe_rate).toBe(0);
  });

  it("returns investigate_before_warning when controls fail", () => {
    const result = evaluateInternalReadiness({
      rows: [PHASE3E_CLEAN],
      noPiiVerified: true,
      trueBlockerControlsPass: false,
    });
    expect(result.status).toBe("investigate_before_warning");
  });

  it("returns investigate_before_warning when PII check fails", () => {
    const result = evaluateInternalReadiness({
      rows: [PHASE3E_CLEAN],
      noPiiVerified: false,
      trueBlockerControlsPass: true,
    });
    expect(result.status).toBe("investigate_before_warning");
  });
});

describe("Phase 3F integration with evaluator fixtures", () => {
  it("broken placeholder maps to UNSAFE_INTERNAL", () => {
    const result = evaluateSignalyzedStandard(FIXTURE_BROKEN_PLACEHOLDER);
    const row = toSignalyzedStandardEventRow({
      result,
      requestId: FIXTURE_BROKEN_PLACEHOLDER.requestId,
      exportId: FIXTURE_BROKEN_PLACEHOLDER.exportId,
      exportType: "docx",
      templateVersion: "1.0.0",
      sourceReports: FIXTURE_BROKEN_PLACEHOLDER,
    });
    expect(mapInternalQualityLabel(row)).toBe("UNSAFE_INTERNAL");
    expect(result.verdict).toBe("unsafe");
  });

  it("internal review JSON has no raw content", () => {
    const rows = ALL_FIXTURE_ROWS.map((row) => {
      const summary = buildInternalWarningSummary(row);
      return toCompactInternalWarningSummary(summary);
    });
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toMatch(/resume_text|jd_text|bullet_text|@|https?:\/\//i);
    expect(rows.every((r) => assertNoPiiInStandardPayload(r as unknown as Record<string, unknown>))).toBe(
      true,
    );
  });
});

describe("Phase 3F five clean Phase 3E exports — internal labels", () => {
  const phase3eCleanExports: Array<Partial<SignalyzedStandardEventRow> & { label: string }> = [
    {
      label: "Demetri AI Engineer",
      export_id: "prod-3e-std-1-ai-engineer",
      verdict: "needs_review",
      signalyzed_score: 96,
      hard_blocker_count: 0,
      diagnostic_codes: [STANDARD_CODES.QA_ADVISORY_WARNING, STANDARD_CODES.AST_LOW_BULLET_PRESERVATION],
    },
    {
      label: "Customer Success",
      export_id: "prod-3e-std-2-customer-success",
      verdict: "ready",
      signalyzed_score: 100,
      hard_blocker_count: 0,
      diagnostic_codes: [],
    },
    {
      label: "Technical GitHub",
      export_id: "prod-3e-std-3-technical",
      verdict: "needs_review",
      signalyzed_score: 98,
      hard_blocker_count: 0,
      diagnostic_codes: [STANDARD_CODES.QA_ADVISORY_WARNING],
    },
    {
      label: "Non-technical",
      export_id: "prod-3e-std-4-non-technical",
      verdict: "ready",
      signalyzed_score: 100,
      hard_blocker_count: 0,
      diagnostic_codes: [],
    },
    {
      label: "Link-dropped",
      export_id: "prod-3e-std-5-link-dropped",
      verdict: "needs_review",
      signalyzed_score: 99,
      hard_blocker_count: 0,
      diagnostic_codes: [STANDARD_CODES.AST_LOW_BULLET_PRESERVATION],
    },
  ];

  it("none of five clean exports become UNSAFE_INTERNAL", () => {
    for (const exp of phase3eCleanExports) {
      const row = makeRow(exp);
      const label = mapInternalQualityLabel(row);
      expect(label, exp.label).not.toBe("UNSAFE_INTERNAL");
    }
  });

  it("readiness passes on five clean phase3e exports", () => {
    const rows = phase3eCleanExports.map((e) => makeRow(e));
    const result = evaluateInternalReadiness({
      rows,
      sampleLimit: 50,
      noPiiVerified: true,
      trueBlockerControlsPass: true,
      exportValidationPassRate: 1,
      brokenLinkRate: 0,
      thresholds: { minSampleSize: 5 },
    });
    expect(result.status).toBe("ready_for_internal_warning");
    expect(result.unsafe_rate).toBe(0);
  });
});
