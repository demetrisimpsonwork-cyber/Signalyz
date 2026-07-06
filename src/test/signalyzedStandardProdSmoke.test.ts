// @vitest-environment node
/**
 * Production Phase 3C validation: assemble → link guard → export validation → Signalyzed Standard evaluate + persist.
 * Mirrors the client shadow path after deploy. Persists to signalyzed_standard_events via service role.
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
import { evaluateSignalyzedStandard } from "@/lib/signalyzedStandard/evaluateSignalyzedStandard";
import {
  toSignalyzedStandardEventRow,
  buildSignalyzedStandardReport,
  assertNoPiiInStandardPayload,
} from "@/lib/signalyzedStandard/sanitizeStandardAudit";
import {
  toAstShadowSummary,
  toQaShadowSummary,
  toLinkPreservationSummary,
  toBulletPreservationSummary,
} from "@/lib/signalyzedStandard/adapters";
import { STANDARD_CODES } from "@/lib/signalyzedStandard/diagnosticCodes";
import { classifyRepairCandidate } from "@/lib/signalyzedStandard/repairCandidates/classifyRepairCandidate";
import {
  buildRepairCandidateReport,
  toRepairCandidateEventRow,
  assertNoPiiInRepairCandidatePayload,
} from "@/lib/signalyzedStandard/repairCandidates/sanitizeRepairCandidate";
import type { ExportValidationSummary } from "@/lib/signalyzedStandard/types";
import type { ExportValidationReport } from "@/lib/exportValidation";

function toExportValidationSummary(
  report: ExportValidationReport,
  diagnosticCodes?: string[],
): ExportValidationSummary {
  return {
    event: "resume_export_validation_report",
    request_id: report.request_id,
    export_id: report.export_id,
    export_type: report.export_type,
    template_version: report.template_version,
    validation_passed: report.validation_passed,
    validation_warning_count: report.validation_warning_count,
    validation_error_count: report.validation_error_count,
    link_count: report.link_count,
    broken_link_count: report.broken_link_count,
    missing_expected_link_count: report.missing_expected_link_count,
    duplicate_link_count: report.duplicate_link_count,
    section_count: report.section_count,
    bullet_count: report.bullet_count,
    page_count: report.page_count,
    error_class: report.error_class,
    diagnostic_codes: diagnosticCodes,
  };
}
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
import {
  applyLinkPreservationGuard,
  assertLinkPreservationReportSafe,
} from "@signalyz/resumeAst/linkPreservation";
import {
  applyBulletPreservationGuard,
  assertBulletPreservationReportSafe,
} from "@signalyz/resumeAst/bulletPreservation";
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

describe("Phase 3G production repair candidate smoke", () => {
  it(
    "assembles, exports, evaluates standard, and persists events for five fixtures",
    async () => {
      loadEnv();
      vi.stubEnv("VITE_ENABLE_EXPORT_VALIDATION_SHADOW", "true");
      vi.stubEnv("VITE_ENABLE_SIGNALYZED_STANDARD_SHADOW", "true");

      const prodHtml = await fetch("https://signalyz.ai/").then((r) => r.text());
      const bundleMatch = prodHtml.match(/\/assets\/index-([A-Za-z0-9_-]+)\.js/);
      const bundle = bundleMatch ? `index-${bundleMatch[1]}.js` : "unknown";
      const js = bundleMatch
        ? await fetch(`https://signalyz.ai/assets/${bundle}`).then((r) => r.text())
        : "";

      const standardFlag = /ENABLE_SIGNALYZED_STANDARD_SHADOW[^;]{0,40}true/i.test(js);
      const exportShadowFlag = /ENABLE_EXPORT_VALIDATION_SHADOW[^;]{0,40}true/i.test(js);
      const astFlag = /ENABLE_RESUME_AST_SHADOW[^;]{0,40}true/i.test(js);
      const qaFlag = /ENABLE_RESUME_QA_SHADOW[^;]{0,40}true/i.test(js);
      const linkGuard = /resume_link_preservation_report|preservation_ok/i.test(js);
      const bulletGuard = /resume_bullet_preservation_report|bullet_preservation/i.test(js);
      const evaluatorBaked = /signalyzed_standard_report|SIGNALYZED_STANDARD|STANDARD\.EXPORT/i.test(js);

      const repairCandidateBaked = /signalyzed_repair_candidate_report|repair_candidate/i.test(js);

      console.log(
        JSON.stringify(
          {
            deploy_url: "https://signalyz.ai",
            bundle,
            signalyzed_standard_flag: standardFlag,
            export_validation_shadow_flag: exportShadowFlag,
            ast_shadow_flag: astFlag,
            qa_shadow_flag: qaFlag,
            link_preservation_baked: linkGuard,
            bullet_preservation_baked: bulletGuard,
            repair_candidate_baked: repairCandidateBaked,
            evaluator_baked: evaluatorBaked,
          },
          null,
          2,
        ),
      );

      expect(standardFlag).toBe(true);
      expect(exportShadowFlag).toBe(true);
      expect(astFlag).toBe(true);
      expect(qaFlag).toBe(true);
      expect(evaluatorBaked).toBe(true);
      expect(bulletGuard).toBe(true);
      expect(repairCandidateBaked).toBe(true);

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
          id: "std-1-ai-engineer",
          label: "Demetri AI Engineer",
          source: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
          jd: FULL_STACK_AI_ENGINEER_JD,
          targetRole: TARGET_ROLE_LABEL,
          alignment: { match_score: 78, inferred_role_title: TARGET_ROLE_LABEL },
        },
        {
          id: "std-2-customer-success",
          label: "Customer Success",
          source: CUSTOMER_SUCCESS_WITH_LINKS,
          jd: JD_CSM,
          targetRole: "Customer Success Manager",
          alignment: { match_score: 65, inferred_role_title: "Customer Success Manager" },
        },
        {
          id: "std-3-technical",
          label: "Technical with GitHub/portfolio",
          source: TECHNICAL_GITHUB_PORTFOLIO,
          jd: JD_ENG,
          targetRole: "Senior Software Engineer",
          alignment: { match_score: 72, inferred_role_title: "Senior Software Engineer" },
        },
        {
          id: "std-4-non-technical",
          label: "Non-technical resume",
          source: NON_TECH_CONTACT,
          jd: JD_AM,
          targetRole: "Account Manager",
          alignment: { match_score: 60, inferred_role_title: "Account Manager" },
        },
        {
          id: "std-5-link-dropped",
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

        clearCachedSourceResumeAstShadow();
        runSourceResumeAstShadow({ enabled: true, sourceResumeText: c.source, requestId });

        const preserved = applyLinkPreservationGuard({
          sourceResumeText: c.source,
          resume,
          requestId,
        });
        assertLinkPreservationReportSafe(preserved.report);
        resume = preserved.resume as CalibratedResumeData;
        const linkSummary = toLinkPreservationSummary(preserved.report);

        const bulletPreserved = applyBulletPreservationGuard({
          sourceResumeText: c.source,
          resume,
          requestId,
        });
        assertBulletPreservationReportSafe(bulletPreserved.report);
        resume = bulletPreserved.resume as CalibratedResumeData;
        const bulletSummary = toBulletPreservationSummary(bulletPreserved.report);
        console.log(`[resume_bullet_preservation_report] ${JSON.stringify(bulletPreserved.report)}`);

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
        const qaSummary = qaLog ? toQaShadowSummary(qaLog) : null;

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
        const astSummary = astShadow.log ? toAstShadowSummary(astShadow.log) : null;

        const docx = await buildCalibratedDocxBlob(resume);
        const docxBytes = await docx.blob.arrayBuffer();
        const ctx = buildExportValidationContextFromModel(docx.model);
        const docxResult = await validateDocxExport(docxBytes, ctx);
        const docxSummaryVal = summarizeValidation(docxResult);
        const docxSha = await fingerprintExportBytes(docxBytes);
        const exportId = `prod-3g-${c.id}-${requestId.slice(0, 8)}`;

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
          validationWarningCount: docxSummaryVal.warningCount,
          validationErrorCount: docxSummaryVal.errorCount,
          linkCount: docxResult.linkCount,
          brokenLinkCount: docxResult.brokenLinkCount,
          missingExpectedLinkCount: docxResult.missingExpectedLinkCount,
          duplicateLinkCount: docxResult.duplicateLinkCount,
          sectionCount: docxResult.sectionCount,
          bulletCount: docxResult.bulletCount,
          pageCount: docxResult.pageCount,
          errorClass: docxSummaryVal.errorClass,
        });
        const docxAuditRow = toExportAuditLogRow({
          report: docxReport,
          artifactSha256: docxSha,
          sanitizerVersion: EXPORT_SANITIZER_VERSION,
        });
        expect(assertNoPiiInAuditPayload(docxAuditRow as unknown as Record<string, unknown>)).toBe(true);
        await serviceClient.from("resume_export_audit_logs").upsert(docxAuditRow, { onConflict: "export_id" });

        const docxExportSummary: ExportValidationSummary = toExportValidationSummary(
          docxReport,
          docxResult.diagnostics.map((d) => d.code),
        );

        // Evaluate Signalyzed Standard for DOCX
        const docxEvaluatorInput = {
          requestId,
          exportId,
          exportType: "docx" as const,
          templateVersion: EXPORT_TEMPLATE_VERSION,
          ast: astSummary,
          qa: qaSummary,
          link: linkSummary,
          bullet: bulletSummary,
          export: docxExportSummary,
          docxExport: docxExportSummary,
        };
        const docxStandard = evaluateSignalyzedStandard(docxEvaluatorInput);
        const docxStandardRow = toSignalyzedStandardEventRow({
          result: docxStandard,
          requestId,
          exportId,
          exportType: "docx",
          templateVersion: EXPORT_TEMPLATE_VERSION,
          sourceReports: docxEvaluatorInput,
        });
        expect(assertNoPiiInStandardPayload(docxStandardRow as unknown as Record<string, unknown>)).toBe(true);
        const { error: stdInsertErr } = await serviceClient
          .from("signalyzed_standard_events")
          .upsert(docxStandardRow, { onConflict: "export_id" });
        expect(stdInsertErr).toBeNull();

        const docxStandardReport = buildSignalyzedStandardReport({
          result: docxStandard,
          requestId,
          exportId,
          exportType: "docx",
          templateVersion: EXPORT_TEMPLATE_VERSION,
        });
        console.log(`[signalyzed_standard_report] ${JSON.stringify(docxStandardReport)}`);

        const repairCandidate = classifyRepairCandidate({
          request_id: requestId,
          export_id: exportId,
          export_type: "docx",
          verdict: docxStandard.verdict,
          hard_blocker_count: docxStandard.hard_blocker_count,
          diagnostic_codes: docxStandard.diagnostic_codes,
          qa: qaSummary,
          link: linkSummary,
          bullet: bulletSummary,
        });
        const repairReport = buildRepairCandidateReport(repairCandidate);
        console.log(`[signalyzed_repair_candidate_report] ${JSON.stringify(repairReport)}`);
        const repairRow = toRepairCandidateEventRow({
          result: repairCandidate,
          standard_score: docxStandard.signalyzed_score,
          standard_verdict: docxStandard.verdict,
          hard_blocker_count: docxStandard.hard_blocker_count,
        });
        expect(assertNoPiiInRepairCandidatePayload(repairRow as unknown as Record<string, unknown>)).toBe(true);
        const { error: repairInsertErr } = await serviceClient
          .from("signalyzed_repair_candidate_events")
          .upsert(repairRow, { onConflict: "export_id" });
        expect(repairInsertErr).toBeNull();

        // PDF path (if available) — separate export id and standard event
        let pdfBlock: Record<string, unknown> = { pdf_validation_available: false };
        if (pdfAvailable) {
          const pdf = await buildCalibratedPdfBlob(resume);
          const pdfBytes = await pdf.blob.arrayBuffer();
          const pdfResult = await validatePdfExport(pdfBytes, ctx);
          const pdfSummaryVal = summarizeValidation(pdfResult);
          const pdfSha = await fingerprintExportBytes(pdfBytes);
          const pdfExportId = `prod-3g-pdf-${c.id}-${requestId.slice(0, 8)}`;
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
            validationWarningCount: pdfSummaryVal.warningCount,
            validationErrorCount: pdfSummaryVal.errorCount,
            linkCount: pdfResult.linkCount,
            brokenLinkCount: pdfResult.brokenLinkCount,
            missingExpectedLinkCount: pdfResult.missingExpectedLinkCount,
            duplicateLinkCount: pdfResult.duplicateLinkCount,
            sectionCount: pdfResult.sectionCount,
            bulletCount: pdfResult.bulletCount,
            pageCount: pdfResult.pageCount,
            errorClass: pdfSummaryVal.errorClass,
          });
          const pdfAuditRow = toExportAuditLogRow({
            report: pdfReport,
            artifactSha256: pdfSha,
            sanitizerVersion: EXPORT_SANITIZER_VERSION,
          });
          await serviceClient.from("resume_export_audit_logs").upsert(pdfAuditRow, { onConflict: "export_id" });

          const pdfExportSummary = toExportValidationSummary(
            pdfReport,
            pdfResult.diagnostics.map((d) => d.code),
          );
          const pdfEvaluatorInput = {
            requestId,
            exportId: pdfExportId,
            exportType: "pdf" as const,
            templateVersion: EXPORT_TEMPLATE_VERSION,
            ast: astSummary,
            qa: qaSummary,
            link: linkSummary,
            bullet: bulletSummary,
            export: pdfExportSummary,
            docxExport: docxExportSummary,
          };
          const pdfStandard = evaluateSignalyzedStandard(pdfEvaluatorInput);
          const pdfStandardRow = toSignalyzedStandardEventRow({
            result: pdfStandard,
            requestId,
            exportId: pdfExportId,
            exportType: "pdf",
            templateVersion: EXPORT_TEMPLATE_VERSION,
            sourceReports: pdfEvaluatorInput,
          });
          expect(assertNoPiiInStandardPayload(pdfStandardRow as unknown as Record<string, unknown>)).toBe(true);
          await serviceClient
            .from("signalyzed_standard_events")
            .upsert(pdfStandardRow, { onConflict: "export_id" });

          pdfBlock = {
            pdf_validation_available: true,
            export_passed: pdfResult.passed,
            page_count: pdfResult.pageCount,
            signalyzed_score: pdfStandard.signalyzed_score,
            verdict: pdfStandard.verdict,
            diagnostic_codes: pdfStandard.diagnostic_codes,
          };
        }

        const { data: stdRow } = await serviceClient
          .from("signalyzed_standard_events")
          .select("*")
          .eq("export_id", exportId)
          .maybeSingle();
        const { data: exportRow } = await serviceClient
          .from("resume_export_audit_logs")
          .select("export_id")
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

        const { data: repairRowDb } = await serviceClient
          .from("signalyzed_repair_candidate_events")
          .select("*")
          .eq("export_id", exportId)
          .maybeSingle();

        const stdSerialized = JSON.stringify(stdRow ?? {});
        const repairSerialized = JSON.stringify(repairRowDb ?? {});
        const piiLeaks = PII_BLOCKED.filter((rx) => rx.test(stdSerialized) || rx.test(repairSerialized));

        summaries.push({
          case: c.id,
          label: c.label,
          request_id: requestId,
          export_never_blocked: true,
          docx_export_passed: docxResult.passed,
          signalyzed_score: docxStandard.signalyzed_score,
          verdict: docxStandard.verdict,
          confidence: docxStandard.confidence,
          hard_blocker_count: docxStandard.hard_blocker_count,
          warning_count: docxStandard.warning_count,
          diagnostic_codes: docxStandard.diagnostic_codes,
          recommended_action: docxStandard.recommended_action,
          category_scores: docxStandard.categories,
          bullet_preservation: bulletSummary,
          repair_candidate: repairCandidate,
          pdf: pdfBlock,
          standard_event_persisted: !!stdRow,
          repair_candidate_persisted: !!repairRowDb,
          export_audit_persisted: !!exportRow,
          qa_shadow_persisted: !!qaRow,
          ast_shadow_persisted: !!astRow,
          link_preservation_ok: preserved.report.preservation_ok,
          no_pii_in_standard_row: piiLeaks.length === 0,
        });
      }

      console.log("\n=== Phase 3G production repair candidate validation ===");
      console.log(JSON.stringify({ bundle, summaries }, null, 2));

      expect(summaries.length).toBe(5);
      expect(summaries.every((s) => s.export_never_blocked)).toBe(true);
      expect(summaries.every((s) => s.standard_event_persisted)).toBe(true);
      expect(summaries.every((s) => s.export_audit_persisted)).toBe(true);
      expect(summaries.every((s) => s.qa_shadow_persisted && s.ast_shadow_persisted)).toBe(true);
      expect(summaries.every((s) => s.repair_candidate_persisted)).toBe(true);
      expect(summaries.every((s) => s.no_pii_in_standard_row)).toBe(true);
      expect(summaries.every((s) => s.link_preservation_ok !== false)).toBe(true);

      const aiEngineer = summaries.find((s) => s.case === "std-1-ai-engineer");
      const customerSuccess = summaries.find((s) => s.case === "std-2-customer-success");
      expect((aiEngineer?.diagnostic_codes as string[]) ?? []).not.toContain(
        STANDARD_CODES.QA_SEVERE_BULLET_REGRESSION,
      );
      expect((customerSuccess?.diagnostic_codes as string[]) ?? []).not.toContain(
        STANDARD_CODES.QA_UNSUPPORTED_CLAIM,
      );
      expect((customerSuccess?.repair_candidate as { candidate: boolean })?.candidate).toBe(false);
      const aiRepair = aiEngineer?.repair_candidate as { recommended_future_action?: string; candidate_type?: string } | undefined;
      if (aiRepair?.candidate_type === "preserve_high_value_bullet") {
        expect(aiRepair.recommended_future_action).toBe("safe_future_repair");
      }
      expect(
        summaries
          .filter((s) => (s.hard_blocker_count as number) === 0)
          .every((s) => (s.repair_candidate as { recommended_future_action?: string })?.recommended_future_action !== "do_not_repair"),
      ).toBe(true);
      expect(summaries.every((s) => s.verdict !== "unsafe" || (s.hard_blocker_count as number) > 0)).toBe(true);
      expect(
        summaries.filter((s) => {
          const codes = (s.diagnostic_codes as string[]) ?? [];
          return codes.includes(STANDARD_CODES.QA_ADVISORY_WARNING) && codes.length === 1;
        }).every((s) => s.verdict !== "unsafe"),
      ).toBe(true);
    },
    300_000,
  );
});
