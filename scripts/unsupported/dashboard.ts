import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseDashboardCliArgs,
  filterStandardEventRows,
  filterRepairEventRows,
  type StandardEventRowWithMeta,
} from "../../src/lib/signalyzedStandard/dashboardFilters.ts";
import type { RepairCandidateEventRow } from "../../src/lib/signalyzedStandard/repairCandidates/types.ts";
import {
  assertNoPiiInUnsupportedAuditPayload,
  buildUnsupportedClaimAuditMetrics,
  buildUnsupportedClaimAuditRows,
} from "../../src/lib/signalyzedStandard/unsupportedClaimAudit.ts";
import { createServiceClient } from "../resumeqa/lib/env.ts";

const options = parseDashboardCliArgs();
const days = options.days ?? 7;
const last = options.last ?? 50;
const end = new Date();
const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

const sb = createServiceClient();

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

const { data: repairEvents, error: repairErr } = await sb
  .from("signalyzed_repair_candidate_events")
  .select("*")
  .gte("created_at", start.toISOString())
  .lte("created_at", end.toISOString())
  .order("created_at", { ascending: false })
  .limit(Math.max(last * 2, 100));

if (repairErr) {
  console.error("Failed to fetch repair candidate events:", repairErr.message);
  process.exit(1);
}

const { data: qaEvents } = await sb
  .from("resume_qa_shadow_events")
  .select("request_id,target_role,unsupported_claim_count,top_rules")
  .gte("created_at", start.toISOString())
  .lte("created_at", end.toISOString())
  .order("created_at", { ascending: false })
  .limit(Math.max(last * 2, 100));

const standardRows = filterStandardEventRows((standardEvents ?? []) as StandardEventRowWithMeta[], {
  sinceVersion: options.sinceVersion ?? "phase3e",
  excludeLegacy: options.excludeLegacy ?? true,
  last,
});

const repairRows = filterRepairEventRows((repairEvents ?? []) as RepairCandidateEventRow[], {
  sinceVersion: options.sinceVersion ?? "phase3e",
  excludeLegacy: options.excludeLegacy ?? true,
});

const repairByExportId = new Map<string, RepairCandidateEventRow>();
for (const row of repairRows) {
  if (row.export_id) repairByExportId.set(row.export_id, row);
}

const targetRoleByRequestId = new Map<string, string>();
for (const row of qaEvents ?? []) {
  if (row.request_id && row.target_role) {
    targetRoleByRequestId.set(row.request_id, row.target_role);
  }
}

const auditRows = buildUnsupportedClaimAuditRows({
  standardRows,
  repairByExportId,
  targetRoleByRequestId,
});

const metrics = buildUnsupportedClaimAuditMetrics(auditRows);

const report = {
  generated_at: end.toISOString(),
  filters: { days, last, ...options },
  window: { start: start.toISOString(), end: end.toISOString() },
  metrics,
  rows: auditRows,
};

if (!assertNoPiiInUnsupportedAuditPayload(report as unknown as Record<string, unknown>)) {
  console.error("PII detected in unsupported claim audit report — aborting");
  process.exit(1);
}

const outDir = join(process.cwd(), "scripts", "unsupported", "reports");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `dashboard-${end.toISOString().slice(0, 10)}.json`);
writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log("=== UNSUPPORTED CLAIM AUDIT DASHBOARD ===");
console.log(`Window: ${days} days · Sample: ${metrics.sample_size}`);
console.log(`Unsupported claim diagnostics: ${metrics.unsupported_claim_diagnostics}`);
console.log(`Hard blockers: ${metrics.hard_blocker_count} · Advisory: ${metrics.advisory_count}`);
console.log(`Unsafe verdicts: ${metrics.unsafe_verdict_count}`);
console.log(`False-positive candidates: ${metrics.false_positive_candidate_count}`);
console.log(
  `True-blocker control pass rate: ${
    metrics.true_blocker_control_pass_rate == null
      ? "n/a"
      : `${Math.round(metrics.true_blocker_control_pass_rate * 100)}%`
  }`,
);

console.log("\n--- Subtype Breakdown ---");
for (const item of metrics.subtype_breakdown) {
  console.log(`  ${item.subtype}: ${item.count}`);
}

console.log("\n--- Repair Queue Action Breakdown ---");
for (const item of metrics.repair_action_breakdown) {
  console.log(`  ${item.action}: ${item.count}`);
}

console.log("\n--- Role Family Breakdown ---");
for (const item of metrics.role_family_breakdown) {
  console.log(`  ${item.role_family}: ${item.count}`);
}

console.log(`\nFull report: ${outPath}`);
