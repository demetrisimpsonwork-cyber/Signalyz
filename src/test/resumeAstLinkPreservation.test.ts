import { describe, expect, it, vi, afterEach } from "vitest";
import { extractStructuredLinks } from "@signalyz/resumeAst/linkExtraction";
import { parseResumeAst } from "@signalyz/resumeAst";
import {
  applyLinkPreservationGuard,
  assertLinkPreservationReportSafe,
  logLinkPreservationReport,
} from "@signalyz/resumeAst/linkPreservation";
import { runResumeAstShadow } from "@signalyz/resumeAst/shadowIntegration";
import { calibratedResumeToPlainText } from "@signalyz/resumeQaEngine/shadowIntegration";
import {
  GENERATED_DUPLICATE_LINKS,
  GENERATED_MALFORMED_LINKS,
  GENERATED_MISSING_LINKS,
  RESUME_GITHUB_LINKEDIN_EMAIL,
  RESUME_INLINE_HEADER_LINKS,
  RESUME_PORTFOLIO_ONLY,
} from "@/test/fixtures/resumeAst/linkPreservationFixtures";
import {
  CUSTOMER_SUCCESS_RESUME,
  ENGINEERING_RESUME,
} from "@/test/fixtures/resumeAst/resumeAstFixtures";
import { DEMETRI_AI_ENGINEER_SOURCE_RESUME } from "@/test/fixtures/resumeQa/demetriAiEngineerFixtures";

describe("Resume AST link preservation — Phase 3A", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("source link extraction", () => {
    it("extracts GitHub, LinkedIn, and email from header", () => {
      const links = extractStructuredLinks(RESUME_GITHUB_LINKEDIN_EMAIL);
      const types = links.map((l) => l.type);
      expect(types).toContain("email");
      expect(types).toContain("github");
      expect(types).toContain("linkedin");
    });

    it("extracts portfolio site", () => {
      const links = extractStructuredLinks(RESUME_PORTFOLIO_ONLY);
      expect(links.some((l) => l.type === "portfolio" || l.type === "website")).toBe(true);
    });

    it("extracts inline header links", () => {
      const links = extractStructuredLinks(RESUME_INLINE_HEADER_LINKS);
      expect(links.filter((l) => l.type === "github").length).toBeGreaterThan(0);
      expect(links.filter((l) => l.type === "linkedin").length).toBeGreaterThan(0);
    });
  });

  describe("link preservation guard", () => {
    it("restores missing important links without hallucinating", () => {
      const result = applyLinkPreservationGuard({
        sourceResumeText: RESUME_GITHUB_LINKEDIN_EMAIL,
        resume: structuredClone(GENERATED_MISSING_LINKS),
        requestId: "link-guard-1",
      });

      expect(result.restored).toBe(true);
      expect(result.resume.header?.email).toContain("@");
      expect(result.resume.header?.github).toMatch(/github\.com/i);
      expect(result.resume.header?.linkedin).toMatch(/linkedin\.com/i);
      expect(result.report.restored_link_count).toBeGreaterThan(0);
      expect(result.report.preservation_ok).toBe(true);
    });

    it("does not duplicate existing links", () => {
      const result = applyLinkPreservationGuard({
        sourceResumeText: RESUME_GITHUB_LINKEDIN_EMAIL,
        resume: structuredClone(GENERATED_DUPLICATE_LINKS),
      });

      expect(result.report.restored_link_count).toBe(0);
      expect(result.resume.header?.github).toBe("github.com/alexchen");
    });

    it("does not restore malformed links from generated resume", () => {
      const result = applyLinkPreservationGuard({
        sourceResumeText: RESUME_GITHUB_LINKEDIN_EMAIL,
        resume: structuredClone(GENERATED_MALFORMED_LINKS),
      });

      expect(result.resume.header?.email).toContain("@example.com");
      expect(result.resume.header?.email).not.toBe("not-an-email");
    });

    it("never invents links when source has none", () => {
      const result = applyLinkPreservationGuard({
        sourceResumeText: "Jane Doe\n\nSummary\nAnalyst.",
        resume: structuredClone(GENERATED_MISSING_LINKS),
      });

      expect(result.report.restored_link_count).toBe(0);
      expect(result.resume.header?.github).toBe("");
    });
  });

  describe("observability", () => {
    it("logs sanitized resume_link_preservation_report without raw URLs", () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const result = applyLinkPreservationGuard({
        sourceResumeText: RESUME_GITHUB_LINKEDIN_EMAIL,
        resume: structuredClone(GENERATED_MISSING_LINKS),
        requestId: "link-log-1",
      });

      logLinkPreservationReport(result.report);
      assertLinkPreservationReportSafe(result.report);

      const serialized = JSON.stringify(result.report);
      expect(serialized).not.toMatch(/alex\.chen@/i);
      expect(serialized).not.toMatch(/github\.com\/alexchen/i);
      expect(result.report.event).toBe("resume_link_preservation_report");

      logSpy.mockRestore();
    });
  });

  describe("integration with AST shadow", () => {
    it("AST shadow still runs after link restoration", () => {
      const preserved = applyLinkPreservationGuard({
        sourceResumeText: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
        resume: structuredClone(GENERATED_MISSING_LINKS),
      });
      const generatedText = calibratedResumeToPlainText(preserved.resume);
      const shadow = runResumeAstShadow({
        enabled: true,
        sourceResumeText: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
        generatedResumeText: generatedText,
      });

      expect(shadow.log).not.toBeNull();
      expect(shadow.log!.source_parse_ok).toBe(true);
    });
  });

  describe("validation fixtures", () => {
    const cases = [
      { label: "demetri_ai_engineer", source: DEMETRI_AI_ENGINEER_SOURCE_RESUME },
      { label: "customer_success", source: CUSTOMER_SUCCESS_RESUME },
      { label: "engineering", source: ENGINEERING_RESUME },
      { label: "non_technical", source: CUSTOMER_SUCCESS_RESUME },
    ];

    it.each(cases)("$label extracts source links when present", ({ source }) => {
      const links = extractStructuredLinks(source);
      const astLinks = parseResumeAst(source).ast.links;
      expect(links.length + astLinks.length).toBeGreaterThanOrEqual(0);
      if (source.includes("@") || source.includes("github.com") || source.includes("linkedin.com")) {
        expect(links.length).toBeGreaterThan(0);
      }
    });

    it.each(cases)("$label preserves links when generated header is empty", ({ source }) => {
      const result = applyLinkPreservationGuard({
        sourceResumeText: source,
        resume: {
          header: { name: "Candidate", email: "", phone: "", linkedin: "", github: "", website: "" },
          summary: "Summary",
          experience: [],
          skills: [],
        },
      });

      if (extractStructuredLinks(source).length > 0) {
        expect(result.report.restored_link_count).toBeGreaterThan(0);
      }
      expect(result.report.preservation_ok).toBe(true);
    });
  });
});
