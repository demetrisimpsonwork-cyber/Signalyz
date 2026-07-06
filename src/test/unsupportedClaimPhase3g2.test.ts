// @vitest-environment node
/**
 * Phase 3G.2 — Unsupported claim triage validation.
 */
import { describe, it, expect } from "vitest";
import { STANDARD_CODES } from "@/lib/signalyzedStandard/diagnosticCodes";
import { evaluateSignalyzedStandard } from "@/lib/signalyzedStandard/evaluateSignalyzedStandard";
import { classifyRepairCandidate } from "@/lib/signalyzedStandard/repairCandidates/classifyRepairCandidate";
import { buildRepairCandidateSignals } from "@/lib/signalyzedStandard/repairCandidates/repairCandidateSignals";
import {
  assertNoPiiInUnsupportedAuditPayload,
  buildUnsupportedClaimAuditMetrics,
  buildUnsupportedClaimAuditRows,
} from "@/lib/signalyzedStandard/unsupportedClaimAudit";
import {
  classifyUnsupportedClaim,
  isUnsupportedClaimHardBlocker,
  resolveUnsupportedClaimRepairAction,
} from "@signalyz/resumeQaEngine/unsupportedClaimClassifier";
import { detectUnsupportedClaims } from "@signalyz/resumeQaEngine/hallucinationDetector";
import {
  DEMETRI_AI_ENGINEER_SOURCE_RESUME,
  FULL_STACK_AI_ENGINEER_JD,
  TARGET_ROLE_LABEL,
} from "@/test/fixtures/resumeQa/demetriAiEngineerFixtures";
import type { BulletPreservationSummary, QaShadowSummary } from "@/lib/signalyzedStandard/types";

const bulletSupported: BulletPreservationSummary = {
  event: "resume_bullet_preservation_report",
  protected_bullet_count: 3,
  weakened_bullet_count: 2,
  restored_bullet_count: 2,
  duplicate_bullet_count: 0,
  hallucination_guard_passed: true,
  preservation_ok: true,
  affected_sections: ["experience"],
};

describe("Phase 3G.2 unsupported claim classifier", () => {
  it("Customer Success role-language rewrite does not become hard blocker", () => {
    const subtype = classifyUnsupportedClaim({
      ruleId: "hallucination.untracked_terms",
      matchedTerms: ["portfolio", "maintaining", "engagement", "period"],
      targetRoleLabel: "Customer Success Manager",
      referenceCorpus: "customer success retention qbr",
      sourceCorpus: "customer success retention accounts",
      evidence: "portfolio maintaining engagement period",
    });
    expect(subtype).toBe("role_language_rewrite");
    expect(
      isUnsupportedClaimHardBlocker({ subtype, confidence: "high", ruleId: "hallucination.untracked_terms" }),
    ).toBe(false);
  });

  it("generic business phrase does not become hard blocker", () => {
    const subtype = classifyUnsupportedClaim({
      ruleId: "hallucination.untracked_terms",
      matchedTerms: ["maintaining", "accuracy", "portfolio", "engagement"],
      targetRoleLabel: "Operations Coordinator",
      referenceCorpus: "operations coordination workflow",
      sourceCorpus: "operations support workflow",
      evidence: "maintaining accuracy portfolio engagement",
    });
    expect(subtype).toBe("generic_business_phrase");
    expect(resolveUnsupportedClaimRepairAction({ subtype, confidence: "medium" })).toBe("monitor_only");
  });

  it("transferable support/customer phrasing remains advisory", () => {
    const subtype = classifyUnsupportedClaim({
      ruleId: "hallucination.untracked_terms",
      matchedTerms: ["customer", "support", "operations"],
      targetRoleLabel: "Customer Success Manager",
      referenceCorpus: "customer success support operations retention",
      sourceCorpus: "customer support operations",
      evidence: "customer support operations",
    });
    expect([
      "transferable_rewrite",
      "generic_business_phrase",
      "role_language_rewrite",
      "protected_claim_regression",
    ]).toContain(subtype);
    expect(isUnsupportedClaimHardBlocker({ subtype, confidence: "medium" })).toBe(false);
  });

  it("true unsupported revenue ownership claim becomes hard blocker", () => {
    const subtype = classifyUnsupportedClaim({
      ruleId: "hallucination.untracked_terms",
      matchedTerms: ["revenue forecasting"],
      targetRoleLabel: "Customer Success Manager",
      referenceCorpus: "customer success",
      sourceCorpus: "customer support calls",
      evidence: "owned revenue forecasting for enterprise renewals",
    });
    expect(subtype).toBe("true_unsupported_claim");
    expect(
      isUnsupportedClaimHardBlocker({ subtype, confidence: "high", ruleId: "hallucination.untracked_terms" }),
    ).toBe(true);
  });

  it("unsupported AI/model claim under NJ DOL remains hard blocker", () => {
    const subtype = classifyUnsupportedClaim({
      ruleId: "hallucination.untracked_terms",
      matchedTerms: ["machine learning model", "llm pipeline"],
      targetRoleLabel: "Customer Service Representative",
      referenceCorpus: "department of labor unemployment claims",
      sourceCorpus: "njdol customer service caseload",
      evidence: "deployed machine learning model in llm pipeline",
    });
    expect(subtype).toBe("true_unsupported_claim");
  });

  it("unsupported leadership claim remains hard blocker when not sourced", () => {
    const subtype = classifyUnsupportedClaim({
      ruleId: "hallucination.untracked_terms",
      matchedTerms: ["managed", "team"],
      targetRoleLabel: "Account Manager",
      referenceCorpus: "account management client relationships",
      sourceCorpus: "account coordinator client support",
      evidence: "managed 12 person team across enterprise accounts",
    });
    expect(subtype).toBe("true_unsupported_claim");
  });

  it("synonym gap does not become hard blocker", () => {
    const subtype = classifyUnsupportedClaim({
      ruleId: "hallucination.untracked_terms",
      matchedTerms: ["typescript"],
      targetRoleLabel: "Full Stack / AI Engineer",
      referenceCorpus: "react node engineer",
      sourceCorpus: "built systems with typescript react",
      evidence: "typescript platform work",
    });
    expect(subtype).toBe("protected_claim_regression");
    expect(isUnsupportedClaimHardBlocker({ subtype, confidence: "high" })).toBe(false);
  });

  it("ambiguous claim becomes unclear_needs_human_review, not true unsupported", () => {
    const subtype = classifyUnsupportedClaim({
      ruleId: "hallucination.untracked_terms",
      matchedTerms: ["proprietary", "framework", "accelerator", "module"],
      targetRoleLabel: "Full Stack / AI Engineer",
      referenceCorpus: "react typescript engineer",
      sourceCorpus: "react engineer built platform",
      evidence: "proprietary framework accelerator module",
    });
    expect(subtype).toBe("unclear_needs_human_review");
    expect(resolveUnsupportedClaimRepairAction({ subtype, confidence: "medium" })).toBe("needs_human_review");
  });

  it("AI Engineer methodology terms classify as transferable, not true unsupported", () => {
    const issues = detectUnsupportedClaims({
      sourceResumeText: DEMETRI_AI_ENGINEER_SOURCE_RESUME,
      jobDescriptionText: FULL_STACK_AI_ENGINEER_JD,
      generatedResumeText:
        "- Maintained high-volume caseload accuracy while improving platform reliability for production workflows.",
      targetRoleLabel: TARGET_ROLE_LABEL,
      sourceCorpus: DEMETRI_AI_ENGINEER_SOURCE_RESUME.toLowerCase(),
      jdCorpus: FULL_STACK_AI_ENGINEER_JD.toLowerCase(),
      generatedCorpus:
        "maintained high-volume caseload accuracy improving platform reliability production workflows",
      referenceCorpus: `${DEMETRI_AI_ENGINEER_SOURCE_RESUME} ${FULL_STACK_AI_ENGINEER_JD}`.toLowerCase(),
    });
    const claim = issues.find((i) => i.code === "unsupported_claim");
    if (claim) {
      expect(claim.unsupportedClaimSubtype).not.toBe("true_unsupported_claim");
      expect(claim.confidence).not.toBe("very_high");
    }
  });
});

describe("Phase 3G.2 Standard + repair queue mapping", () => {
  const advisoryQa: QaShadowSummary = {
    event: "resume_qa_shadow_report",
    qa_score: 92,
    verdict: "pass",
    critical_issue_count: 0,
    warning_count: 1,
    issue_categories: { unsupported_claim: 1 },
    issue_logs: [
      {
        rule_id: "hallucination.untracked_terms",
        code: "unsupported_claim",
        confidence: "medium",
        severity: "medium",
        unsupported_claim_subtype: "role_language_rewrite",
      },
    ],
  };

  it("Customer Success advisory unsupported stays needs_review, not unsafe", () => {
    const result = evaluateSignalyzedStandard({
      requestId: "cs-advisory",
      exportId: "exp-cs",
      exportType: "docx",
      qa: advisoryQa,
      export: {
        event: "resume_export_validation_report",
        export_id: "exp-cs",
        export_type: "docx",
        template_version: "1.0.0",
        validation_passed: true,
        validation_warning_count: 0,
        validation_error_count: 0,
        link_count: 0,
        broken_link_count: 0,
        missing_expected_link_count: 0,
        duplicate_link_count: 0,
        section_count: 4,
        bullet_count: 4,
        page_count: null,
      },
    });
    expect(result.verdict).not.toBe("unsafe");
    expect(result.hard_blocker_count).toBe(0);
    expect(result.diagnostic_codes).toContain(STANDARD_CODES.QA_ADVISORY_WARNING);
    expect(result.diagnostic_codes).not.toContain(STANDARD_CODES.QA_UNSUPPORTED_CLAIM);
  });

  it("repair queue maps true unsupported claim to do_not_repair", () => {
    const qa: QaShadowSummary = {
      ...advisoryQa,
      issue_logs: [
        {
          rule_id: "hallucination.untracked_terms",
          code: "unsupported_claim",
          confidence: "high",
          severity: "high",
          unsupported_claim_subtype: "true_unsupported_claim",
        },
      ],
    };
    const signals = buildRepairCandidateSignals({ qa });
    const result = classifyRepairCandidate({
      verdict: "unsafe",
      hard_blocker_count: 1,
      diagnostic_codes: [STANDARD_CODES.QA_UNSUPPORTED_CLAIM],
      qa,
      signals,
    });
    expect(result.recommended_future_action).toBe("do_not_repair");
    expect(result.candidate).toBe(false);
  });

  it("AI Engineer advisory unsupported with bullet preservation stays safe_future_repair", () => {
    const qa: QaShadowSummary = {
      event: "resume_qa_shadow_report",
      qa_score: 95,
      verdict: "pass",
      critical_issue_count: 0,
      warning_count: 1,
      issue_categories: { unsupported_claim: 1 },
      issue_logs: [
        {
          rule_id: "hallucination.untracked_terms",
          code: "unsupported_claim",
          confidence: "medium",
          severity: "medium",
          unsupported_claim_subtype: "transferable_rewrite",
        },
      ],
    };
    const signals = buildRepairCandidateSignals({ qa, bullet: bulletSupported });
    const result = classifyRepairCandidate({
      verdict: "needs_review",
      hard_blocker_count: 0,
      diagnostic_codes: [
        STANDARD_CODES.QA_ADVISORY_WARNING,
        STANDARD_CODES.AST_LOW_BULLET_PRESERVATION,
      ],
      qa,
      bullet: bulletSupported,
      signals,
    });
    expect(result.recommended_future_action).toBe("safe_future_repair");
    expect(result.candidate_type).toBe("preserve_high_value_bullet");
  });

  it("unclear claim maps to needs_human_review in repair queue", () => {
    const qa: QaShadowSummary = {
      ...advisoryQa,
      issue_logs: [
        {
          rule_id: "hallucination.untracked_terms",
          code: "unsupported_claim",
          confidence: "medium",
          severity: "medium",
          unsupported_claim_subtype: "unclear_needs_human_review",
        },
      ],
    };
    const result = classifyRepairCandidate({
      verdict: "needs_review",
      diagnostic_codes: [STANDARD_CODES.QA_ADVISORY_WARNING],
      qa,
      signals: buildRepairCandidateSignals({ qa }),
    });
    expect(result.recommended_future_action).toBe("needs_human_review");
  });
});

describe("Phase 3G.2 unsupported audit dashboard", () => {
  it("no raw content in unsupported dashboard/report", () => {
    const rows = buildUnsupportedClaimAuditRows({
      standardRows: [
        {
          export_id: "prod-3g-std-2-customer-success",
          request_id: "req-cs",
          verdict: "needs_review",
          hard_blocker_count: 0,
          diagnostic_codes: [STANDARD_CODES.QA_ADVISORY_WARNING],
        },
      ],
      repairByExportId: new Map([
        [
          "prod-3g-std-2-customer-success",
          {
            export_id: "prod-3g-std-2-customer-success",
            request_id: "req-cs",
            export_type: "docx",
            candidate: false,
            candidate_type: "none",
            risk_level: "low",
            confidence: "high",
            source_diagnostic_codes: [STANDARD_CODES.QA_ADVISORY_WARNING],
            recommended_future_action: "monitor_only",
            reason_code: "unsupported_claim_advisory_only",
            standard_score: 98,
            standard_verdict: "needs_review",
            internal_label: "REVIEW_INTERNAL",
            sanitizer_version: "1.1",
          },
        ],
      ]),
      targetRoleByRequestId: new Map([["req-cs", "Customer Success Manager"]]),
    });
    const metrics = buildUnsupportedClaimAuditMetrics(rows);
    const report = { metrics, rows };
    expect(assertNoPiiInUnsupportedAuditPayload(report as unknown as Record<string, unknown>)).toBe(true);
    expect(JSON.stringify(report)).not.toMatch(/resume_text|https?:\/\//i);
  });
});
