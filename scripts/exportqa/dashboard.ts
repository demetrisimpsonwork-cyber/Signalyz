import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildExportDashboardMetrics } from "../../src/lib/exportValidation/aggregates.ts";
import { createServiceClient } from "../resumeqa/lib/env.ts";

const daysArg = process.argv.find((a) => a.startsWith("--days="));
const days = daysArg ? Number(daysArg.split("=")[1]) : 7;
const end = new Date();
const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

const sb = createServiceClient();

const { data: events, error } = await sb
  .from("resume_export_audit_logs")
  .select("*")
  .gte("created_at", start.toISOString())
  .lte("created_at", end.toISOString())
  .order("created_at", { ascending: false });

if (error) {
  console.error("Failed to fetch export audit logs:", error.message);
  process.exit(1);
}

const rows = events ?? [];
const metrics = buildExportDashboardMetrics(rows);

const dashboard = {
  generated_at: new Date().toISOString(),
  window: { start: start.toISOString(), end: end.toISOString(), days },
  sample_size: rows.length,
  metrics,
};

const outDir = join(process.cwd(), "scripts", "exportqa", "reports");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `dashboard-${end.toISOString().slice(0, 10)}.json`);
writeFileSync(outPath, JSON.stringify(dashboard, null, 2));

console.log("=== EXPORT QA DASHBOARD ===");
console.log(`Window: ${days} days · Sample: ${rows.length} events`);
console.log(`\nExport success rate: ${metrics.export_success_rate ?? "n/a"}`);
console.log(`DOCX validation pass rate: ${metrics.docx_validation_pass_rate ?? "n/a"}`);
console.log(`PDF validation pass rate: ${metrics.pdf_validation_pass_rate ?? "n/a"}`);
console.log(`Average render time (ms): ${metrics.average_render_ms ?? "n/a"}`);
console.log(`P95 render time (ms): ${metrics.p95_render_ms ?? "n/a"}`);
console.log(`Broken link rate: ${metrics.broken_link_rate ?? "n/a"}`);
console.log(`Missing expected link rate: ${metrics.missing_expected_link_rate ?? "n/a"}`);
console.log(`Duplicate link rate: ${metrics.duplicate_link_rate ?? "n/a"}`);

console.log("\n--- Top Validation Warnings ---");
for (const item of metrics.top_validation_warnings.slice(0, 10)) {
  console.log(`  ${item.code}: ${item.count}`);
}

console.log("\n--- Top Validation Errors ---");
for (const item of metrics.top_validation_errors.slice(0, 10)) {
  console.log(`  ${item.code}: ${item.count}`);
}

console.log("\n--- Template Version Breakdown ---");
for (const item of metrics.template_version_breakdown) {
  console.log(`  ${item.template_version}: count=${item.count} pass_rate=${item.pass_rate ?? "n/a"}`);
}

console.log(`\nFull report: ${outPath}`);
