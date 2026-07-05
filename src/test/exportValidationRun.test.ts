/**
 * Phase 3B export validation run — generates DOCX/PDF and validates five fixture resumes.
 * Run: npm run exportqa:validate
 */
import { describe, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildCalibratedDocxBlob } from "@/lib/exportDocx";
import { buildCalibratedPdfBlob } from "@/lib/exportPdf";
import {
  buildExportValidationContextFromModel,
  isPdfValidationAvailable,
  summarizeValidation,
  validateDocxExport,
  validatePdfExport,
} from "@/lib/exportValidation";
import { EXPORT_VALIDATION_FIXTURES } from "@/test/fixtures/exportValidation/exportValidationFixtures";

describe("export validation run (Phase 3B fixtures)", () => {
  it("validates five fixture exports and writes report", async () => {
    const pdfAvailable = isPdfValidationAvailable();
    const summaries: Array<Record<string, unknown>> = [];

    for (const fixture of EXPORT_VALIDATION_FIXTURES) {
      const docx = await buildCalibratedDocxBlob(fixture.resume);
      const docxBytes = await docx.blob.arrayBuffer();
      const ctx = buildExportValidationContextFromModel(docx.model);
      const docxResult = await validateDocxExport(docxBytes, ctx);
      const docxSummary = summarizeValidation(docxResult);

      let pdfBlock: Record<string, unknown> = { pdf_validation_available: false };
      if (pdfAvailable) {
        const pdf = await buildCalibratedPdfBlob(fixture.resume);
        const pdfBytes = await pdf.blob.arrayBuffer();
        const pdfResult = await validatePdfExport(pdfBytes, ctx);
        const pdfSummary = summarizeValidation(pdfResult);
        pdfBlock = {
          pdf_validation_available: pdfResult.pdf_validation_available,
          passed: pdfResult.passed,
          page_count: pdfResult.pageCount,
          artifact_bytes: pdfBytes.byteLength,
          render_ms: pdf.renderMs,
          warnings: pdfSummary.warningCount,
          errors: pdfSummary.errorCount,
          link_count: pdfResult.linkCount,
          error_codes: pdfResult.diagnostics.map((d) => d.code),
        };
      }

      summaries.push({
        fixture_id: fixture.id,
        label: fixture.label,
        docx: {
          passed: docxResult.passed,
          artifact_bytes: docxBytes.byteLength,
          render_ms: docx.renderMs,
          warnings: docxSummary.warningCount,
          errors: docxSummary.errorCount,
          link_count: docxResult.linkCount,
          missing_expected_link_count: docxResult.missingExpectedLinkCount,
          duplicate_link_count: docxResult.duplicateLinkCount,
          error_codes: docxResult.diagnostics.map((d) => d.code),
        },
        pdf: pdfBlock,
      });
    }

    const outDir = join(process.cwd(), "scripts", "exportqa", "reports");
    mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, `validation-run-${new Date().toISOString().slice(0, 10)}.json`);
    writeFileSync(
      outPath,
      JSON.stringify({ pdf_validation_available: pdfAvailable, summaries }, null, 2),
    );

    console.log("=== EXPORT VALIDATION RUN ===");
    console.log(`PDF validation available: ${pdfAvailable}`);
    for (const s of summaries) {
      console.log(`\n${s.label} (${s.fixture_id})`);
      const docx = s.docx as { passed: boolean; artifact_bytes: number; link_count: number };
      console.log(`  DOCX: passed=${docx.passed} bytes=${docx.artifact_bytes} links=${docx.link_count}`);
      if (pdfAvailable) {
        const pdf = s.pdf as { passed: boolean; page_count: number | null };
        console.log(`  PDF: passed=${pdf.passed} pages=${pdf.page_count}`);
      }
    }
    console.log(`\nFull report: ${outPath}`);
  });
});
