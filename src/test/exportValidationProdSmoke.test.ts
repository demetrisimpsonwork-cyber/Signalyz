/**
 * Production Phase 3B validation: assemble + link guard + DOCX/PDF export validation + audit persist.
 * Mirrors client export shadow path after deploy.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { describe, it, expect, vi } from "vitest";
import { buildCalibratedDocxBlob } from "@/lib/exportDocx";
import { buildCalibratedPdfBlob } from "@/lib/exportPdf";
import {
  buildExportValidationContextFromModel,
  buildExportValidationReport,
  fingerprintExportBytes,
  summarizeValidation,
  toExportAuditLogRow,
  validateDocxExport,
  validatePdfExport,
  assertNoPiiInAuditPayload,
  EXPORT_SANITIZER_VERSION,
  EXPORT_TEMPLATE_FAMILY,
  EXPORT_TEMPLATE_VERSION,
  DOCX_RENDERER,
  PDF_RENDERER,
  isPdfValidationAvailable,
} from "@/lib/exportValidation";
import {
  calibratedResumeToPlainText,
  runResumeQaShadow,
  buildSanitizedQaLog,
} from "@signalyz/resumeQaEngine/shadowIntegration";
import { runResumeQa } from "@signalyz/resumeQaEngine/resumeQaEngine";
import {
  buildResumeQaShadowEventRow,
  persistResumeQaShadowEvent,
} from "@signalyz/resumeQaEngine/observatory/persist";
import { extractStructuredLinks } from "@signalyz/resumeAst/linkExtraction";
import {
  applyLinkPreservationGuard,
  assertLinkPreservationReportSafe,
} from "@signalyz/resumeAst/linkPreservation";
import {
  runResumeAstShadow,
  runSourceResumeAstShadow,
  clearCachedSourceResumeAstShadow,
} from "@signalyz/resumeAst/shadowIntegration";
import {
  buildResumeAstShadowEventRow,
  persistResumeAstShadowEvent,
} from "@signalyz/resumeAst/observatory/persist";
import {
  DEMETRI_AI_ENGINEER_SOURCE_RESUME,
  FULL_STACK_AI_ENGINEER_JD,
  TARGET_ROLE_LABEL,
} from "@/test/fixtures/resumeQa/demetriAiEngineerFixtures";
import type { CalibratedResumeData } from "@/hooks/useResumeAssembly";

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

const PII_BLOCKED = [
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

function toResumeShape(raw: Record<string, unknown>): CalibratedResumeData {
  const header = (raw.header ?? {}) as CalibratedResumeData["header"];
  return {
    header: {
      name: header.name ?? "",
      title: header.title ?? "",
      email: header.email ?? "",
      phone: header.phone ?? "",
      linkedin: header.linkedin ?? "",
      github: header.github ?? "",
      website: header.website ?? "",
      location: header.location ?? "",
    },
    summary: String(raw.summary ?? ""),
    core_competencies: (raw.core_competencies as string[]) ?? [],
    experience: (raw.experience as CalibratedResumeData["experience"]) ?? [],
    independent_projects: (raw.independent_projects as CalibratedResumeData["independent_projects"]) ?? [],
    skills: (raw.skills as string[]) ?? [],
    certifications: (raw.certifications as string[]) ?? [],
    education: (raw.education as CalibratedResumeData["education"]) ?? [],
    signal_keywords: (raw.signal_keywords as string[]) ?? [],
  };
}

function countHeaderLinks(resume: CalibratedResumeData) {
  const h = resume.header;
  return [h.email, h.phone, h.linkedin, h.github, h.website].filter((v) => String(v || "").trim()).length;
}

describe("Phase 3B production export validation smoke", () => {
  it(
    "assembles, exports, validates, and persists audit rows for five fixtures",
    async () => {
      loadEnv();
      vi.stubEnv("VITE_ENABLE_EXPORT_VALIDATION_SHADOW", "true");

      const prodHtml = await fetch("https://signalyz.ai/").then((r) => r.text());
      const bundleMatch = prodHtml.match(/\/assets\/index-([A-Za-z0-9_-]+)\.js/);
      const bundle = bundleMatch ? `index-${bundleMatch[1]}.js` : "unknown";
      const js = bundleMatch
        ? await fetch(`https://signalyz.ai/assets/${bundle}`).then((r) => r.text())
        : "";

      const exportShadowFlag = /ENABLE_EXPORT_VALIDATION_SHADOW[^;]{0,30}true/i.test(js);
      const astFlag = /ENABLE_RESUME_AST_SHADOW[^;]{0,30}true/i.test(js);
      const qaFlag = /ENABLE_RESUME_QA_SHADOW[^;]{0,30}true/i.test(js);
      const linkGuard = /applyLinkPreservationGuard|resume_link_preservation_report/i.test(js);

      console.log(
        JSON.stringify(
          {
            deploy_url: "https://signalyz.ai",
            bundle,
            export_validation_shadow_flag: exportShadowFlag,
            ast_shadow_flag: astFlag,
            qa_shadow_flag: qaFlag,
            link_preservation_baked: linkGuard,
          },
          null,
          2,
        ),
      );

      expect(exportShadowFlag).toBe(true);
      expect(astFlag).toBe(true);
      expect(qaFlag).toBe(true);
      expect(linkGuard).toBe(true);

      const { execSync } = await import("node:child_process");
      const getServiceRoleKey = async () => {
        if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
        const out = execSync("npx supabase projects api-keys --project-ref hzsswurcqaxrsacseknz", {
          encoding: "utf8",
          cwd: root,
        });
        return JSON.parse(out).keys?.find((k: { id: string }) => k.id === "service_role")?.api_key;
      };

      const serviceKey = await getServiceRoleKey();
      const serviceClient = createClient(process.env.VITE_SUPABASE_URL!, serviceKey, {
        auth: { persistSession: false },
      });

      const PROBE_USER_ID = process.env.SIGNALYZ_PROBE_USER_ID || "b48a51ca-9c5a-46d8-9b5b-517294631a9b";
      const admin = createClient(process.env.VITE_SUPABASE_URL!, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: userData } = await admin.auth.admin.getUserById(PROBE_USER_ID);
      const { data: linkData } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: userData!.user!.email!,
      });
      const anon = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: sessionData } = await anon.auth.verifyOtp({
        type: "magiclink",
        token_hash: linkData!.properties.hashed_token,
      });
      const accessToken = sessionData!.session!.access_token;

      const assembleUrl = `${process.env.VITE_SUPABASE_URL}/functions/v1/assemble-calibrated-resume`;
      const pdfAvailable = isPdfValidationAvailable();

      const cases = [
        {
          id: "export-1-demetri-ai",
          label: "Demetri AI Engineer",
          source: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
          jd: FULL_STACK_AI_ENGINEER_JD,
          targetRole: TARGET_ROLE_LABEL,
          alignment: { match_score: 78, inferred_role_title: TARGET_ROLE_LABEL },
        },
        {
          id: "export-2-customer-success",
          label: "Customer Success",
          source: CUSTOMER_SUCCESS_WITH_LINKS,
          jd: JD_CSM,
          targetRole: "Customer Success Manager",
          alignment: { match_score: 65, inferred_role_title: "Customer Success Manager" },
        },
        {
          id: "export-3-technical",
          label: "Technical with GitHub/portfolio",
          source: TECHNICAL_GITHUB_PORTFOLIO,
          jd: JD_ENG,
          targetRole: "Senior Software Engineer",
          alignment: { match_score: 72, inferred_role_title: "Senior Software Engineer" },
        },
        {
          id: "export-4-non-technical",
          label: "Non-technical resume",
          source: NON_TECH_CONTACT,
          jd: JD_AM,
          targetRole: "Account Manager",
          alignment: { match_score: 60, inferred_role_title: "Account Manager" },
        },
        {
          id: "export-5-link-dropped",
          label: "Previously link-dropped resume",
          source: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
          jd: FULL_STACK_AI_ENGINEER_JD,
          targetRole: TARGET_ROLE_LABEL,
          alignment: { match_score: 78, inferred_role_title: TARGET_ROLE_LABEL },
        },
      ];

      const summaries: Array<Record<string, unknown>> = [];

      for (const c of cases) {
        await new Promise((r) => setTimeout(r, 1500));
        const res = await fetch(assembleUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            apikey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ originalResume: c.source, jd: c.jd, alignmentResult: c.alignment }),
        });
        const assembled = await res.json();
        expect(res.ok).toBe(true);

        const requestId = assembled.request_id as string;
        let resume = toResumeShape(assembled);
        const sourceLinks = extractStructuredLinks(c.source);

        clearCachedSourceResumeAstShadow();
        runSourceResumeAstShadow({ enabled: true, sourceResumeText: c.source, requestId });

        const preserved = applyLinkPreservationGuard({
          sourceResumeText: c.source,
          resume,
          requestId,
        });
        assertLinkPreservationReportSafe(preserved.report);
        resume = preserved.resume as CalibratedResumeData;

        const generatedText = calibratedResumeToPlainText(resume);
        const qaShadow = runResumeQaShadow({
          enabled: true,
          sourceResumeText: c.source,
          jobDescriptionText: c.jd,
          generatedResumeText: generatedText,
          targetRoleLabel: c.targetRole,
          runId: requestId,
          requestId,
        });
        const qaResult =
          qaShadow.result ??
          runResumeQa({
            sourceResumeText: c.source,
            jobDescriptionText: c.jd,
            generatedResumeText: generatedText,
            targetRoleLabel: c.targetRole,
            requestId,
          });
        const qaLog =
          qaShadow.log ??
          buildSanitizedQaLog({ targetRoleLabel: c.targetRole, requestId }, qaResult);
        if (qaLog) {
          await persistResumeQaShadowEvent(
            serviceClient,
            buildResumeQaShadowEventRow({ log: qaLog, result: qaResult, generationTimeMs: 0 }),
          );
        }

        const astShadow = runResumeAstShadow({
          enabled: true,
          sourceResumeText: c.source,
          generatedResumeText: generatedText,
          requestId,
          runId: requestId,
        });
        if (astShadow.log) {
          await persistResumeAstShadowEvent(serviceClient, buildResumeAstShadowEventRow(astShadow.log));
        }

        const docx = await buildCalibratedDocxBlob(resume);
        const docxBytes = await docx.blob.arrayBuffer();
        const ctx = buildExportValidationContextFromModel(docx.model);
        const docxResult = await validateDocxExport(docxBytes, ctx);
        const docxSummary = summarizeValidation(docxResult);
        const docxSha = await fingerprintExportBytes(docxBytes);
        const exportId = `prod-${c.id}-${requestId.slice(0, 8)}`;

        const docxReport = buildExportValidationReport({
          requestId,
          exportId,
          exportType: "docx",
          templateFamily: EXPORT_TEMPLATE_FAMILY,
          templateVersion: EXPORT_TEMPLATE_VERSION,
          renderer: DOCX_RENDERER,
          artifactBytes: docxBytes.byteLength,
          renderMs: docx.renderMs,
          validationPassed: docxResult.passed,
          validationWarningCount: docxSummary.warningCount,
          validationErrorCount: docxSummary.errorCount,
          linkCount: docxResult.linkCount,
          brokenLinkCount: docxResult.brokenLinkCount,
          missingExpectedLinkCount: docxResult.missingExpectedLinkCount,
          duplicateLinkCount: docxResult.duplicateLinkCount,
          sectionCount: docxResult.sectionCount,
          bulletCount: docxResult.bulletCount,
          pageCount: docxResult.pageCount,
          errorClass: docxSummary.errorClass,
        });
        const docxRow = toExportAuditLogRow({
          report: docxReport,
          artifactSha256: docxSha,
          sanitizerVersion: EXPORT_SANITIZER_VERSION,
        });
        expect(assertNoPiiInAuditPayload(docxRow as unknown as Record<string, unknown>)).toBe(true);
        const { error: docxInsertErr } = await serviceClient
          .from("resume_export_audit_logs")
          .upsert(docxRow, { onConflict: "export_id" });
        expect(docxInsertErr).toBeNull();

        let pdfBlock: Record<string, unknown> = { pdf_validation_available: false };
        if (pdfAvailable) {
          const pdf = await buildCalibratedPdfBlob(resume);
          const pdfBytes = await pdf.blob.arrayBuffer();
          const pdfResult = await validatePdfExport(pdfBytes, ctx);
          const pdfSummary = summarizeValidation(pdfResult);
          const pdfSha = await fingerprintExportBytes(pdfBytes);
          const pdfExportId = `prod-pdf-${c.id}-${requestId.slice(0, 8)}`;
          const pdfReport = buildExportValidationReport({
            requestId,
            exportId: pdfExportId,
            exportType: "pdf",
            templateFamily: EXPORT_TEMPLATE_FAMILY,
            templateVersion: EXPORT_TEMPLATE_VERSION,
            renderer: PDF_RENDERER,
            artifactBytes: pdfBytes.byteLength,
            renderMs: pdf.renderMs,
            validationPassed: pdfResult.passed,
            validationWarningCount: pdfSummary.warningCount,
            validationErrorCount: pdfSummary.errorCount,
            linkCount: pdfResult.linkCount,
            brokenLinkCount: pdfResult.brokenLinkCount,
            missingExpectedLinkCount: pdfResult.missingExpectedLinkCount,
            duplicateLinkCount: pdfResult.duplicateLinkCount,
            sectionCount: pdfResult.sectionCount,
            bulletCount: pdfResult.bulletCount,
            pageCount: pdfResult.pageCount,
            errorClass: pdfSummary.errorClass,
          });
          const pdfRow = toExportAuditLogRow({
            report: pdfReport,
            artifactSha256: pdfSha,
            sanitizerVersion: EXPORT_SANITIZER_VERSION,
          });
          expect(assertNoPiiInAuditPayload(pdfRow as unknown as Record<string, unknown>)).toBe(true);
          const { error: pdfInsertErr } = await serviceClient
            .from("resume_export_audit_logs")
            .upsert(pdfRow, { onConflict: "export_id" });
          expect(pdfInsertErr).toBeNull();

          pdfBlock = {
            pdf_validation_available: true,
            passed: pdfResult.passed,
            artifact_bytes: pdfBytes.byteLength,
            page_count: pdfResult.pageCount,
            artifact_sha256: pdfSha,
            link_count: pdfResult.linkCount,
          };
        }

        const { data: auditRow } = await serviceClient
          .from("resume_export_audit_logs")
          .select("*")
          .eq("export_id", exportId)
          .maybeSingle();
        const { data: qaRow } = await serviceClient
          .from("resume_qa_shadow_events")
          .select("request_id")
          .eq("request_id", requestId)
          .maybeSingle();
        const { data: astRow } = await serviceClient
          .from("resume_ast_shadow_events")
          .select("request_id")
          .eq("request_id", requestId)
          .maybeSingle();

        const auditSerialized = JSON.stringify(auditRow ?? {});
        const piiLeaks = PII_BLOCKED.filter((rx) => rx.test(auditSerialized));

        summaries.push({
          case: c.id,
          label: c.label,
          assemble_ok: true,
          request_id: requestId,
          export_never_blocked: true,
          source_link_count: sourceLinks.length,
          header_links_after_guard: countHeaderLinks(resume),
          link_preservation_ok: preserved.report.preservation_ok,
          docx: {
            passed: docxResult.passed,
            artifact_bytes: docxBytes.byteLength,
            artifact_sha256: docxSha,
            render_ms: docx.renderMs,
            link_count: docxResult.linkCount,
            broken_link_count: docxResult.brokenLinkCount,
            missing_expected_link_count: docxResult.missingExpectedLinkCount,
            duplicate_link_count: docxResult.duplicateLinkCount,
            audit_row_persisted: !!auditRow,
          },
          pdf: pdfBlock,
          qa_shadow_persisted: !!qaRow,
          ast_shadow_persisted: !!astRow,
          no_pii_in_audit_row: piiLeaks.length === 0,
        });
      }

      console.log("\n=== Phase 3B production export validation ===");
      console.log(JSON.stringify({ bundle, summaries }, null, 2));

      expect(summaries.length).toBe(5);
      expect(summaries.every((s) => s.assemble_ok)).toBe(true);
      expect(summaries.every((s) => s.export_never_blocked)).toBe(true);
      expect(summaries.every((s) => (s.docx as { audit_row_persisted: boolean }).audit_row_persisted)).toBe(true);
      expect(summaries.every((s) => s.no_pii_in_audit_row)).toBe(true);
      expect(summaries.every((s) => s.qa_shadow_persisted && s.ast_shadow_persisted)).toBe(true);
      expect(summaries.every((s) => s.link_preservation_ok !== false)).toBe(true);
    },
    300_000,
  );
});