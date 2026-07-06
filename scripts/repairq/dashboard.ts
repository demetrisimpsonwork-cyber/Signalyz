import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseDashboardCliArgs,
  filterStandardEventRows,
  filterRepairEventRows,
  isPhase3eOrLaterRow,
  type StandardEventRowWithMeta,
} from "../../src/lib/signalyzedStandard/dashboardFilters.ts";
import { buildRepairCandidateDashboardMetrics } from "../../src/lib/signalyzedStandard/repairCandidates/aggregates.ts";
import {
  buildRepairDashboardCandidates,
  resolveRepairDashboardSourceMode,
  type RepairCandidateEventRowWithMeta,
} from "../../src/lib/signalyzedStandard/repairCandidates/dashboardSource.ts";
import { assertNoPiiInRepairCandidatePayload } from "../../src/lib/signalyzedStandard/repairCandidates/sanitizeRepairCandidate.ts";
import { createServiceClient } from "../resumeqa/lib/env.ts";

const options = parseDashboardCliArgs();
const sourceMode = resolveRepairDashboardSourceMode(options);
const days = options.days ?? 7;
const last = options.last ?? 50;
const end = new Date();
const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

const sb = createServiceClient();

const { data: repairEvents, error: repairErr } = await sb
  .from("signalyzed_repair_candidate_events")
  .select("*")
  .gte("created_at", start.toISOString())
  .lte("created_at", end.toISOString())
  .order("created_at", { ascending: false })
  .limit(Math.max(last * 2, 100));

const repairFetchError =
  repairErr?.message?.includes("does not exist") || repairErr?.code === "42P01"
    ? repairErr.message
    : repairErr?.message ?? null;

if (repairErr && sourceMode === "repair-events") {
  console.error(
    "Repair candidate table unavailable:",
    repairErr.message,
    "\nApply migration 20260706200000_signalyzed_repair_candidate_events or use --source=standard-inferred.",
  );
  process.exit(1);
}

const { data: standardEvents, error: stdErr } = await sb
  .from("signalyzed_standard_events")
  .select("*")
  .gte("created_at", start.toISOString())
  .lte("created_at", end.toISOString())
  .order("created_at", { ascending: false })
  .limit(Math.max(last * 2, 100));

if (stdErr) {
  console.error("Failed to fetch signalyzed standard events:", stdErr.message);
  process.exit(1);
}

let standardRows = filterStandardEventRows((standardEvents ?? []) as StandardEventRowWithMeta[], {
  sinceVersion: options.sinceVersion ?? "phase3e",
  excludeLegacy: options.excludeLegacy ?? true,
  last,
});

if (standardRows.length === 0) {
  standardRows = ((standardEvents ?? []) as StandardEventRowWithMeta[])
    .filter(isPhase3eOrLaterRow)
    .slice(0, last);
}

let repairRows = filterRepairEventRows((repairEvents ?? []) as RepairCandidateEventRowWithMeta[], {
  sinceVersion: options.sinceVersion ?? "phase3e",
  excludeLegacy: options.excludeLegacy ?? true,
  last: sourceMode === "repair-events" ? last : undefined,
});

let buildResult;
try {
  buildResult = buildRepairDashboardCandidates({
    sourceMode,
    standardRows,
    repairRows,
    repairFetchError,
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const { candidates, ...sourceMeta } = buildResult;

for (const row of candidates) {
  const ok = assertNoPiiInRepairCandidatePayload(row as unknown as Record<string, unknown>);
  if (!ok) {
    console.error(`PII detected in repair candidate for ${row.export_id}`);
    process.exit(1);
  }
}

const metrics = buildRepairCandidateDashboardMetrics(candidates);

const report = {
  generated_at: end.toISOString(),
  filters: { days, last, source: sourceMode, ...options },
  window: { start: start.toISOString(), end: end.toISOString() },
  data_source: sourceMeta.data_source,
  repair_rows_used: sourceMeta.repair_rows_used,
  standard_rows_inferred: sourceMeta.standard_rows_inferred,
  missing_repair_rows: sourceMeta.missing_repair_rows,
  repair_queue_available: sourceMeta.repair_queue_available,
  repair_queue_row_count: sourceMeta.repair_queue_row_count,
  classification_source: sourceMeta.classification_source,
  metrics,
  candidates,
};

const outDir = join(process.cwd(), "scripts", "repairq", "reports");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `dashboard-${end.toISOString().slice(0, 10)}.json`);
writeFileSync(outPath, JSON.stringify(report, null, 2));

const pct = (r: number | null) => (r == null ? "n/a" : `${Math.round(r * 100)}%`);

console.log("=== SIGNALYZED REPAIR CANDIDATE DASHBOARD ===");
console.log(`Source: ${sourceMode} · Data: ${sourceMeta.data_source}`);
console.log(
  `Repair rows used: ${sourceMeta.repair_rows_used} · Inferred: ${sourceMeta.standard_rows_inferred} · Missing repair rows: ${sourceMeta.missing_repair_rows}`,
);
console.log(`Window: ${days} days · Sample: ${metrics.sample_size}`);
console.log(`Candidate rate: ${pct(metrics.candidate_rate)} (${metrics.candidate_count} candidates)`);
console.log(`Safe future repair: ${metrics.safe_future_repair_count}`);
console.log(`Needs human review: ${metrics.needs_human_review_count}`);
console.log(`Do not repair: ${metrics.do_not_repair_count}`);
console.log(`Monitor only: ${metrics.monitor_only_count}`);

console.log("\n--- Candidate Count by Type ---");
for (const item of metrics.candidate_count_by_type) {
  console.log(`  ${item.candidate_type}: ${item.count}`);
}

console.log("\n--- Risk Breakdown ---");
for (const item of metrics.risk_breakdown) {
  console.log(`  ${item.risk_level}: ${item.count}`);
}

console.log("\n--- Confidence Breakdown ---");
for (const item of metrics.confidence_breakdown) {
  console.log(`  ${item.confidence}: ${item.count}`);
}

console.log("\n--- Top Reason Codes ---");
for (const item of metrics.top_reason_codes.slice(0, 8)) {
  console.log(`  ${item.reason_code}: ${item.count}`);
}

console.log("\n--- Top Source Diagnostic Codes ---");
for (const item of metrics.top_source_diagnostic_codes.slice(0, 8)) {
  console.log(`  ${item.code}: ${item.count}`);
}

console.log("\n--- Export Type Breakdown ---");
for (const item of metrics.export_type_breakdown) {
  console.log(`  ${item.export_type}: ${item.candidate_count}/${item.total} candidates`);
}

console.log(`\nFull report: ${outPath}`);
