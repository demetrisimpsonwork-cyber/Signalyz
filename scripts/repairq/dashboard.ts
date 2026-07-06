import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { STANDARD_CODES } from "../../src/lib/signalyzedStandard/diagnosticCodes.ts";
import {
  parseDashboardCliArgs,
  filterStandardEventRows,
  isPhase3eOrLaterRow,
  type StandardEventRowWithMeta,
} from "../../src/lib/signalyzedStandard/dashboardFilters.ts";
import { classifyRepairCandidate } from "../../src/lib/signalyzedStandard/repairCandidates/classifyRepairCandidate.ts";
import { buildRepairCandidateDashboardMetrics } from "../../src/lib/signalyzedStandard/repairCandidates/aggregates.ts";
import { assertNoPiiInRepairCandidatePayload } from "../../src/lib/signalyzedStandard/repairCandidates/sanitizeRepairCandidate.ts";
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

let rows = filterStandardEventRows((standardEvents ?? []) as StandardEventRowWithMeta[], {
  sinceVersion: options.sinceVersion ?? "phase3e",
  excludeLegacy: options.excludeLegacy ?? true,
  last,
});

if (rows.length === 0) {
  rows = ((standardEvents ?? []) as StandardEventRowWithMeta[]).filter(isPhase3eOrLaterRow).slice(0, last);
}

const candidates = rows.map((row) => {
  const codes = row.diagnostic_codes ?? [];
  const flags = row.source_reports_present ?? {};

  const result = classifyRepairCandidate({
    request_id: row.request_id,
    export_id: row.export_id,
    export_type: row.export_type,
    verdict: row.verdict,
    hard_blocker_count: row.hard_blocker_count,
    diagnostic_codes: codes,
    link:
      flags.link && codes.includes(STANDARD_CODES.LINKS_MISSING_EXPECTED)
        ? {
            event: "resume_link_preservation_report",
            source_link_count: 1,
            generated_link_count_before: 0,
            generated_link_count_after: 0,
            restored_link_count: 0,
            link_types_restored: [],
            duplicate_link_count: 0,
            broken_link_count: 0,
            preservation_ok: false,
          }
        : null,
    bullet:
      flags.bullet && codes.includes(STANDARD_CODES.AST_LOW_BULLET_PRESERVATION)
        ? {
            event: "resume_bullet_preservation_report",
            protected_bullet_count: 2,
            weakened_bullet_count: 1,
            restored_bullet_count: 1,
            duplicate_bullet_count: 0,
            hallucination_guard_passed: true,
            preservation_ok: true,
            affected_sections: ["experience"],
          }
        : null,
  });

  const ok = assertNoPiiInRepairCandidatePayload(result as unknown as Record<string, unknown>);
  if (!ok) throw new Error(`PII detected in repair candidate for ${row.export_id}`);
  return result;
});

const metrics = buildRepairCandidateDashboardMetrics(candidates);

const report = {
  generated_at: end.toISOString(),
  filters: { days, last, ...options },
  window: { start: start.toISOString(), end: end.toISOString() },
  metrics,
  candidates,
};

const outDir = join(process.cwd(), "scripts", "repairq", "reports");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `dashboard-${end.toISOString().slice(0, 10)}.json`);
writeFileSync(outPath, JSON.stringify(report, null, 2));

const pct = (r: number | null) => (r == null ? "n/a" : `${Math.round(r * 100)}%`);

console.log("=== SIGNALYZED REPAIR CANDIDATE DASHBOARD ===");
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

console.log("\n--- Top Reason Codes ---");
for (const item of metrics.top_reason_codes.slice(0, 8)) {
  console.log(`  ${item.reason_code}: ${item.count}`);
}

console.log("\n--- Export Type Breakdown ---");
for (const item of metrics.export_type_breakdown) {
  console.log(`  ${item.export_type}: ${item.candidate_count}/${item.total} candidates`);
}

console.log(`\nFull report: ${outPath}`);
