import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseDashboardCliArgs,
  filterStandardEventRows,
  type StandardEventRowWithMeta,
} from "../../src/lib/signalyzedStandard/dashboardFilters.ts";
import {
  buildInternalWarningSummary,
  toCompactInternalWarningSummary,
} from "../../src/lib/signalyzedStandard/internalWarningSummary.ts";
import { evaluateInternalReadiness } from "../../src/lib/signalyzedStandard/readinessEvaluator.ts";
import type { RepairCandidateEventRow } from "../../src/lib/signalyzedStandard/repairCandidates/types.ts";
import { assertNoPiiInStandardPayload } from "../../src/lib/signalyzedStandard/sanitizeStandardAudit.ts";
import { createServiceClient } from "../resumeqa/lib/env.ts";

const options = parseDashboardCliArgs();
const last = options.last ?? 50;

const sb = createServiceClient();
const { data: events, error } = await sb
  .from("signalyzed_standard_events")
  .select("*")
  .order("created_at", { ascending: false })
  .limit(Math.max(last * 2, 100));

if (error) {
  console.error("Failed to fetch signalyzed standard events:", error.message);
  process.exit(1);
}

const { data: repairEvents, error: repairErr } = await sb
  .from("signalyzed_repair_candidate_events")
  .select("*")
  .order("created_at", { ascending: false })
  .limit(Math.max(last * 2, 100));

const repair_queue_available = !repairErr;
const repairByExportId = new Map<string, RepairCandidateEventRow>();
if (repair_queue_available) {
  for (const row of (repairEvents ?? []) as RepairCandidateEventRow[]) {
    if (row.export_id) repairByExportId.set(row.export_id, row);
  }
}

const rows = filterStandardEventRows((events ?? []) as StandardEventRowWithMeta[], {
  ...options,
  last,
});

let repair_queue_rows_matched = 0;
let standard_heuristic_rows = 0;

const summaries = rows.map((row) => {
  const repairRow = row.export_id ? repairByExportId.get(row.export_id) : undefined;
  const classification_source =
    repairRow && repair_queue_available ? "repair_queue" : "standard_heuristic";

  if (classification_source === "repair_queue") {
    repair_queue_rows_matched += 1;
  } else {
    standard_heuristic_rows += 1;
  }

  const summary = buildInternalWarningSummary({
    request_id: row.request_id,
    export_id: row.export_id,
    export_type: row.export_type,
    signalyzed_score: row.signalyzed_score,
    verdict: row.verdict,
    hard_blocker_count: row.hard_blocker_count,
    warning_count: row.warning_count,
    diagnostic_codes: row.diagnostic_codes ?? [],
    repair_queue: repairRow ?? null,
  });

  return {
    created_at: row.created_at ?? null,
    template_version: row.template_version ?? null,
    verdict: row.verdict,
    classification_source,
    repair_candidate_type: repairRow?.candidate_type ?? null,
    repair_future_action: repairRow?.recommended_future_action ?? null,
    ...toCompactInternalWarningSummary(summary),
  };
});

for (const s of summaries) {
  const ok = assertNoPiiInStandardPayload(s as unknown as Record<string, unknown>);
  if (!ok) {
    console.error("PII detected in internal review summary — aborting");
    process.exit(1);
  }
}

const labelCounts = {
  READY_INTERNAL: summaries.filter((s) => s.internal_label === "READY_INTERNAL").length,
  REVIEW_INTERNAL: summaries.filter((s) => s.internal_label === "REVIEW_INTERNAL").length,
  UNSAFE_INTERNAL: summaries.filter((s) => s.internal_label === "UNSAFE_INTERNAL").length,
};

const readiness = evaluateInternalReadiness({
  rows: (events ?? []) as StandardEventRowWithMeta[],
  sampleLimit: last,
  noPiiVerified: true,
  trueBlockerControlsPass: true,
});

const classification_source_report =
  repair_queue_rows_matched === 0
    ? "standard_heuristic"
    : standard_heuristic_rows === 0
      ? "repair_queue"
      : "mixed";

const end = new Date();
const report = {
  generated_at: end.toISOString(),
  filters: { last, ...options },
  sample_size: summaries.length,
  repair_queue_available,
  repair_queue_row_count: repairEvents?.length ?? 0,
  repair_queue_rows_matched,
  classification_source: classification_source_report,
  label_counts: labelCounts,
  readiness: {
    status: readiness.status,
    reasons: readiness.reasons,
    unsafe_rate: readiness.unsafe_rate,
    export_pass_rate: readiness.export_pass_rate,
    note: "true_blocker_controls and no_pii assumed pass when run locally; run phase3e + verify-no-pii for production gate",
  },
  exports: summaries,
};

const outDir = join(process.cwd(), "scripts", "standard", "reports");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `internal-review-${end.toISOString().slice(0, 10)}.json`);
writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log("=== SIGNALYZED STANDARD INTERNAL REVIEW ===");
console.log(`Latest ${summaries.length} exports`);
console.log(
  `Repair queue: ${repair_queue_available ? "available" : "unavailable"} · matched ${repair_queue_rows_matched}/${summaries.length} · source: ${classification_source_report}\n`,
);
console.log(
  "Label counts:",
  `READY=${labelCounts.READY_INTERNAL}`,
  `REVIEW=${labelCounts.REVIEW_INTERNAL}`,
  `UNSAFE=${labelCounts.UNSAFE_INTERNAL}`,
);
console.log(`Readiness (heuristic): ${readiness.status}`);
console.log(`Reasons: ${readiness.reasons.join("; ")}\n`);

console.log(
  "export_id".padEnd(42),
  "label".padEnd(18),
  "score",
  "verdict".padEnd(14),
  "action",
);
console.log("-".repeat(110));

for (const s of summaries.slice(0, 50)) {
  console.log(
    String(s.export_id ?? "n/a").slice(0, 40).padEnd(42),
    s.internal_label.padEnd(18),
    String(s.signalyzed_score).padEnd(5),
    String(s.verdict).padEnd(14),
    s.recommended_operator_action,
  );
  if (s.top_diagnostic_codes.length > 0) {
    console.log(`  codes: ${s.top_diagnostic_codes.join(", ")}`);
  }
  if (s.classification_source === "repair_queue" && s.repair_candidate_type) {
    console.log(`  repair: ${s.repair_candidate_type} → ${s.repair_future_action}`);
  }
}

console.log(`\nFull report: ${outPath}`);
