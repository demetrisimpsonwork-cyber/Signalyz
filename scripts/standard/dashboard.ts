import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildSignalyzedDashboardMetrics,
  buildSignalyzedTrendByDay,
} from "../../src/lib/signalyzedStandard/aggregates.ts";
import {
  parseDashboardCliArgs,
  filterStandardEventRows,
  splitLegacyAndNewRows,
  type StandardEventRowWithMeta,
} from "../../src/lib/signalyzedStandard/dashboardFilters.ts";
import { groupDiagnosticsByCategory } from "../../src/lib/signalyzedStandard/diagnosticGrouping.ts";
import { createServiceClient } from "../resumeqa/lib/env.ts";

const options = parseDashboardCliArgs();
const days = options.days ?? 7;
const end = new Date();
const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

const sb = createServiceClient();

const fetchLimit = options.last != null ? Math.max(options.last * 3, 100) : 500;

const { data: events, error } = await sb
  .from("signalyzed_standard_events")
  .select("*")
  .gte("created_at", start.toISOString())
  .lte("created_at", end.toISOString())
  .order("created_at", { ascending: false })
  .limit(fetchLimit);

if (error) {
  console.error("Failed to fetch signalyzed standard events:", error.message);
  console.error("(Migration may not be applied yet — local-only status expected before deploy.)");
  process.exit(1);
}

const allRows = (events ?? []) as StandardEventRowWithMeta[];
const currentWindowRows = filterStandardEventRows(allRows, {
  ...options,
  last: options.last,
  excludeLegacy: options.excludeLegacy,
  sinceVersion: options.sinceVersion,
  onlyNewStandardVersion: options.onlyNewStandardVersion,
});

const { legacy, newOnly, legacyAdjusted } = splitLegacyAndNewRows(allRows);
const legacyAdjustedFiltered = filterStandardEventRows(legacyAdjusted, {
  last: options.last,
  onlyNewStandardVersion: options.onlyNewStandardVersion,
});
const newOnlyFiltered = filterStandardEventRows(newOnly, {
  last: options.last,
  onlyNewStandardVersion: options.onlyNewStandardVersion,
});

function buildMetricsBlock(rows: StandardEventRowWithMeta[]) {
  const metrics = buildSignalyzedDashboardMetrics(rows);
  metrics.trend_by_day = buildSignalyzedTrendByDay(rows);
  const allCodes = rows.flatMap((r) => r.diagnostic_codes ?? []);
  return {
    sample_size: rows.length,
    metrics,
    diagnostic_groups: groupDiagnosticsByCategory(allCodes),
  };
}

const dashboard = {
  generated_at: new Date().toISOString(),
  filters: options,
  window: { start: start.toISOString(), end: end.toISOString(), days },
  current_window: buildMetricsBlock(currentWindowRows),
  legacy_adjusted: buildMetricsBlock(
    options.excludeLegacy ? legacyAdjustedFiltered : legacyAdjustedFiltered,
  ),
  new_only: buildMetricsBlock(newOnlyFiltered),
  legacy_row_count: legacy.length,
  note: "legacy_adjusted excludes prod-3c/prod-3d export ids; new_only is phase3e+ rows",
};

const outDir = join(process.cwd(), "scripts", "standard", "reports");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `dashboard-${end.toISOString().slice(0, 10)}.json`);
writeFileSync(outPath, JSON.stringify(dashboard, null, 2));

const pct = (r: number | null) => (r == null ? "n/a" : `${Math.round(r * 100)}%`);

function printMetricsBlock(title: string, block: typeof dashboard.current_window) {
  const m = block.metrics;
  console.log(`\n=== ${title} ===`);
  console.log(`Sample: ${block.sample_size} events`);
  console.log(`Average Signalyzed score: ${m.average_signalyzed_score ?? "n/a"}`);
  console.log(`Ready %: ${pct(m.ready_pct)} · Needs review %: ${pct(m.needs_review_pct)} · Unsafe %: ${pct(m.unsafe_pct)}`);
  console.log("Top codes:", m.top_diagnostic_codes.slice(0, 5).map((c) => `${c.code}(${c.count})`).join(", ") || "none");
}

console.log("=== SIGNALYZED STANDARD DASHBOARD ===");
console.log(`Window: ${days} days · Filters: ${JSON.stringify(options)}`);
console.log(`Legacy rows in window: ${legacy.length}`);

printMetricsBlock("CURRENT WINDOW", dashboard.current_window);
printMetricsBlock("LEGACY-ADJUSTED (excludes prod-3c/3d)", dashboard.legacy_adjusted);
printMetricsBlock("NEW-ONLY (phase3e+)", dashboard.new_only);

console.log("\n--- Diagnostic Groups (new-only) ---");
for (const [cat, codes] of Object.entries(dashboard.new_only.diagnostic_groups)) {
  if (codes.length === 0) continue;
  console.log(`  ${cat}: ${[...new Set(codes)].join(", ")}`);
}

console.log(`\nFull report: ${outPath}`);
