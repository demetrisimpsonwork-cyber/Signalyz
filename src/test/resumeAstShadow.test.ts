import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import {
  assertSanitizedAstShadowLog,
  clearCachedSourceResumeAstShadow,
  getCachedSourceResumeAstShadow,
  isResumeAstShadowEnabled,
  runResumeAstShadow,
  runSourceResumeAstShadow,
} from "@signalyz/resumeAst/shadowIntegration";
import { buildResumeAstShadowEventRow } from "@signalyz/resumeAst/observatory/persist";
import { computeRoundTripFidelity } from "@signalyz/resumeAst/shadowCompare";
import { buildResumeAstFromText } from "@signalyz/resumeAst";
import {
  runClientResumeAstShadow,
  runClientSourceResumeAstShadow,
} from "@/lib/resumeAstShadow";
import * as resumeAstObservatory from "@/lib/resumeAstObservatory";
import * as shadowCompare from "../../supabase/functions/_shared/resumeAst/shadowCompare.ts";
import {
  DEMETRI_AI_ENGINEER_SOURCE_RESUME,
  DEMETRI_CONTAMINATED_GENERATED_RESUME,
} from "@/test/fixtures/resumeQa/demetriAiEngineerFixtures";
import { MALFORMED_RESUME } from "@/test/fixtures/resumeAst/resumeAstFixtures";

const GENERATED_SHAPE = {
  header: { name: "Demetri Simpson", title: "Full Stack / AI Engineer" },
  summary: "AI engineer shipping hiring intelligence products.",
  experience: [
    {
      title: "Founding Engineer",
      company: "Signalyz",
      dates: "2022 – Present",
      bullets: ["Built a production AI platform that parses resumes for hiring workflows."],
    },
  ],
  skills: ["Python", "TypeScript"],
};

describe("Resume AST shadow integration", () => {
  beforeEach(() => {
    clearCachedSourceResumeAstShadow();
    vi.spyOn(resumeAstObservatory, "persistResumeAstObservatory").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("isResumeAstShadowEnabled", () => {
    it("defaults to false for unset, false, and 0", () => {
      expect(isResumeAstShadowEnabled(undefined)).toBe(false);
      expect(isResumeAstShadowEnabled(false)).toBe(false);
      expect(isResumeAstShadowEnabled("false")).toBe(false);
      expect(isResumeAstShadowEnabled("0")).toBe(false);
    });

    it("enables only for true/1", () => {
      expect(isResumeAstShadowEnabled("true")).toBe(true);
      expect(isResumeAstShadowEnabled("1")).toBe(true);
      expect(isResumeAstShadowEnabled(true)).toBe(true);
    });
  });

  describe("runResumeAstShadow", () => {
    it("does not run when flag is off", () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const result = runResumeAstShadow({
        enabled: false,
        sourceResumeText: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
        generatedResumeText: DEMETRI_CONTAMINATED_GENERATED_RESUME,
      });

      expect(result.log).toBeNull();
      expect(result.comparison).toBeNull();
      expect(logSpy).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });

    it("runs and logs sanitized summary when flag is on", () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const result = runResumeAstShadow({
        enabled: true,
        sourceResumeText: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
        generatedResumeText: DEMETRI_CONTAMINATED_GENERATED_RESUME,
        requestId: "ast-req-1",
        runId: "ast-run-1",
      });

      expect(result.log).not.toBeNull();
      expect(result.comparison).not.toBeNull();
      expect(result.log!.event).toBe("resume_ast_shadow_report");
      expect(result.log!.source_parse_ok).toBe(true);
      expect(result.log!.generated_parse_ok).toBe(true);
      expect(result.log!.round_trip_fidelity).toBeGreaterThanOrEqual(0);
      expect(logSpy).toHaveBeenCalled();

      const logged = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
      expect(logged.event).toBe("resume_ast_shadow_report");
      expect(logged.source_bullets).toBeGreaterThan(0);

      logSpy.mockRestore();
    });

    it("does not throw when comparison fails internally", () => {
      vi.spyOn(shadowCompare, "compareResumeAsts").mockImplementation(() => {
        throw new Error("parse boom");
      });
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      expect(() =>
        runResumeAstShadow({
          enabled: true,
          sourceResumeText: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
          generatedResumeText: DEMETRI_CONTAMINATED_GENERATED_RESUME,
          requestId: "ast-fail-1",
        }),
      ).not.toThrow();

      expect(() =>
        runClientResumeAstShadow({
          sourceResumeText: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
          generatedResume: GENERATED_SHAPE,
        }),
      ).not.toThrow();

      logSpy.mockRestore();
    });

    it("malformed resume produces diagnostics without crashing", () => {
      const result = runResumeAstShadow({
        enabled: true,
        sourceResumeText: MALFORMED_RESUME,
        generatedResumeText: MALFORMED_RESUME,
      });

      expect(result.log).not.toBeNull();
      expect(result.comparison!.validation_error_count).toBeGreaterThan(0);
      expect(result.comparison!.top_validation_codes.length).toBeGreaterThan(0);
    });
  });

  describe("sanitization", () => {
    it("shadow logs contain no resume text or PII patterns", () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const result = runResumeAstShadow({
        enabled: true,
        sourceResumeText: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
        generatedResumeText: DEMETRI_CONTAMINATED_GENERATED_RESUME,
        requestId: "ast-sanitize-1",
      });

      assertSanitizedAstShadowLog(result.log!);
      const serialized = JSON.stringify(result.log);
      expect(serialized).not.toMatch(/demetri@/i);
      expect(serialized).not.toMatch(/Signalyz/);
      expect(serialized).not.toMatch(/Built a production AI platform/);

      logSpy.mockRestore();
    });

    it("DB event row contains no raw content", () => {
      const result = runResumeAstShadow({
        enabled: true,
        sourceResumeText: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
        generatedResumeText: DEMETRI_CONTAMINATED_GENERATED_RESUME,
        requestId: "ast-db-1",
      });

      const row = buildResumeAstShadowEventRow(result.log!);
      const serialized = JSON.stringify(row);
      expect(serialized).not.toMatch(/@/);
      expect(serialized).not.toMatch(/Built a production/);
      expect(row.request_id).toBe("ast-db-1");
    });
  });

  describe("source/generated comparison", () => {
    it("tracks section and bullet deltas", () => {
      const result = runResumeAstShadow({
        enabled: true,
        sourceResumeText: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
        generatedResumeText: DEMETRI_CONTAMINATED_GENERATED_RESUME,
      });

      expect(result.comparison!.source_bullet_count).toBeGreaterThan(0);
      expect(result.comparison!.generated_bullet_count).toBeGreaterThan(0);
      expect(result.log!.missing_section_count).toBeGreaterThanOrEqual(0);
      expect(result.log!.added_section_count).toBeGreaterThanOrEqual(0);
      expect(typeof result.log!.fingerprint_changed).toBe("boolean");
    });

    it("caches source parse between intake and assembly shadow", () => {
      runSourceResumeAstShadow({
        enabled: true,
        sourceResumeText: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
        requestId: "cache-1",
      });

      const result = runResumeAstShadow({
        enabled: true,
        sourceResumeText: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
        generatedResumeText: DEMETRI_CONTAMINATED_GENERATED_RESUME,
        requestId: "cache-1",
      });

      expect(result.log?.source_parse_ok).toBe(true);
    });
  });

  describe("round-trip fidelity", () => {
    it("is deterministic for the same AST", () => {
      const { ast } = buildResumeAstFromText(DEMETRI_AI_ENGINEER_SOURCE_RESUME);
      const first = computeRoundTripFidelity(ast);
      const second = computeRoundTripFidelity(ast);
      expect(first).toBe(second);
      expect(first).toBeGreaterThan(0);
    });
  });

  describe("client flag wiring", () => {
    it("does not run client shadow when env flag is off", () => {
      vi.stubEnv("VITE_ENABLE_RESUME_AST_SHADOW", "false");
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const log = runClientResumeAstShadow({
        sourceResumeText: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
        generatedResume: GENERATED_SHAPE,
      });

      expect(log).toBeNull();
      const astLogs = logSpy.mock.calls
        .map((call) => String(call[0]))
        .filter((line) => line.includes("resume_ast_shadow_report"));
      expect(astLogs).toHaveLength(0);
      logSpy.mockRestore();
    });

    it("runs client shadow when env flag is on", () => {
      vi.stubEnv("VITE_ENABLE_RESUME_AST_SHADOW", "true");
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const log = runClientResumeAstShadow({
        sourceResumeText: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
        generatedResume: GENERATED_SHAPE,
        requestId: "client-ast-1",
      });

      expect(log).not.toBeNull();
      expect(log!.event).toBe("resume_ast_shadow_report");
      logSpy.mockRestore();
    });

    it("runs source shadow only when env flag is on", () => {
      vi.stubEnv("VITE_ENABLE_RESUME_AST_SHADOW", "false");
      runClientSourceResumeAstShadow({ sourceResumeText: DEMETRI_AI_ENGINEER_SOURCE_RESUME });
      expect(getCachedSourceResumeAstShadow()).toBeNull();

      vi.stubEnv("VITE_ENABLE_RESUME_AST_SHADOW", "true");
      runClientSourceResumeAstShadow({ sourceResumeText: DEMETRI_AI_ENGINEER_SOURCE_RESUME });
      expect(getCachedSourceResumeAstShadow()).not.toBeNull();
    });
  });
});
