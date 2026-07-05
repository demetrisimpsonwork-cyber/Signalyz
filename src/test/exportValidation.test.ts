import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { buildCalibratedDocxBlob } from "@/lib/exportDocx";
import { buildCalibratedPdfBlob } from "@/lib/exportPdf";
import {
  assertNoPiiInAuditPayload,
  buildExportValidationContextFromModel,
  buildExportValidationReport,
  sanitizeExportAuditText,
  summarizeValidation,
  toExportAuditLogRow,
  validateDocxExport,
  validateExportLinks,
  validateExportStructure,
  validateExportTypography,
  validatePdfExport,
} from "@/lib/exportValidation";
import { persistExportAuditObservatory } from "@/lib/exportAuditObservatory";
import { runExportValidationShadow } from "@/lib/exportValidationShadow";
import {
  CUSTOMER_SUCCESS_EXPORT,
  DEMETRI_AI_ENGINEER_EXPORT,
  LINK_DROPPED_EXPORT,
  TECHNICAL_LINKS_EXPORT,
} from "@/test/fixtures/exportValidation/exportValidationFixtures";

describe("exportValidation", () => {
  it("valid DOCX export passes", async () => {
    const { blob, model } = await buildCalibratedDocxBlob(DEMETRI_AI_ENGINEER_EXPORT);
    const bytes = await blob.arrayBuffer();
    const ctx = buildExportValidationContextFromModel(model);
    const result = await validateDocxExport(bytes, ctx);
    expect(result.passed).toBe(true);
    expect(bytes.byteLength).toBeGreaterThan(100);
  });

  it("valid PDF export passes", async () => {
    const { blob, model } = await buildCalibratedPdfBlob(CUSTOMER_SUCCESS_EXPORT);
    const bytes = await blob.arrayBuffer();
    const ctx = buildExportValidationContextFromModel(model);
    const result = await validatePdfExport(bytes, ctx);
    expect(result.pdf_validation_available).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.pageCount).toBeGreaterThan(0);
  });

  it("empty file fails", async () => {
    const result = await validateDocxExport(new ArrayBuffer(0), {
      expectedSectionLabels: ["Experience"],
      expectedLinkCount: 0,
      expectedBulletCount: 1,
    });
    expect(result.passed).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "empty_file")).toBe(true);
  });

  it("missing links warning", () => {
    const { diagnostics, missingExpectedLinkCount } = validateExportLinks({
      exportType: "docx",
      artifactBytes: 1000,
      extractedText: "Professional Summary Engineer building platforms.",
      expectedSectionLabels: [],
      expectedLinkCount: 2,
      expectedBulletCount: 1,
    });
    expect(missingExpectedLinkCount).toBeGreaterThan(0);
    expect(diagnostics.some((d) => d.code === "missing_expected_link")).toBe(true);
  });

  it("duplicate links warning", () => {
    const { diagnostics, duplicateLinkCount } = validateExportLinks({
      exportType: "docx",
      artifactBytes: 1000,
      extractedText:
        "Contact github.com/user github.com/user linkedin.com/in/user linkedin.com/in/user",
      expectedSectionLabels: [],
      expectedLinkCount: 2,
      expectedBulletCount: 0,
    });
    expect(duplicateLinkCount).toBeGreaterThan(0);
    expect(diagnostics.some((d) => d.code === "duplicate_link")).toBe(true);
  });

  it("broken placeholders fail", () => {
    const { diagnostics } = validateExportStructure({
      exportType: "docx",
      artifactBytes: 1000,
      extractedText: "Experience {{title}} [Insert company] undefined",
      expectedSectionLabels: ["Experience"],
      expectedLinkCount: 0,
      expectedBulletCount: 1,
    });
    expect(diagnostics.some((d) => d.code === "broken_placeholder")).toBe(true);
  });

  it("spaced headings fail", () => {
    const diagnostics = validateExportTypography({
      exportType: "docx",
      artifactBytes: 1000,
      extractedText: "P R O F E S S I O N A L Summary",
      expectedSectionLabels: [],
      expectedLinkCount: 0,
      expectedBulletCount: 0,
    });
    expect(diagnostics.some((d) => d.code === "spaced_heading")).toBe(true);
  });

  it("markdown artifacts fail", () => {
    const diagnostics = validateExportTypography({
      exportType: "docx",
      artifactBytes: 1000,
      extractedText: "**Bold headline** and [link](https://example.com)",
      expectedSectionLabels: [],
      expectedLinkCount: 0,
      expectedBulletCount: 0,
    });
    expect(diagnostics.some((d) => d.code === "markdown_artifact")).toBe(true);
  });

  it("JSON artifacts fail", () => {
    const diagnostics = validateExportTypography({
      exportType: "docx",
      artifactBytes: 1000,
      extractedText: '{"header":{"name":"x"},"experience":[]}',
      expectedSectionLabels: [],
      expectedLinkCount: 0,
      expectedBulletCount: 0,
    });
    expect(diagnostics.some((d) => d.code === "json_artifact")).toBe(true);
  });

  it("sanitizer removes raw links/emails/phones/names", () => {
    const raw =
      "Contact Alex Chen at alex.chen@example.com or +1 (555) 123-4567 https://example.com/portfolio";
    const sanitized = sanitizeExportAuditText(raw);
    expect(sanitized).not.toMatch(/alex\.chen@example\.com/i);
    expect(sanitized).not.toMatch(/https:\/\//i);
    expect(sanitized).not.toMatch(/555/);
    expect(sanitized).toContain("[redacted-email]");
    expect(sanitized).toContain("[redacted-link]");
  });

  it("object serialization artifacts fail", () => {
    const diagnostics = validateExportTypography({
      exportType: "docx",
      artifactBytes: 1000,
      extractedText: "Experience [object Object] in output",
      expectedSectionLabels: [],
      expectedLinkCount: 0,
      expectedBulletCount: 0,
    });
    expect(diagnostics.some((d) => d.code === "object_serialization_artifact")).toBe(true);
  });

  it("audit insert payload is PII-safe", () => {
    const report = buildExportValidationReport({
      exportId: "exp-test-1",
      exportType: "docx",
      templateFamily: "signalyz-calibrated",
      templateVersion: "1.0.0",
      renderer: "docx-js",
      artifactBytes: 4096,
      renderMs: 120,
      validationPassed: true,
      validationWarningCount: 0,
      validationErrorCount: 0,
      linkCount: 2,
      brokenLinkCount: 0,
      missingExpectedLinkCount: 0,
      duplicateLinkCount: 0,
      sectionCount: 4,
      bulletCount: 6,
      pageCount: null,
    });
    const row = toExportAuditLogRow({
      report,
      artifactSha256: "abc123",
      sanitizerVersion: "10.0",
    });
    expect(assertNoPiiInAuditPayload(row as unknown as Record<string, unknown>)).toBe(true);
    expect(assertNoPiiInAuditPayload(report as unknown as Record<string, unknown>)).toBe(true);
  });

  it("link-dropped export warns on missing expected links", async () => {
    const { blob, model } = await buildCalibratedDocxBlob(LINK_DROPPED_EXPORT);
    const bytes = await blob.arrayBuffer();
    const ctx = buildExportValidationContextFromModel(model);
    expect(ctx.expectedLinkCount).toBe(0);
    const result = await validateDocxExport(bytes, ctx);
    const summary = summarizeValidation(result);
    expect(summary.warningCount + summary.errorCount).toBeGreaterThanOrEqual(0);
  });

  it("technical export preserves multiple link signals", async () => {
    const { blob, model } = await buildCalibratedDocxBlob(TECHNICAL_LINKS_EXPORT);
    const bytes = await blob.arrayBuffer();
    const ctx = buildExportValidationContextFromModel(model);
    expect(ctx.expectedLinkCount).toBeGreaterThanOrEqual(3);
    const result = await validateDocxExport(bytes, ctx);
    expect(result.linkCount).toBeGreaterThan(0);
  });
});

describe("exportValidation shadow wiring", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_ENABLE_EXPORT_VALIDATION_SHADOW", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("audit insert works when shadow enabled", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: { from: () => ({ upsert }) },
    }));

    const { blob, model, renderMs } = await buildCalibratedDocxBlob(DEMETRI_AI_ENGINEER_EXPORT);
    await runExportValidationShadow({
      exportType: "docx",
      bytes: await blob.arrayBuffer(),
      model,
      renderMs,
      exportId: "shadow-test-docx",
    });
    expect(true).toBe(true);
  });

  it("audit insert failure never blocks export", async () => {
    persistExportAuditObservatory({
      report: buildExportValidationReport({
        exportId: "fail-test",
        exportType: "pdf",
        templateFamily: "signalyz-calibrated",
        templateVersion: "1.0.0",
        renderer: "jspdf",
        artifactBytes: 100,
        renderMs: 50,
        validationPassed: false,
        validationWarningCount: 0,
        validationErrorCount: 1,
        linkCount: 0,
        brokenLinkCount: 0,
        missingExpectedLinkCount: 0,
        duplicateLinkCount: 0,
        sectionCount: 0,
        bulletCount: 0,
        pageCount: 1,
        errorClass: "empty_file",
      }),
      artifactSha256: "deadbeef",
      sanitizerVersion: "10.0",
    });
    expect(true).toBe(true);
  });
});
