import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import {
  buildSanitizedQaLog,
  isResumeQaShadowEnabled,
  runResumeQaShadow,
} from "@signalyz/resumeQaEngine/shadowIntegration";
import * as resumeQaEngine from "@signalyz/resumeQaEngine/resumeQaEngine";
import { runClientResumeQaShadow } from "@/lib/resumeQaShadow";
import {
  DEMETRI_AI_ENGINEER_SOURCE_RESUME,
  DEMETRI_CONTAMINATED_GENERATED_RESUME,
  FULL_STACK_AI_ENGINEER_JD,
  TARGET_ROLE_LABEL,
} from "@/test/fixtures/resumeQa/demetriAiEngineerFixtures";

const CONTAMINATED_RESUME_SHAPE = {
  header: { name: "Demetri Simpson", title: "Full Stack / AI Engineer" },
  summary: "AI engineer shipping hiring intelligence products.",
  experience: [
    {
      title: "Founding Engineer",
      company: "Signalyz",
      dates: "2022 – Present",
      bullets: [
        "Built a production AI platform that parses resumes for hiring workflows.",
        "Led the AI Sandbox initiative for rapid prompt iteration across customer pilots.",
      ],
    },
    {
      title: "Customer Service Representative",
      company: "New Jersey Department of Labor (NJDOL)",
      dates: "2017 – 2021",
      bullets: [
        "Managed customer escalation calls and coordinated tier-2 escalations within SLA targets.",
        "Improved model outputs for claimant routing scripts and documentation quality.",
      ],
    },
  ],
  skills: ["Python", "Salesforce", "customer escalation", "documentation"],
};

describe("Resume QA shadow integration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("isResumeQaShadowEnabled", () => {
    it("defaults to false for unset, false, and 0", () => {
      expect(isResumeQaShadowEnabled(undefined)).toBe(false);
      expect(isResumeQaShadowEnabled(false)).toBe(false);
      expect(isResumeQaShadowEnabled("false")).toBe(false);
      expect(isResumeQaShadowEnabled("0")).toBe(false);
    });

    it("enables only for true/1", () => {
      expect(isResumeQaShadowEnabled("true")).toBe(true);
      expect(isResumeQaShadowEnabled("1")).toBe(true);
      expect(isResumeQaShadowEnabled(true)).toBe(true);
    });
  });

  describe("runResumeQaShadow", () => {
    it("does not run QA when flag is off", () => {
      const qaSpy = vi.spyOn(resumeQaEngine, "runResumeQa");
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const result = runResumeQaShadow({
        enabled: false,
        sourceResumeText: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
        jobDescriptionText: FULL_STACK_AI_ENGINEER_JD,
        generatedResumeText: DEMETRI_CONTAMINATED_GENERATED_RESUME,
        targetRoleLabel: TARGET_ROLE_LABEL,
      });

      expect(result.log).toBeNull();
      expect(result.result).toBeNull();
      expect(qaSpy).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();

      qaSpy.mockRestore();
      logSpy.mockRestore();
    });

    it("runs QA and logs sanitized summary when flag is on", () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const result = runResumeQaShadow({
        enabled: true,
        sourceResumeText: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
        jobDescriptionText: FULL_STACK_AI_ENGINEER_JD,
        generatedResumeText: DEMETRI_CONTAMINATED_GENERATED_RESUME,
        targetRoleLabel: TARGET_ROLE_LABEL,
        requestId: "shadow-req-1",
        runId: "shadow-run-1",
      });

      expect(result.log).not.toBeNull();
      expect(result.result).not.toBeNull();
      expect(result.log!.event).toBe("resume_qa_shadow_report");
      expect(result.log!.qa_score).toBeGreaterThanOrEqual(0);
      expect(result.log!.verdict).toMatch(/pass|needs_review|block_regeneration/);
      expect(logSpy).toHaveBeenCalled();

      const logged = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
      expect(logged.critical_issue_count).toBeGreaterThan(0);
      expect(logged.keyword_loss_count).toBeGreaterThan(0);
      expect(logged.role_contamination_count).toBeGreaterThan(0);
      expect(logged.bullet_regression_count).toBeGreaterThan(0);

      logSpy.mockRestore();
    });

    it("does not throw when QA engine crashes", () => {
      const qaSpy = vi.spyOn(resumeQaEngine, "runResumeQa").mockImplementation(() => {
        throw new Error("simulated QA failure");
      });
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      expect(() =>
        runResumeQaShadow({
          enabled: true,
          sourceResumeText: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
          jobDescriptionText: FULL_STACK_AI_ENGINEER_JD,
          generatedResumeText: DEMETRI_CONTAMINATED_GENERATED_RESUME,
          targetRoleLabel: TARGET_ROLE_LABEL,
          requestId: "qa-crash-req",
        }),
      ).not.toThrow();

      const logged = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
      expect(logged.event).toBe("resume_qa_shadow_report");
      expect(logged.error?.message).toContain("simulated QA failure");

      qaSpy.mockRestore();
      logSpy.mockRestore();
    });

    it("never logs raw resume or JD text", () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      runResumeQaShadow({
        enabled: true,
        sourceResumeText: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
        jobDescriptionText: FULL_STACK_AI_ENGINEER_JD,
        generatedResumeText: DEMETRI_CONTAMINATED_GENERATED_RESUME,
        targetRoleLabel: TARGET_ROLE_LABEL,
      });

      const serialized = logSpy.mock.calls.map((c) => String(c[0])).join(" ");
      expect(serialized).not.toMatch(/demetri@example\.com/i);
      expect(serialized).not.toMatch(/github\.com/i);
      expect(serialized).not.toMatch(/AI Sandbox initiative/i);
      expect(serialized).not.toMatch(/model outputs for claimant/i);
      expect(serialized).not.toMatch(/converts resumes and JDs/i);
      expect(serialized).not.toContain(DEMETRI_AI_ENGINEER_SOURCE_RESUME.slice(0, 40));
      expect(serialized).not.toContain(FULL_STACK_AI_ENGINEER_JD.slice(0, 40));

      logSpy.mockRestore();
    });
  });

  describe("contaminated Demetri fixture", () => {
    it("flags AI Sandbox, DOL role contamination, bullet regression, and keyword loss", () => {
      const result = runResumeQaShadow({
        enabled: true,
        sourceResumeText: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
        jobDescriptionText: FULL_STACK_AI_ENGINEER_JD,
        generatedResumeText: DEMETRI_CONTAMINATED_GENERATED_RESUME,
        targetRoleLabel: TARGET_ROLE_LABEL,
      });

      expect(result.result).not.toBeNull();
      expect(result.log!.issue_categories.contamination).toBeGreaterThan(0);
      expect(result.log!.role_contamination_count).toBeGreaterThan(0);
      expect(result.log!.bullet_regression_count).toBeGreaterThan(0);
      expect(result.log!.keyword_loss_count).toBeGreaterThan(0);
      expect(["needs_review", "block_regeneration"]).toContain(result.log!.verdict);

      const contaminationEvidence = result.result!.criticalIssues
        .filter((i) => i.code === "cross_jd_contamination")
        .map((i) => `${i.message} ${i.evidence ?? ""}`)
        .join(" ");
      expect(contaminationEvidence).toMatch(/ai sandbox/i);

      const roleEvidence = result.result!.roleContamination
        .map((i) => `${i.message} ${i.evidence ?? ""}`)
        .join(" ");
      expect(roleEvidence).toMatch(/model outputs/i);
    });
  });

  describe("buildSanitizedQaLog", () => {
    it("contains counts only — no issue messages or evidence", () => {
      const shadow = runResumeQaShadow({
        enabled: true,
        sourceResumeText: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
        jobDescriptionText: FULL_STACK_AI_ENGINEER_JD,
        generatedResumeText: DEMETRI_CONTAMINATED_GENERATED_RESUME,
        targetRoleLabel: TARGET_ROLE_LABEL,
      });

      const log = buildSanitizedQaLog(
        {
          targetRoleLabel: TARGET_ROLE_LABEL,
          requestId: "req-1",
          runId: "run-1",
        },
        shadow.result!,
      );

      const serialized = JSON.stringify(log);
      expect(serialized).not.toMatch(/AI Sandbox/i);
      expect(serialized).not.toMatch(/model outputs/i);
      expect(log.keyword_loss_count).toBeGreaterThan(0);
    });
  });

  describe("runClientResumeQaShadow", () => {
    beforeEach(() => {
      vi.stubEnv("VITE_ENABLE_RESUME_QA_SHADOW", "false");
    });

    it("does not run when client flag is off", () => {
      const qaSpy = vi.spyOn(resumeQaEngine, "runResumeQa");
      const log = runClientResumeQaShadow({
        sourceResumeText: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
        jobDescriptionText: FULL_STACK_AI_ENGINEER_JD,
        generatedResume: CONTAMINATED_RESUME_SHAPE,
        targetRoleLabel: TARGET_ROLE_LABEL,
      });

      expect(log).toBeNull();
      expect(qaSpy).not.toHaveBeenCalled();
      qaSpy.mockRestore();
    });

    it("runs when client flag is on", () => {
      vi.stubEnv("VITE_ENABLE_RESUME_QA_SHADOW", "true");
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const log = runClientResumeQaShadow({
        sourceResumeText: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
        jobDescriptionText: FULL_STACK_AI_ENGINEER_JD,
        generatedResume: CONTAMINATED_RESUME_SHAPE,
        targetRoleLabel: TARGET_ROLE_LABEL,
        requestId: "client-shadow-req",
      });

      expect(log).not.toBeNull();
      expect(logSpy).toHaveBeenCalled();
      logSpy.mockRestore();
    });
  });
});
