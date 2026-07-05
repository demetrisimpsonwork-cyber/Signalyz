/**
 * Production Phase 3A validation: assemble + link preservation + AST/QA shadow persist.
 * Mirrors client path after deploy.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  calibratedResumeToPlainText,
  runResumeQaShadow,
  buildSanitizedQaLog,
} from "../../supabase/functions/_shared/resumeQaEngine/shadowIntegration.ts";
import { runResumeQa } from "../../supabase/functions/_shared/resumeQaEngine/resumeQaEngine.ts";
import {
  buildResumeQaShadowEventRow,
  persistResumeQaShadowEvent,
} from "../../supabase/functions/_shared/resumeQaEngine/observatory/persist.ts";
import { extractStructuredLinks } from "../../supabase/functions/_shared/resumeAst/linkExtraction.ts";
import {
  applyLinkPreservationGuard,
  assertLinkPreservationReportSafe,
} from "../../supabase/functions/_shared/resumeAst/linkPreservation.ts";
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

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "../..");

const CUSTOMER_SUCCESS_WITH_LINKS = `
Taylor Morgan
Customer Success Manager | Chicago, IL | taylor.morgan@example.com | linkedin.com/in/taylormorgan

Professional Summary
CSM with 6+ years driving retention, QBRs, and CRM hygiene.

Experience
Customer Success Manager | Relay SaaS | 2021 – Present
- Managed 60 enterprise accounts with 94% gross retention.

Skills
Salesforce, Gainsight, QBR facilitation
`.trim();

const TECHNICAL_GITHUB_PORTFOLIO = `
Jordan Lee
Software Engineer | Seattle, WA | jordan.lee@example.com | github.com/jlee-dev | https://jordanlee.dev

Summary
Backend engineer building reliable APIs.

Experience
Senior Software Engineer | Northwind Systems | 2020 – Present
- Built REST APIs in Go and PostgreSQL.

Skills
Go, PostgreSQL, REST APIs
`.trim();

const NON_TECH_CONTACT = `
Pat Rivera
Account Manager | Denver, CO | pat.rivera@example.com | (303) 555-0198

Summary
Relationship manager for mid-market SaaS accounts.

Experience
Account Manager | Horizon Tools | 2019 – Present
- Owned renewal and expansion for 40 SMB accounts.

Skills
CRM, stakeholder management, renewals
`.trim();

const JD_CSM = `Customer Success Manager — retention, QBRs, CRM, enterprise accounts.`;
const JD_ENG = `Senior Software Engineer — Go, PostgreSQL, REST APIs, CI/CD.`;
const JD_AM = `Account Manager — renewals, CRM, mid-market SaaS.`;

const BLOCKED = [
  /resume_text|jd_text|original_resume|generated_resume|bullet_text/i,
  /@|\.com|github\.com|linkedin|phone:|mailto:|https?:\/\//i,
  /demetri|simpson|taylor\.morgan|jordan\.lee|pat\.rivera/i,
];

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

async function getServiceRoleKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  const { execSync } = await import("node:child_process");
  const out = execSync("npx supabase projects api-keys --project-ref hzsswurcqaxrsacseknz", {
    encoding: "utf8",
    cwd: root,
  });
  return JSON.parse(out).keys?.find((k) => k.id === "service_role")?.api_key;
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

  const anon = createClient(process.env.VITE_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: sessionData, error: otpErr } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: linkData.properties.hashed_token,
  });
  if (otpErr || !sessionData.session?.access_token) {
    throw new Error(`verifyOtp failed: ${otpErr?.message}`);
  }
  return sessionData.session.access_token;
}

function toResumeShape(raw) {
  return {
    header: {
      name: raw.header?.name ?? "",
      title: raw.header?.title ?? "",
      email: raw.header?.email ?? "",
      phone: raw.header?.phone ?? "",
      linkedin: raw.header?.linkedin ?? "",
      github: raw.header?.github ?? "",
      website: raw.header?.website ?? "",
      location: raw.header?.location ?? "",
    },
    summary: raw.summary || "",
    core_competencies: raw.core_competencies || [],
    experience: raw.experience || [],
    independent_projects: raw.independent_projects || [],
    skills: raw.skills || [],
    certifications: raw.certifications || [],
    education: raw.education || [],
  };
}

function countHeaderLinks(resume) {
  const h = resume.header ?? {};
  return [h.email, h.phone, h.linkedin, h.github, h.website].filter((v) => String(v || "").trim()).length;
}

function linkTypesPresent(resume) {
  const h = resume.header ?? {};
  const types = [];
  if (h.email) types.push("email");
  if (h.phone) types.push("phone");
  if (h.linkedin) types.push("linkedin");
  if (h.github) types.push("github");
  if (h.website) types.push("portfolio");
  return types;
}

async function assemble(name, originalResume, jd, alignmentResult, accessToken) {
  for (let attempt = 1; attempt <= 3; attempt++) {
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
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, attempt * 2000));
        continue;
      }
      return { name, ok: false, error: `non-json (${res.status})`, request_id: null, raw: null, elapsed_ms: Date.now() - t0 };
    }
    const ok =
      res.ok &&
      (json.status === "ok" || json.status === "success" || (json.experience && !json.error_code));
    return {
      name,
      ok,
      request_id: json.request_id,
      error: json.message || json.error_code || null,
      raw: json,
      elapsed_ms: Date.now() - t0,
    };
  }
}

async function main() {
  const prodHtml = await fetch("https://signalyz.ai/").then((r) => r.text());
  const bundleMatch = prodHtml.match(/\/assets\/index-([A-Za-z0-9_-]+)\.js/);
  const bundle = bundleMatch ? `index-${bundleMatch[1]}.js` : "unknown";
  const js = bundleMatch ? await fetch(`https://signalyz.ai/assets/${bundle}`).then((r) => r.text()) : "";

  const astFlag = /ENABLE_RESUME_AST_SHADOW[^;]{0,30}true/i.test(js);
  const qaFlag = /ENABLE_RESUME_QA_SHADOW[^;]{0,30}true/i.test(js);
  const linkGuard = /applyLinkPreservationGuard|resume_link_preservation_report/i.test(js);

  const commit = readFileSync(resolve(root, ".git/HEAD"), "utf8").includes("ref:")
    ? (await import("node:child_process")).execSync("git rev-parse --short HEAD", { cwd: root, encoding: "utf8" }).trim()
    : "unknown";

  console.log(
    JSON.stringify(
      {
        deploy_url: "https://signalyz.ai",
        bundle,
        commit,
        ast_shadow_flag: astFlag,
        qa_shadow_flag: qaFlag,
        link_preservation_baked: linkGuard,
      },
      null,
      2,
    ),
  );

  const serviceKey = await getServiceRoleKey();
  const serviceClient = createClient(process.env.VITE_SUPABASE_URL, serviceKey, {
    auth: { persistSession: false },
  });
  const accessToken = await getProAccessToken();

  const cases = [
    {
      id: "link-1-demetri-ai",
      source: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
      jd: FULL_STACK_AI_ENGINEER_JD,
      targetRole: TARGET_ROLE_LABEL,
      alignment: { match_score: 78, inferred_role_title: TARGET_ROLE_LABEL },
    },
    {
      id: "link-2-customer-success",
      source: CUSTOMER_SUCCESS_WITH_LINKS,
      jd: JD_CSM,
      targetRole: "Customer Success Manager",
      alignment: { match_score: 65, inferred_role_title: "Customer Success Manager" },
    },
    {
      id: "link-3-technical",
      source: TECHNICAL_GITHUB_PORTFOLIO,
      jd: JD_ENG,
      targetRole: "Senior Software Engineer",
      alignment: { match_score: 72, inferred_role_title: "Senior Software Engineer" },
    },
    {
      id: "link-4-non-technical",
      source: NON_TECH_CONTACT,
      jd: JD_AM,
      targetRole: "Account Manager",
      alignment: { match_score: 60, inferred_role_title: "Account Manager" },
    },
    {
      id: "link-5-dropped-links",
      source: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
      jd: FULL_STACK_AI_ENGINEER_JD,
      targetRole: TARGET_ROLE_LABEL,
      alignment: { match_score: 78, inferred_role_title: TARGET_ROLE_LABEL },
    },
  ];

  const summaries = [];
  const restoredByType = {};

  for (const c of cases) {
    await new Promise((r) => setTimeout(r, 1500));
    const assembled = await assemble(c.id, c.source, c.jd, c.alignment, accessToken);
    if (!assembled.ok) {
      summaries.push({ case: c.id, assemble_ok: false, error: assembled.error });
      continue;
    }

    const sourceLinks = extractStructuredLinks(c.source);
    let resume = toResumeShape(assembled.raw);
    const linksBefore = countHeaderLinks(resume);

    clearCachedSourceResumeAstShadow();
    runSourceResumeAstShadow({
      enabled: true,
      sourceResumeText: c.source,
      requestId: assembled.request_id,
    });

    const preserved = applyLinkPreservationGuard({
      sourceResumeText: c.source,
      resume,
      requestId: assembled.request_id,
    });
    assertLinkPreservationReportSafe(preserved.report);
    resume = preserved.resume;
    const linksAfter = countHeaderLinks(resume);

    for (const t of preserved.report.link_types_restored) {
      restoredByType[t] = (restoredByType[t] ?? 0) + 1;
    }

    const generatedText = calibratedResumeToPlainText(resume);
    const qaShadow = runResumeQaShadow({
      enabled: true,
      sourceResumeText: c.source,
      jobDescriptionText: c.jd,
      generatedResumeText: generatedText,
      targetRoleLabel: c.targetRole,
      runId: assembled.request_id,
      requestId: assembled.request_id,
    });
    const qaResult =
      qaShadow.result ??
      runResumeQa({
        sourceResumeText: c.source,
        jobDescriptionText: c.jd,
        generatedResumeText: generatedText,
        targetRoleLabel: c.targetRole,
        requestId: assembled.request_id,
      });
    const qaLog =
      qaShadow.log ??
      buildSanitizedQaLog({ targetRoleLabel: c.targetRole, requestId: assembled.request_id }, qaResult);
    if (qaLog && assembled.request_id) {
      await persistResumeQaShadowEvent(
        serviceClient,
        buildResumeQaShadowEventRow({ log: qaLog, result: qaResult, generationTimeMs: assembled.elapsed_ms }),
      );
    }

    const astShadow = runResumeAstShadow({
      enabled: true,
      sourceResumeText: c.source,
      generatedResumeText: generatedText,
      requestId: assembled.request_id,
      runId: assembled.request_id,
    });
    if (astShadow.log && assembled.request_id) {
      await persistResumeAstShadowEvent(serviceClient, buildResumeAstShadowEventRow(astShadow.log));
    }

    const { data: qaRow } = await serviceClient
      .from("resume_qa_shadow_events")
      .select("request_id")
      .eq("request_id", assembled.request_id)
      .maybeSingle();
    const { data: astRow } = await serviceClient
      .from("resume_ast_shadow_events")
      .select("request_id")
      .eq("request_id", assembled.request_id)
      .maybeSingle();

    const linkReportSerialized = JSON.stringify(preserved.report);
    const piiLeaks = BLOCKED.filter((rx) => rx.test(linkReportSerialized));

    const sourceTypes = [...new Set(sourceLinks.map((l) => l.type))];
    const afterTypes = linkTypesPresent(resume);
    const hallucinated =
      afterTypes.length > 0 &&
      sourceLinks.length === 0 &&
      preserved.report.restored_link_count === 0;

    summaries.push({
      case: c.id,
      assemble_ok: true,
      request_id: assembled.request_id,
      source_link_count: sourceLinks.length,
      source_link_types: sourceTypes,
      generated_links_before: linksBefore,
      generated_links_after: linksAfter,
      link_preservation: {
        restored_link_count: preserved.report.restored_link_count,
        link_types_restored: preserved.report.link_types_restored,
        preservation_ok: preserved.report.preservation_ok,
        duplicate_link_count: preserved.report.duplicate_link_count,
      },
      header_link_types_after: afterTypes,
      no_hallucinated_links: !hallucinated,
      no_pii_in_link_report: piiLeaks.length === 0,
      qa_shadow_persisted: !!qaRow,
      ast_shadow_persisted: !!astRow,
    });
  }

  console.log("\n=== Phase 3A production validation ===");
  console.log(JSON.stringify({ summaries, restored_by_type: restoredByType }, null, 2));

  const ok =
    linkGuard &&
    astFlag &&
    qaFlag &&
    summaries.length === 5 &&
    summaries.every((s) => s.assemble_ok) &&
    summaries.every((s) => s.no_pii_in_link_report) &&
    summaries.every((s) => s.no_hallucinated_links !== false) &&
    summaries.every((s) => s.qa_shadow_persisted && s.ast_shadow_persisted);

  if (!ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
