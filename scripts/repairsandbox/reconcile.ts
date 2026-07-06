import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseDashboardCliArgs,
  filterRepairEventRows,
} from "../../src/lib/signalyzedStandard/dashboardFilters.ts";
import { buildReconciliationReport } from "../../src/lib/signalyzedStandard/repairSandbox/reconcile.ts";
import type { RepairCandidateEventRowWithMeta } from "../../src/lib/signalyzedStandard/repairCandidates/dashboardSource.ts";
import { createServiceClient } from "../resumeqa/lib/env.ts";

const options = parseDashboardCliArgs();
const days = options.days ?? 7;
const last = options.last ?? 50;
const excludeLegacy = options.excludeLegacy ?? true;
const sinceVersion = options.sinceVersion ?? "phase3e";

const deployAtArg = process.argv.find((a) => a.startsWith("--sandbox-deploy-at="));
const sandboxDeployAtOverride = deployAtArg ? deployAtArg.split("=")[1] : null;

const end = new Date();
const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
const sb = createServiceClient();

const { data: repairEvents, error: repairErr } = await sb
  .from("signalyzed_repair_candidate_events")
  .select(
    "request_id,export_id,candidate,candidate_type,recommended_future_action,source_diagnostic_codes,created_at",
  )
  .gte("created_at", start.toISOString())
  .lte("created_at", end.toISOString())
  .order("created_at", { ascending: false })
  .limit(Math.max(last * 2, 100));

if (repairErr) {
  console.error("Failed to fetch repair candidate events:", repairErr.message);
  process.exit(1);
}

const repairRows = filterRepairEventRows((repairEvents ?? []) as RepairCandidateEventRowWithMeta[], {
  sinceVersion,
  excludeLegacy,
  last,
});

const exportIds = repairRows.map((r) => r.export_id).filter(Boolean) as string[];

const { data: sandboxEvents, error: sandboxErr } = await sb
  .from("signalyzed_repair_sandbox_events")
  .select(
    "request_id,export_id,candidate_type,sandbox_repair_type,source_candidate_action,created_at",
  )
  .in("export_id", exportIds.length > 0 ? exportIds : ["__none__"])
  .order("created_at", { ascending: false });

if (sandboxErr && !sandboxErr.message.includes("does not exist") && sandboxErr.code !== "42P01") {
  console.error("Failed to fetch sandbox events:", sandboxErr.message);
  process.exit(1);
}

const { data: earliestSandbox } = await sb
  .from("signalyzed_repair_sandbox_events")
  .select("created_at")
  .order("created_at", { ascending: true })
  .limit(1);

const sandboxDeployAt =
  sandboxDeployAtOverride ??
  (earliestSandbox?.[0]?.created_at as string | undefined) ??
  null;

const report = buildReconciliationReport({
  repairRows: repairRows.map((row) => ({
    request_id: row.request_id,
    export_id: row.export_id,
    candidate: row.candidate,
    candidate_type: row.candidate_type,
    recommended_future_action: row.recommended_future_action,
    source_diagnostic_codes: row.source_diagnostic_codes,
    created_at: row.created_at ?? null,
  })),
  sandboxRows: (sandboxEvents ?? []).map((row) => ({
    request_id: row.request_id,
    export_id: row.export_id,
    candidate_type: row.candidate_type,
    sandbox_repair_type: row.sandbox_repair_type,
    source_candidate_action: row.source_candidate_action,
    created_at: row.created_at ?? null,
  })),
  sandboxDeployAt,
  windowDays: days,
  last,
});

const date = new Date().toISOString().slice(0, 10);
const reportDir = join(process.cwd(), "scripts", "repairsandbox", "reports");
mkdirSync(reportDir, { recursive: true });
const reportPath = join(reportDir, `reconcile-${date}.json`);
writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log("=== REPAIR QUEUE / SANDBOX RECONCILIATION ===");
console.log(`Window: ${days} days · Last: ${last} · Sandbox deploy at: ${sandboxDeployAt ?? "unknown"}`);
console.log(`Total repair rows: ${report.total_repair_rows}`);
console.log(`Eligible sandbox candidates: ${report.eligible_sandbox_candidates}`);
console.log(`Sandbox rows found: ${report.sandbox_rows_found}`);
console.log(`Sandbox rows missing: ${report.sandbox_rows_missing}`);
console.log(`Post-deploy missing eligible: ${report.post_deploy_missing_eligible}`);
console.log(`Verdict: ${report.verdict} — ${report.verdict_note}`);

console.log("\n--- Missing by created_at bucket ---");
console.log(`  before_sandbox_deploy: ${report.missing_by_created_at_bucket.before_sandbox_deploy}`);
console.log(`  after_sandbox_deploy: ${report.missing_by_created_at_bucket.after_sandbox_deploy}`);

console.log("\n--- Skipped / missing reasons ---");
for (const [reason, count] of Object.entries(report.skipped_reason_counts)) {
  if (count > 0) console.log(`  ${reason}: ${count}`);
}

console.log("\n--- Missing by candidate_type ---");
for (const [type, count] of Object.entries(report.missing_by_candidate_type)) {
  console.log(`  ${type}: ${count}`);
}

console.log("\n--- Missing by source_candidate_action ---");
for (const [action, count] of Object.entries(report.missing_by_source_candidate_action)) {
  console.log(`  ${action}: ${count}`);
}

console.log("\n--- preserve_high_value_bullet ---");
console.log(`  total: ${report.preserve_high_value_bullet.total}`);
console.log(`  post_deploy_era: ${report.preserve_high_value_bullet.post_deploy_era}`);
console.log(`  with_sandbox_row: ${report.preserve_high_value_bullet.with_sandbox_row}`);
console.log(`  missing_sandbox_row: ${report.preserve_high_value_bullet.missing_sandbox_row}`);
console.log(
  `  missing_post_deploy_eligible: ${report.preserve_high_value_bullet.missing_post_deploy_eligible}`,
);
if (report.preserve_high_value_bullet.pre_deploy_repair_with_sandbox_row > 0) {
  console.log(
    `  pre_deploy_repair_with_sandbox_row: ${report.preserve_high_value_bullet.pre_deploy_repair_with_sandbox_row} (same-batch edge case; sandbox event time used for post_deploy_era)`,
  );
}

console.log(`\nFull report: ${reportPath}`);
