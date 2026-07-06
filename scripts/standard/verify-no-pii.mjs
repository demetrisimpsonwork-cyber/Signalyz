import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

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
const { data, error } = await sb
  .from("signalyzed_standard_events")
  .select("*")
  .order("created_at", { ascending: false })
  .limit(20);
if (error) throw error;

const columns = data.length ? Object.keys(data[0]) : [];
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

console.log(
  JSON.stringify(
    {
      rows_inspected: data.length,
      columns,
      verdicts: data.map((r) => r.verdict),
      scores: data.map((r) => r.signalyzed_score),
      export_types: [...new Set(data.map((r) => r.export_type))],
      pii_patterns_matched: leaks.map((r) => r.source),
      no_pii: leaks.length === 0,
    },
    null,
    2,
  ),
);

// Let Node drain client handles on Windows instead of forcing process.exit().
process.exitCode = leaks.length === 0 ? 0 : 1;
