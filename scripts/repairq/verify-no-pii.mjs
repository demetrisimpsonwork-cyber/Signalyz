import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

function parseLimitArg(argv) {
  const limitFlag = argv.find((a) => a.startsWith("--limit="));
  if (limitFlag) {
    const n = Number.parseInt(limitFlag.split("=")[1] ?? "", 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const idx = argv.indexOf("--limit");
  if (idx >= 0) {
    const n = Number.parseInt(argv[idx + 1] ?? "", 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 20;
}

const rowLimit = parseLimitArg(process.argv.slice(2));

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[m[1].trim()] ??= v;
}

const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  JSON.parse(
    execSync("npx supabase projects api-keys --project-ref hzsswurcqaxrsacseknz", { encoding: "utf8" }),
  ).keys.find((k) => k.id === "service_role").api_key;

const sb = createClient(process.env.VITE_SUPABASE_URL, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const tables = [
  "signalyzed_repair_candidate_events",
  "signalyzed_standard_events",
  "signalyzed_repair_sandbox_events",
];
const results = [];

for (const table of tables) {
  const { data, error } = await sb.from(table).select("*").order("created_at", { ascending: false }).limit(rowLimit);
  if (error) {
    results.push({ table, error: error.message, no_pii: null });
    continue;
  }

  const PII = [
    /resume_text|jd_text|original_resume|generated_resume|bullet_text|claim_text|claim_body/i,
    /@[a-z0-9.]+\.[a-z]{2,}/i,
    /https?:\/\//i,
    /github\.com|linkedin/i,
    /\(\d{3}\)\s?\d{3}-\d{4}/,
    /demetri|taylor morgan|jordan lee|pat rivera/i,
  ];

  const serialized = JSON.stringify(data);
  const leaks = PII.filter((rx) => rx.test(serialized));
  results.push({
    table,
    rows_inspected: data.length,
    pii_patterns_matched: leaks.map((r) => r.source),
    no_pii: leaks.length === 0,
  });
}

const allOk = results.every((r) => r.no_pii !== false);
console.log(JSON.stringify({ row_limit: rowLimit, results, no_pii: allOk }, null, 2));
process.exitCode = allOk ? 0 : 1;
