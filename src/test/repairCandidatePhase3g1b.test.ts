// @vitest-environment node
/**
 * Phase 3G.1b — Repair queue dashboard authority patch.
 */
import { describe, it, expect } from "vitest";
import { STANDARD_CODES } from "@/lib/signalyzedStandard/diagnosticCodes";
import {
  filterRepairEventRows,
  filterStandardEventRows,
  isLegacyStandardRow,
} from "@/lib/signalyzedStandard/dashboardFilters";
import { buildInternalWarningSummary } from "@/lib/signalyzedStandard/internalWarningSummary";
import {
  resolveOperatorActionFromRepairQueue,
  resolveRecommendedOperatorAction,
} from "@/lib/signalyzedStandard/operatorActions";
import { buildRepairCandidateDashboardMetrics } from "@/lib/signalyzedStandard/repairCandidates/aggregates";
import {
  buildRepairDashboardCandidates,
  inferCandidateFromStandardRow,
  repairEventToCandidateResult,
} from "@/lib/signalyzedStandard/repairCandidates/dashboardSource";
import { assertNoPiiInRepairCandidatePayload } from "@/lib/signalyzedStandard/repairCandidates/sanitizeRepairCandidate";
import type { RepairCandidateEventRow } from "@/lib/signalyzedStandard/repairCandidates/types";
import { SIGNALYZED_STANDARD_VERSION } from "@/lib/signalyzedStandard/types";
import type { StandardEventRowWithMeta } from "@/lib/signalyzedStandard/dashboardFilters";

function makeStandardRow(
  overrides: Partial<StandardEventRowWithMeta> = {},
): StandardEventRowWithMeta {
  return {
    request_id: "req-tech",
    export_id: "prod-3g-std-3-technical-f344c4f6",
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
      grounding: 88,
      identity: 100,
      links: 100,
      export_integrity: 100,
      formatting: 100,
      ats_structure: 100,
      stability_placeholder: 100,
    },
    recommended_action: "ready_for_internal_warning",
    source_reports_present: { qa: true, bullet: true, link: true, ast: true, export: true },
    sanitizer_version: "1.0",
    ...overrides,
  };
}

function makeRepairRow(
  overrides: Partial<RepairCandidateEventRow> = {},
): RepairCandidateEventRow {
  return {
    request_id: "req-tech",
    export_id: "prod-3g-std-3-technical-f344c4f6",
    export_type: "docx",
    candidate: true,
    candidate_type: "keyword_preservation_review",
    risk_level: "medium",
    confidence: "medium",
    source_diagnostic_codes: [STANDARD_CODES.QA_ADVISORY_WARNING],
    recommended_future_action: "needs_human_review",
    reason_code: "keyword_loss_advisory",
    standard_score: 98,
    standard_verdict: "needs_review",
    internal_label: "REVIEW_INTERNAL",
    sanitizer_version: "1.1",
    ...overrides,
  };
}

describe("Phase 3G.1b dashboard source priority", () => {
  const standardRow = makeStandardRow();
  const repairRow = makeRepairRow();

  it("uses repair rows as primary in repair-events mode", () => {
    const result = buildRepairDashboardCandidates({
      sourceMode: "repair-events",
      standardRows: [standardRow],
      repairRows: [{ ...repairRow, created_at: "2026-07-06T00:00:00Z" }],
    });

    expect(result.data_source).toBe("repair_candidate_events");
    expect(result.repair_rows_used).toBe(1);
    expect(result.standard_rows_inferred).toBe(0);
    expect(result.candidates[0].candidate_type).toBe("keyword_preservation_review");
    expect(result.candidates[0].recommended_future_action).toBe("needs_human_review");
    expect(result.candidates[0].classification_source).toBe("repair_queue");
  });

  it("falls back to standard inference when repair rows missing", () => {
    const result = buildRepairDashboardCandidates({
      sourceMode: "auto",
      standardRows: [standardRow],
      repairRows: [],
      repairFetchError: null,
    });

    expect(result.data_source).toBe("standard_inferred");
    expect(result.standard_rows_inferred).toBe(1);
    expect(result.missing_repair_rows).toBe(1);
    expect(result.candidates[0].classification_source).toBe("standard_heuristic");
    expect(result.candidates[0].recommended_future_action).toBe("monitor_only");
  });

  it("mixed mode reports both sources in auto mode", () => {
    const aiStandard = makeStandardRow({
      export_id: "prod-3g-std-1-ai-engineer-221e37ba",
      diagnostic_codes: [
        STANDARD_CODES.QA_ADVISORY_WARNING,
        STANDARD_CODES.AST_LOW_BULLET_PRESERVATION,
      ],
    });
    const aiRepair = makeRepairRow({
      export_id: "prod-3g-std-1-ai-engineer-221e37ba",
      candidate_type: "preserve_high_value_bullet",
      recommended_future_action: "safe_future_repair",
      reason_code: "low_bullet_preservation_guard_verified",
      risk_level: "low",
      confidence: "high",
    });

    const result = buildRepairDashboardCandidates({
      sourceMode: "auto",
      standardRows: [aiStandard, standardRow],
      repairRows: [aiRepair],
    });

    expect(result.data_source).toBe("mixed");
    expect(result.repair_rows_used).toBe(1);
    expect(result.standard_rows_inferred).toBe(1);
    expect(result.classification_source).toBe("mixed");
    expect(result.candidates.find((c) => c.export_id === aiRepair.export_id)?.classification_source).toBe(
      "repair_queue",
    );
    expect(result.candidates.find((c) => c.export_id === standardRow.export_id)?.classification_source).toBe(
      "standard_heuristic",
    );
  });

  it("Technical GitHub persisted repair row counts as needs_human_review", () => {
    const metrics = buildRepairCandidateDashboardMetrics([
      repairEventToCandidateResult(repairRow),
    ]);
    expect(metrics.needs_human_review_count).toBe(1);
    expect(metrics.candidate_count_by_type).toEqual(
      expect.arrayContaining([{ candidate_type: "keyword_preservation_review", count: 1 }]),
    );
  });

  it("legacy rows excluded correctly", () => {
    const legacyRepair = makeRepairRow({
      export_id: "prod-3c-std-1-ai-engineer-legacy",
    });
    const filtered = filterRepairEventRows(
      [{ ...legacyRepair, created_at: "2026-07-06T00:00:00Z" }],
      { excludeLegacy: true, sinceVersion: "phase3e" },
    );
    expect(filtered).toHaveLength(0);
    expect(isLegacyStandardRow(legacyRepair)).toBe(true);
  });

  it("no raw content in dashboard JSON", () => {
    const result = buildRepairDashboardCandidates({
      sourceMode: "repair-events",
      standardRows: [],
      repairRows: [repairRow],
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/resume_text|jd_text|bullet_text|https?:\/\//i);
    expect(assertNoPiiInRepairCandidatePayload(result.candidates[0] as unknown as Record<string, unknown>)).toBe(
      true,
    );
  });

  it("missing repair table fails gracefully in repair-events mode", () => {
    expect(() =>
      buildRepairDashboardCandidates({
        sourceMode: "repair-events",
        standardRows: [],
        repairRows: [],
        repairFetchError: 'relation "signalyzed_repair_candidate_events" does not exist',
      }),
    ).toThrow(/Repair candidate table unavailable/);
  });

  it("standard-inferred mode matches prior inference behavior", () => {
    const inferred = inferCandidateFromStandardRow(standardRow);
    expect(inferred.recommended_future_action).toBe("monitor_only");

    const result = buildRepairDashboardCandidates({
      sourceMode: "standard-inferred",
      standardRows: [standardRow],
      repairRows: [repairRow],
    });
    expect(result.data_source).toBe("standard_inferred");
    expect(result.candidates[0].recommended_future_action).toBe("monitor_only");
  });
});

describe("Phase 3G.1b internal-review repair queue alignment", () => {
  it("prefers repair queue operator action for keyword preservation", () => {
    const standard = makeStandardRow();
    const repair = makeRepairRow();

    const heuristic = buildInternalWarningSummary({
      request_id: standard.request_id,
      export_id: standard.export_id,
      export_type: standard.export_type,
      signalyzed_score: standard.signalyzed_score,
      verdict: standard.verdict,
      hard_blocker_count: standard.hard_blocker_count,
      warning_count: standard.warning_count,
      diagnostic_codes: standard.diagnostic_codes,
    });
    expect(heuristic.recommended_operator_action).toBe("monitor_only");

    const aligned = buildInternalWarningSummary({
      request_id: standard.request_id,
      export_id: standard.export_id,
      export_type: standard.export_type,
      signalyzed_score: standard.signalyzed_score,
      verdict: standard.verdict,
      hard_blocker_count: standard.hard_blocker_count,
      warning_count: standard.warning_count,
      diagnostic_codes: standard.diagnostic_codes,
      repair_queue: repair,
    });
    expect(aligned.recommended_operator_action).toBe("needs_human_review");
  });

  it("maps safe_future_repair to candidate_for_future_auto_repair", () => {
    expect(
      resolveOperatorActionFromRepairQueue({
        candidate_type: "preserve_high_value_bullet",
        recommended_future_action: "safe_future_repair",
      }),
    ).toBe("candidate_for_future_auto_repair");
  });

  it("maps do_not_repair to do_not_repair", () => {
    expect(
      resolveOperatorActionFromRepairQueue({
        candidate_type: "none",
        recommended_future_action: "do_not_repair",
      }),
    ).toBe("do_not_repair");
  });

  it("keeps standard heuristics when no repair row exists", () => {
    const row = makeStandardRow({
      export_id: "prod-3g-std-1-ai-engineer-221e37ba",
      diagnostic_codes: [
        STANDARD_CODES.QA_ADVISORY_WARNING,
        STANDARD_CODES.AST_LOW_BULLET_PRESERVATION,
      ],
    });
    expect(
      resolveRecommendedOperatorAction({
        verdict: row.verdict,
        signalyzed_score: row.signalyzed_score,
        hard_blocker_count: row.hard_blocker_count,
        diagnostic_codes: row.diagnostic_codes,
      }),
    ).toBe("candidate_for_future_auto_repair");
  });
});

describe("Phase 3G.1b filter parity", () => {
  it("filterStandardEventRows and filterRepairEventRows align on prod-3g ids", () => {
    const standardRows = filterStandardEventRows(
      [
        makeStandardRow({ export_id: "prod-3g-std-3-technical-f344c4f6" }),
        makeStandardRow({ export_id: "prod-3c-legacy" }),
      ],
      { excludeLegacy: true, sinceVersion: "phase3e" },
    );
    const repairRows = filterRepairEventRows(
      [
        makeRepairRow({ export_id: "prod-3g-std-3-technical-f344c4f6" }),
        makeRepairRow({ export_id: "prod-3c-legacy" }),
      ],
      { excludeLegacy: true, sinceVersion: "phase3e" },
    );
    expect(standardRows).toHaveLength(1);
    expect(repairRows).toHaveLength(1);
  });
});
