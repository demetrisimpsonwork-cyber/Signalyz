/**
 * Export user_feedback rows to CSV (admin / service role).
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/export-user-feedback.mjs
 *   node scripts/export-user-feedback.mjs --limit 1000 --out feedback.csv
 */

import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const limitIdx = args.indexOf("--limit");
const outIdx = args.indexOf("--out");
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : 1000;
const outPath = outIdx >= 0 ? args[outIdx + 1] : null;

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const { data, error } = await supabase
  .from("user_feedback")
  .select("*")
  .order("created_at", { ascending: false })
  .limit(Number.isFinite(limit) && limit > 0 ? limit : 1000);

if (error) {
  console.error("Query failed:", error.message);
  process.exit(1);
}

const rows = data ?? [];
const headers = [
  "id",
  "created_at",
  "source",
  "useful",
  "applied_with_resume",
  "outcome",
  "comment",
  "request_id",
  "report_run_fingerprint",
  "pipeline_version",
  "plan_tier",
  "session_id",
  "user_id",
];

function escapeCsv(value) {
  if (value == null) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

const csv = [
  headers.join(","),
  ...rows.map((row) => headers.map((h) => escapeCsv(row[h])).join(",")),
].join("\n");

if (outPath) {
  writeFileSync(outPath, csv, "utf8");
  console.log(`Wrote ${rows.length} rows to ${outPath}`);
} else {
  console.log(csv);
}
