/**
 * Phase 3C Signalyzed Standard validation run — seven fixture evaluations.
 * Run: npm run standard:validate
 */
import { describe, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { evaluateSignalyzedStandard, buildSignalyzedDashboardMetrics } from "@/lib/signalyzedStandard";
import { assertNoPiiInStandardPayload, toSignalyzedStandardEventRow } from "@/lib/signalyzedStandard/sanitizeStandardAudit";
import { VALIDATION_RUN_FIXTURES } from "@/test/fixtures/signalyzedStandard/signalyzedStandardFixtures";

describe("Signalyzed Standard validation run (Phase 3C)", () => {
  it("evaluates seven fixtures and writes report", () => {
    const auditRows = VALIDATION_RUN_FIXTURES.map((fixture) => {
      const result = evaluateSignalyzedStandard(fixture.input);
      return toSignalyzedStandardEventRow({
        result,
        requestId: fixture.input.requestId,
        exportId: fixture.input.exportId,
        exportType: fixture.input.exportType,
        templateVersion: fixture.input.templateVersion ?? "1.0.0",
        sourceReports: fixture.input,
      });
    });

    const summaries = VALIDATION_RUN_FIXTURES.map((fixture, i) => {
      const result = evaluateSignalyzedStandard(fixture.input);
      const row = auditRows[i];
      return {
        fixture_id: fixture.id,
        label: fixture.label,
        signalyzed_score: result.signalyzed_score,
        verdict: result.verdict,
        confidence: result.confidence,
        hard_blocker_count: result.hard_blocker_count,
        warning_count: result.warning_count,
        diagnostic_codes: result.diagnostic_codes,
        recommended_action: result.recommended_action,
        no_pii_in_audit: assertNoPiiInStandardPayload(row as unknown as Record<string, unknown>),
      };
    });

    const outDir = join(process.cwd(), "scripts", "standard", "reports");
    mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, `validation-run-${new Date().toISOString().slice(0, 10)}.json`);
    writeFileSync(outPath, JSON.stringify({ standard_version: "0.1.0", summaries }, null, 2));

    const dashboardSample = {
      generated_at: new Date().toISOString(),
      sample_size: auditRows.length,
      metrics: buildSignalyzedDashboardMetrics(auditRows),
      note: "Fixture-derived sample — apply migration before production dashboard",
    };
    const dashPath = join(outDir, `dashboard-sample-${new Date().toISOString().slice(0, 10)}.json`);
    writeFileSync(dashPath, JSON.stringify(dashboardSample, null, 2));

    console.log("=== SIGNALYZED STANDARD VALIDATION RUN ===");
    for (const s of summaries) {
      console.log(
        `\n${s.label} (${s.fixture_id})\n  Score: ${s.signalyzed_score} · Verdict: ${s.verdict} · Confidence: ${s.confidence}\n  Blockers: ${s.hard_blocker_count} · Warnings: ${s.warning_count}\n  Action: ${s.recommended_action}\n  Codes: ${s.diagnostic_codes.join(", ") || "none"}`,
      );
    }
    console.log(`\nFull report: ${outPath}`);
    console.log(`Dashboard sample: ${dashPath}`);
  });
});
