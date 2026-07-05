import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildResumeAstDashboardMetrics } from "../../supabase/functions/_shared/resumeAst/observatory/aggregates.ts";
import { createServiceClient } from "../resumeqa/lib/env.ts";

const daysArg = process.argv.find((a) => a.startsWith("--days="));
const days = daysArg ? Number(daysArg.split("=")[1]) : 7;
const end = new Date();
const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

const sb = createServiceClient();

const { data: events, error } = await sb
  .from("resume_ast_shadow_events")
  .select("*")
  .gte("created_at", start.toISOString())
  .lte("created_at", end.toISOString())
  .order("created_at", { ascending: false });

if (error) {
  console.error("Failed to fetch events:", error.message);
  process.exit(1);
}

const rows = events ?? [];
const metrics = buildResumeAstDashboardMetrics(rows);

const dashboard = {
  generated_at: new Date().toISOString(),
  window: { start: start.toISOString(), end: end.toISOString(), days },
  sample_size: rows.length,
  metrics,
};

const outDir = join(process.cwd(), "scripts", "resumeast", "reports");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `dashboard-${end.toISOString().slice(0, 10)}.json`);
writeFileSync(outPath, JSON.stringify(dashboard, null, 2));

console.log("=== RESUME AST SHADOW OBSERVATORY ===");
console.log(`Window: ${days} days · Sample: ${rows.length} events`);
console.log(`\nParse success rate: ${metrics.parse_success_rate ?? "n/a"}`);
console.log(`Average section count: ${metrics.average_section_count ?? "n/a"}`);
console.log(`Average bullet count: ${metrics.average_bullet_count ?? "n/a"}`);
console.log(`Average round-trip fidelity: ${metrics.average_round_trip_fidelity ?? "n/a"}`);
console.log(`Average bullet preservation: ${metrics.average_bullet_preservation_score ?? "n/a"}`);
console.log(`Average keyword preservation: ${metrics.average_keyword_preservation_score ?? "n/a"}`);
console.log(`Malformed resume rate: ${metrics.malformed_resume_rate ?? "n/a"}`);
console.log(`Average parse time (ms): ${metrics.average_parse_time_ms ?? "n/a"}`);

console.log("\n--- Top Validation Errors ---");
for (const item of metrics.top_validation_errors.slice(0, 10)) {
  console.log(`  ${item.code}: ${item.count}`);
}

console.log("\n--- Missing Section Frequency ---");
for (const item of metrics.missing_section_frequency.slice(0, 10)) {
  console.log(`  ${item.section_kind}: ${item.count}`);
}

console.log("\n--- Worst 10 Fidelity Cases ---");
for (const item of metrics.worst_fidelity_cases) {
  console.log(
    `  ${item.request_id ?? "unknown"} · round_trip=${item.round_trip_fidelity} · bullets=${item.bullet_preservation_score} · keywords=${item.keyword_preservation_score}`,
  );
}

console.log(`\nFull report: ${outPath}`);
