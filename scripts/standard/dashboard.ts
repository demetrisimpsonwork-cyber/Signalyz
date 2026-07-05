import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildSignalyzedDashboardMetrics,
  buildSignalyzedTrendByDay,
} from "../../src/lib/signalyzedStandard/aggregates.ts";
import { createServiceClient } from "../resumeqa/lib/env.ts";

const daysArg = process.argv.find((a) => a.startsWith("--days="));
const days = daysArg ? Number(daysArg.split("=")[1]) : 7;
const end = new Date();
const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

const sb = createServiceClient();

const { data: events, error } = await sb
  .from("signalyzed_standard_events")
  .select("*")
  .gte("created_at", start.toISOString())
  .lte("created_at", end.toISOString())
  .order("created_at", { ascending: false });

if (error) {
  console.error("Failed to fetch signalyzed standard events:", error.message);
  console.error("(Migration may not be applied yet — local-only status expected before deploy.)");
  process.exit(1);
}

const rows = events ?? [];
const metrics = buildSignalyzedDashboardMetrics(rows);
metrics.trend_by_day = buildSignalyzedTrendByDay(rows);

const dashboard = {
  generated_at: new Date().toISOString(),
  window: { start: start.toISOString(), end: end.toISOString(), days },
  sample_size: rows.length,
  metrics,
};

const outDir = join(process.cwd(), "scripts", "standard", "reports");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `dashboard-${end.toISOString().slice(0, 10)}.json`);
writeFileSync(outPath, JSON.stringify(dashboard, null, 2));

console.log("=== SIGNALYZED STANDARD DASHBOARD ===");
console.log(`Window: ${days} days · Sample: ${rows.length} events`);
console.log(`\nAverage Signalyzed score: ${metrics.average_signalyzed_score ?? "n/a"}`);
console.log(`Ready %: ${metrics.ready_pct ?? "n/a"}`);
console.log(`Needs review %: ${metrics.needs_review_pct ?? "n/a"}`);
console.log(`Unsafe %: ${metrics.unsafe_pct ?? "n/a"}`);

console.log("\n--- Top Diagnostic Codes ---");
for (const item of metrics.top_diagnostic_codes.slice(0, 10)) {
  console.log(`  ${item.code}: ${item.count}`);
}

console.log("\n--- Hard Blocker Frequency ---");
for (const item of metrics.hard_blocker_frequency.slice(0, 10)) {
  console.log(`  ${item.code}: ${item.count}`);
}

console.log("\n--- Average Score by Export Type ---");
for (const item of metrics.average_score_by_export_type) {
  console.log(`  ${item.export_type}: avg=${item.avg_score} (n=${item.count})`);
}

console.log("\n--- Average Score by Template Version ---");
for (const item of metrics.average_score_by_template_version) {
  console.log(`  ${item.template_version}: avg=${item.avg_score} (n=${item.count})`);
}

console.log("\n--- Recommendation Summary ---");
for (const item of metrics.recommendation_summary) {
  console.log(`  ${item.recommended_action}: ${item.count}`);
}

console.log(`\nFull report: ${outPath}`);
