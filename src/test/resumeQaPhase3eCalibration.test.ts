import { describe, expect, it } from "vitest";
import { classifyUnsupportedClaim, isGenericBusinessTerm } from "@signalyz/resumeQaEngine/unsupportedClaimClassifier";
import { classifyMissingEmployersDrift, extractEmployerNames } from "@signalyz/resumeQaEngine/identityDriftClassifier";
import { detectIdentityDrift } from "@signalyz/resumeQaEngine/identityDriftDetector";
import { detectUnsupportedClaims } from "@signalyz/resumeQaEngine/hallucinationDetector";
import { evaluateSignalyzedStandard, STANDARD_CODES } from "@/lib/signalyzedStandard";
import { FIXTURE_BROKEN_PLACEHOLDER } from "@/test/fixtures/signalyzedStandard/signalyzedStandardFixtures";

describe("Phase 3E QA triage classifiers", () => {
  it("classifies Customer Success generic terms as not hard-blocker subtype", () => {
    const subtype = classifyUnsupportedClaim({
      ruleId: "hallucination.untracked_terms",
      matchedTerms: ["primary", "ownership", "maintaining", "portfolio"],
      targetRoleLabel: "Customer Success Manager",
      referenceCorpus: "customer success retention qbr salesforce",
      sourceCorpus: "customer success retention accounts",
      evidence: "primary ownership maintaining portfolio",
    });
    expect(subtype).toBe("role_language_rewrite");
    expect(isGenericBusinessTerm("ownership")).toBe(true);
  });

  it("classifies true unsupported revenue forecasting as hard-blocker candidate", () => {
    const subtype = classifyUnsupportedClaim({
      ruleId: "hallucination.untracked_terms",
      matchedTerms: ["revenue forecasting"],
      targetRoleLabel: "Customer Success Manager",
      referenceCorpus: "customer success",
      sourceCorpus: "customer support calls",
      evidence: "owned revenue forecasting for enterprise renewals",
    });
    expect(subtype).toBe("true_unsupported_claim");
  });

  it("does not treat header location as missing employer", () => {
    const source = `Demetri Simpson\nFull Stack Engineer | Newark, NJ | email\nFounding Engineer | Signalyz | 2022 – Present\n- Built APIs.`;
    const generated = `Demetri Simpson\nFull Stack Engineer | Newark, NJ\nFounding Engineer | Signalyz | 2022 – Present\n- Built APIs.`;
    const employers = extractEmployerNames(source);
    expect(employers).toContain("Signalyz");
    expect(employers.some((e) => /newark/i.test(e))).toBe(false);

    const issues = detectIdentityDrift({
      sourceResumeText: source,
      generatedResumeText: generated,
      jobDescriptionText: "",
      targetRoleLabel: "Engineer",
      sourceCorpus: source.toLowerCase(),
      jdCorpus: "",
      generatedCorpus: generated.toLowerCase(),
      referenceCorpus: source.toLowerCase(),
    });
    expect(issues.filter((i) => i.code === "identity_drift_missing_employers")).toHaveLength(0);
  });

  it("minor employer omission stays advisory subtype", () => {
    const subtype = classifyMissingEmployersDrift({
      sourceResumeText: `Role B | CurrentCo | 2020 – Present\n- Built systems.\nRole A | OldCo | 2015 – 2018\n- Did work.`,
      generatedResumeText: `Role B | CurrentCo | 2020 – Present\n- Built systems.`,
      missingEmployers: ["OldCo"],
    });
    expect(subtype).toBe("identity_drift.minor_employer_omission");
  });

  it("ADVISORY_WARNING alone never produces unsafe verdict", () => {
    const result = evaluateSignalyzedStandard({
      requestId: "advisory-only",
      exportId: "exp-advisory",
      exportType: "docx",
      qa: {
        event: "resume_qa_shadow_report",
        qa_score: 80,
        verdict: "needs_review",
        critical_issue_count: 0,
        warning_count: 2,
        issue_categories: {},
        issue_logs: [
          {
            rule_id: "identity_drift.missing_employers",
            code: "identity_drift_missing_employers",
            confidence: "medium",
            severity: "medium",
            matched_terms: ["oldco"],
            identity_drift_subtype: "identity_drift.minor_employer_omission",
          },
          {
            rule_id: "keyword_preservation.high_value_loss",
            code: "keyword_loss",
            confidence: "medium",
            severity: "medium",
            matched_terms: ["ci/cd"],
          },
        ],
      },
      export: {
        event: "resume_export_validation_report",
        export_id: "exp-advisory",
        export_type: "docx",
        template_version: "1.0.0",
        validation_passed: true,
        validation_warning_count: 0,
        validation_error_count: 0,
        link_count: 1,
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
  });

  it("broken placeholder still unsafe", () => {
    const result = evaluateSignalyzedStandard(FIXTURE_BROKEN_PLACEHOLDER);
    expect(result.verdict).toBe("unsafe");
  });

  it("unsupported claim detector downgrades generic CS rewrite to advisory confidence", () => {
    const issues = detectUnsupportedClaims({
      sourceResumeText: "Taylor Morgan\nCSM at Relay SaaS\n- Managed accounts with retention focus.",
      jobDescriptionText: "Customer Success Manager — retention, QBRs.",
      generatedResumeText: "- Primary ownership maintaining portfolio of enterprise customer accounts.",
      targetRoleLabel: "Customer Success Manager",
      sourceCorpus: "taylor relay saas accounts retention",
      jdCorpus: "customer success retention qbr",
      generatedCorpus: "primary ownership maintaining portfolio enterprise customer accounts",
      referenceCorpus: "taylor relay saas accounts retention customer success retention qbr",
    });
    const claim = issues.find((i) => i.code === "unsupported_claim");
    expect(claim).toBeDefined();
    expect(claim!.confidence).toBe("medium");
    expect(claim!.unsupportedClaimSubtype).toBe("role_language_rewrite");
    expect(claim!.severity).not.toBe("critical");
  });
});
