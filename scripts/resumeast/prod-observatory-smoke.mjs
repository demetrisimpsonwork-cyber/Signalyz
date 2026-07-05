/**
 * Production assemble + Resume AST shadow + observatory persist (5 generations).
 * Mirrors client path: assemble → shadow AST → resume_ast_shadow_events upsert.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { calibratedResumeToPlainText } from "../../supabase/functions/_shared/resumeQaEngine/shadowIntegration.ts";
import {
  runResumeAstShadow,
  runSourceResumeAstShadow,
  clearCachedSourceResumeAstShadow,
} from "../../supabase/functions/_shared/resumeAst/shadowIntegration.ts";
import {
  buildResumeAstShadowEventRow,
  persistResumeAstShadowEvent,
} from "../../supabase/functions/_shared/resumeAst/observatory/persist.ts";
import {
  DEMETRI_AI_ENGINEER_SOURCE_RESUME,
  FULL_STACK_AI_ENGINEER_JD,
  TARGET_ROLE_LABEL,
} from "../../src/test/fixtures/resumeQa/demetriAiEngineerFixtures.ts";
import {
  CUSTOMER_SUCCESS_RESUME,
  ENGINEERING_RESUME,
  MALFORMED_RESUME,
} from "../../src/test/fixtures/resumeAst/resumeAstFixtures.ts";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "../..");

function loadEnv() {
  for (const line of readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[m[1].trim()] ??= val;
  }
}

loadEnv();

const url = `${process.env.VITE_SUPABASE_URL}/functions/v1/assemble-calibrated-resume`;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const PROBE_USER_ID = process.env.SIGNALYZ_PROBE_USER_ID || "b48a51ca-9c5a-46d8-9b5b-517294631a9b";

const BLOCKED = [
  /resume_text|jd_text|original_resume|generated_resume|bullet_text/i,
  /@|\.com|github\.com|linkedin/i,
  /demetri|simpson|taylor morgan|jordan lee/i,
  /Built a production AI platform/i,
  /Managed customer escalation/i,
  /Northwind Systems/i,
];

async function getServiceRoleKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  const { execSync } = await import("node:child_process");
  const out = execSync("npx supabase projects api-keys --project-ref hzsswurcqaxrsacseknz", {
    encoding: "utf8",
    cwd: root,
  });
  const serviceRole = JSON.parse(out).keys?.find((k) => k.id === "service_role")?.api_key;
  if (!serviceRole) throw new Error("service_role key unavailable");
  return serviceRole;
}

async function getProAccessToken() {
  const serviceRole = await getServiceRoleKey();
  const admin = createClient(process.env.VITE_SUPABASE_URL, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await admin.auth.admin.getUserById(PROBE_USER_ID);
  if (userErr || !userData.user?.email) throw new Error(`probe user unavailable: ${userErr?.message}`);

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: userData.user.email,
  });
  if (linkErr) throw new Error(linkErr.message);
  const tokenHash = linkData.properties?.hashed_token;
  if (!tokenHash) throw new Error("no hashed_token");

  const anon = createClient(process.env.VITE_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: sessionData, error: otpErr } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  if (otpErr || !sessionData.session?.access_token) {
    throw new Error(`verifyOtp failed: ${otpErr?.message}`);
  }
  return sessionData.session.access_token;
}

function toResumeShape(raw) {
  return {
    header: raw.header || {},
    summary: raw.summary || "",
    core_competencies: raw.core_competencies || [],
    experience: raw.experience || [],
    independent_projects: raw.independent_projects || [],
    skills: raw.skills || [],
    certifications: raw.certifications || [],
    education: raw.education || [],
  };
}

async function assemble(name, originalResume, jd, alignmentResult, accessToken) {
  const t0 = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ originalResume, jd, alignmentResult }),
  });
  const json = await res.json();
  const ok =
    res.ok &&
    (json.status === "ok" || json.status === "success" || (json.experience && !json.error_code));
  return {
    name,
    ok,
    httpStatus: res.status,
    elapsed_ms: Date.now() - t0,
    request_id: json.request_id,
    error: json.message || json.error_code || json.error || null,
    raw: json,
  };
}

function captureAstShadow(sourceResumeText, generatedResumeText, requestId) {
  const logs = [];
  const original = console.log;
  console.log = (...args) => {
    logs.push(args.map(String).join(" "));
    original(...args);
  };

  clearCachedSourceResumeAstShadow();
  runSourceResumeAstShadow({
    enabled: true,
    sourceResumeText,
    requestId,
    runId: requestId,
  });
  const shadow = runResumeAstShadow({
    enabled: true,
    sourceResumeText,
    generatedResumeText,
    requestId,
    runId: requestId,
  });

  console.log = original;
  const line = logs.find((l) => l.includes("resume_ast_shadow_report"));
  const report = line ? JSON.parse(line) : shadow.log;
  return { shadow, report };
}

async function main() {
  const prodHtml = await fetch("https://signalyz.ai/").then((r) => r.text());
  const bundleMatch = prodHtml.match(/\/assets\/index-([A-Za-z0-9_-]+)\.js/);
  const bundle = bundleMatch ? `index-${bundleMatch[1]}.js` : "unknown";
  const js = bundleMatch
    ? await fetch(`https://signalyz.ai/assets/${bundle}`).then((r) => r.text())
    : "";
  const astFlagOn =
    js.includes('VITE_ENABLE_RESUME_AST_SHADOW:"true"') ||
    js.includes("VITE_ENABLE_RESUME_AST_SHADOW=!0") ||
    /ENABLE_RESUME_AST_SHADOW[^;]{0,20}true/i.test(js);

  console.log(
    JSON.stringify({ deploy_url: "https://signalyz.ai", bundle, ast_shadow_flag_baked: astFlagOn }, null, 2),
  );

  const serviceKey = await getServiceRoleKey();
  const serviceClient = createClient(process.env.VITE_SUPABASE_URL, serviceKey, {
    auth: { persistSession: false },
  });
  const accessToken = await getProAccessToken();

  const JD_CSM = `Customer Success Manager — own 50-75 mid-market accounts, drive retention, lead QBRs, CRM experience.`;
  const JD_ENG = `Senior Software Engineer — Go, PostgreSQL, REST APIs, CI/CD, cloud infrastructure.`;

  const cases = [
    {
      id: "ast-gen-1-demetri-ai",
      sourceResumeText: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
      jd: FULL_STACK_AI_ENGINEER_JD,
      alignmentResult: { match_score: 78, inferred_role_title: TARGET_ROLE_LABEL },
    },
    {
      id: "ast-gen-2-customer-success",
      sourceResumeText: CUSTOMER_SUCCESS_RESUME,
      jd: JD_CSM,
      alignmentResult: { match_score: 65, inferred_role_title: "Customer Success Manager" },
    },
    {
      id: "ast-gen-3-malformed-light",
      sourceResumeText: MALFORMED_RESUME,
      jd: JD_ENG,
      alignmentResult: { match_score: 40, inferred_role_title: "Software Engineer" },
    },
    {
      id: "ast-gen-4-engineering",
      sourceResumeText: ENGINEERING_RESUME,
      jd: JD_ENG,
      alignmentResult: { match_score: 72, inferred_role_title: "Senior Software Engineer" },
    },
    {
      id: "ast-gen-5-non-technical",
      sourceResumeText: CUSTOMER_SUCCESS_RESUME,
      jd: JD_CSM,
      alignmentResult: { match_score: 60, inferred_role_title: "Account Manager" },
    },
  ];

  const summaries = [];

  for (const c of cases) {
    const assembled = await assemble(c.id, c.sourceResumeText, c.jd, c.alignmentResult, accessToken);
    if (!assembled.ok) {
      summaries.push({ generation: c.id, assemble_ok: false, error: assembled.error });
      continue;
    }

    const generatedResumeText = calibratedResumeToPlainText(toResumeShape(assembled.raw));
    const { shadow, report } = captureAstShadow(
      c.sourceResumeText,
      generatedResumeText,
      assembled.request_id,
    );

    if (!report || !assembled.request_id) {
      summaries.push({ generation: c.id, assemble_ok: true, shadow_report: null });
      continue;
    }

    const row = buildResumeAstShadowEventRow(report);
    await persistResumeAstShadowEvent(serviceClient, row);

    const { data: dbRow, error } = await serviceClient
      .from("resume_ast_shadow_events")
      .select("*")
      .eq("request_id", assembled.request_id)
      .maybeSingle();

    const serialized = JSON.stringify(dbRow ?? row);
    const leaks = BLOCKED.filter((rx) => rx.test(serialized));

    summaries.push({
      generation: c.id,
      assemble_ok: true,
      request_id: assembled.request_id,
      elapsed_ms: assembled.elapsed_ms,
      ast_shadow_report: {
        event: report.event,
        source_parse_ok: report.source_parse_ok,
        generated_parse_ok: report.generated_parse_ok,
        source_sections: report.source_sections,
        generated_sections: report.generated_sections,
        source_bullets: report.source_bullets,
        generated_bullets: report.generated_bullets,
        validation_error_count: report.validation_error_count,
        round_trip_fidelity: report.round_trip_fidelity,
        bullet_preservation_score: report.bullet_preservation_score,
        keyword_preservation_score: report.keyword_preservation_score,
        fingerprint_changed: report.fingerprint_changed,
      },
      persist_ok: !error && !!dbRow,
      no_pii_stored: leaks.length === 0,
      leak_patterns: leaks.map((rx) => String(rx)),
      comparison_top_codes: shadow.comparison?.top_validation_codes ?? [],
    });
  }

  console.log("\n=== 5 Production AST shadow summaries ===");
  console.log(JSON.stringify(summaries, null, 2));

  const ok =
    summaries.length === 5 &&
    summaries.every((s) => s.assemble_ok) &&
    summaries.every((s) => s.ast_shadow_report?.event === "resume_ast_shadow_report") &&
    summaries.every((s) => s.persist_ok) &&
    summaries.every((s) => s.no_pii_stored);

  if (!ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
