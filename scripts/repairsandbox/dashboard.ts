import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseDashboardCliArgs,
  filterRepairEventRows,
} from "../../src/lib/signalyzedStandard/dashboardFilters.ts";
import { buildRepairSandboxDashboardMetrics } from "../../src/lib/signalyzedStandard/repairSandbox/aggregates.ts";
import { assertNoPiiInSandboxPayload } from "../../src/lib/signalyzedStandard/repairSandbox/sanitizeSandboxAudit.ts";
import type { RepairSandboxOutputWithMeta } from "../../src/lib/signalyzedStandard/repairSandbox/types.ts";
import type { RepairCandidateEventRowWithMeta } from "../../src/lib/signalyzedStandard/repairCandidates/dashboardSource.ts";
import { createServiceClient } from "../resumeqa/lib/env.ts";

const options = parseDashboardCliArgs();
const days = options.days ?? 7;
const last = options.last ?? 50;
const repairTypeFilter = options.repairType;
const end = new Date();
const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

const sb = createServiceClient();

const { data: sandboxEvents, error: sandboxErr } = await sb
  .from("signalyzed_repair_sandbox_events")
  .select("*")
  .gte("created_at", start.toISOString())
  .lte("created_at", end.toISOString())
  .order("created_at", { ascending: false })
  .limit(Math.max(last * 2, 100));

const sandboxTableMissing =
  sandboxErr?.message?.includes("does not exist") || sandboxErr?.code === "42P01";

let sandboxOutputs: RepairSandboxOutputWithMeta[] = [];
let piiCheckPassed = true;

if (!sandboxErr && sandboxEvents?.length) {
  for (const row of sandboxEvents) {
    const output: RepairSandboxOutputWithMeta = {
      request_id: row.request_id,
      export_id: row.export_id,
      candidate_type: row.candidate_type,
      sandbox_repair_type: row.sandbox_repair_type,
      before_score: row.before_score,
      after_score: row.after_score,
      score_delta: row.score_delta,
      before_verdict: row.before_verdict,
      after_verdict: row.after_verdict,
      hard_blocker_delta: row.hard_blocker_delta,
      warning_delta: row.warning_delta,
      risk_level: row.risk_level,
      sandbox_result: row.sandbox_result,
      recommended_next_step: row.recommended_next_step,
      diagnostic_codes_before: row.diagnostic_codes_before ?? [],
      diagnostic_codes_after: row.diagnostic_codes_after ?? [],
      source_candidate_action: row.source_candidate_action,
      sanitizer_version: row.sanitizer_version,
      created_at: row.created_at ?? null,
    };
    if (!assertNoPiiInSandboxPayload(output as unknown as Record<string, unknown>)) {
      piiCheckPassed = false;
      throw new Error(`PII detected in sandbox row ${row.export_id}`);
    }
    sandboxOutputs.push(output);
  }
}

if (repairTypeFilter) {
  sandboxOutputs = sandboxOutputs.filter((r) => r.sandbox_repair_type === repairTypeFilter);
  if (options.last != null && options.last > 0) {
    sandboxOutputs = sandboxOutputs.slice(0, options.last);
  }
} else if (options.last != null && options.last > 0) {
  sandboxOutputs = sandboxOutputs.slice(0, options.last);
}

let repairRowsConsidered = 0;
if (sandboxOutputs.length === 0 && !repairTypeFilter) {
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

  repairRowsConsidered = filterRepairEventRows((repairEvents ?? []) as RepairCandidateEventRowWithMeta[], {
    sinceVersion: options.sinceVersion ?? "phase3e",
    excludeLegacy: options.excludeLegacy ?? true,
    last,
  }).length;
}

const metrics = buildRepairSandboxDashboardMetrics(sandboxOutputs, { pii_check_passed: piiCheckPassed });
const date = new Date().toISOString().slice(0, 10);
const reportDir = join(process.cwd(), "scripts", "repairsandbox", "reports");
mkdirSync(reportDir, { recursive: true });
const reportPath = join(reportDir, `dashboard-${date}.json`);

writeFileSync(
  reportPath,
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      window_days: days,
      repair_type_filter: repairTypeFilter ?? null,
      data_source: sandboxOutputs.length > 0 ? "sandbox-events" : "none",
      sandbox_table_missing: sandboxTableMissing,
      repair_rows_considered: repairRowsConsidered,
      pii_check_passed: piiCheckPassed,
      sandbox_outputs: sandboxOutputs,
      metrics,
    },
    null,
    2,
  ),
);

console.log("=== SIGNALYZED REPAIR SANDBOX DASHBOARD ===");
console.log(
  `Window: ${days} days · Data source: ${sandboxOutputs.length > 0 ? "sandbox-events" : "none"}` +
    (repairTypeFilter ? ` · Repair type: ${repairTypeFilter}` : ""),
);

if (sandboxTableMissing) {
  console.log(
    "Note: signalyzed_repair_sandbox_events table not deployed — apply migration 20260707120000 locally.",
  );
} else if (sandboxOutputs.length === 0) {
  console.log(
    `Note: No sandbox events in window (${repairRowsConsidered} repair candidates waiting). Export after migration to populate.`,
  );
  console.log("Run npm run repairsandbox:validate for local fixture sample metrics.");
}

if (sandboxOutputs.length > 0 || metrics.repair_type_readiness.length > 0) {
  console.log(`Sandbox runs: ${metrics.sandbox_run_count}`);
  console.log(
    `Improved: ${((metrics.improved_pct ?? 0) * 100).toFixed(1)}% · No change: ${((metrics.no_change_pct ?? 0) * 100).toFixed(1)}% · Regressed: ${((metrics.regressed_pct ?? 0) * 100).toFixed(1)}% · Unsafe: ${((metrics.unsafe_to_apply_pct ?? 0) * 100).toFixed(1)}%`,
  );
  console.log(`Average score delta: ${metrics.average_score_delta ?? "n/a"}`);
  console.log(`Eligible for future auto-repair: ${metrics.eligible_for_future_auto_repair_count}`);
  console.log(`Keep human review: ${metrics.keep_human_review_count}`);
  console.log(`Do not apply: ${metrics.do_not_apply_count}`);

  console.log("\n--- Repair Type Readiness Gate ---");
  const readinessRows = repairTypeFilter
    ? metrics.repair_type_readiness.filter((r) => r.sandbox_repair_type === repairTypeFilter)
    : metrics.repair_type_readiness.filter((r) => r.sample_count > 0 || r.sandbox_repair_type !== "none");

  for (const gate of readinessRows) {
    console.log(`\n  ${gate.sandbox_repair_type}`);
    console.log(`    readiness: ${gate.readiness_status} — ${gate.readiness_note}`);
    console.log(
      `    sample=${gate.sample_count} improved=${gate.improved_count} no_change=${gate.no_change_count} regressed=${gate.regressed_count} unsafe=${gate.unsafe_to_apply_count}`,
    );
    console.log(
      `    avg_delta=${gate.avg_score_delta ?? "n/a"} eligible=${gate.eligible_for_future_auto_repair_count} human_review=${gate.keep_human_review_count} do_not_apply=${gate.do_not_apply_count}`,
    );
    console.log(
      `    pii_ok=${gate.pii_check_passed} true_blockers_excluded=${gate.true_blockers_excluded} latest=${gate.latest_event_at ?? "n/a"}`,
    );
  }

  console.log("\n--- Repair Type Success Rate ---");
  for (const entry of metrics.repair_type_success_rate) {
    console.log(
      `  ${entry.sandbox_repair_type}: ${entry.improved_or_stable_count}/${entry.total} (${((entry.success_rate ?? 0) * 100).toFixed(0)}%)`,
    );
  }

  console.log("\n--- Risk Breakdown ---");
  for (const entry of metrics.risk_breakdown) {
    console.log(`  ${entry.risk_level}: ${entry.count}`);
  }
}

console.log(`\nFull report: ${reportPath}`);
