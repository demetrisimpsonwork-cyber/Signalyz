import {
  CATEGORY_WEIGHTS,
  HARD_BLOCKER_CATEGORY_PENALTY,
  LOW_BULLET_PRESERVATION_THRESHOLD,
  QA_ADVISORY_ONLY_CODES,
  QA_HARD_CONFIDENCE,
  VERDICT_REVIEW_THRESHOLD,
  WARNING_CATEGORY_PENALTY,
} from "./scoreWeights";
import { mapExportDiagnosticCode, STANDARD_CODES } from "./diagnosticCodes";
import type {
  DiagnosticFinding,
  SignalyzedCategoryScores,
  SignalyzedConfidence,
  SignalyzedStandardInput,
  SignalyzedStandardResult,
  RecommendedAction,
  SignalyzedVerdict,
  QaShadowSummary,
} from "./types";
import { SIGNALYZED_STANDARD_VERSION } from "./types";
import {
  isArtifactContaminationSubtype,
  matchedTermLooksLikeArtifact,
} from "@signalyz/resumeQaEngine/contaminationArtifactClassifier";
import { isUnsupportedClaimHardBlocker } from "@signalyz/resumeQaEngine/unsupportedClaimClassifier";

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

type QaIssueLogEntry = NonNullable<QaShadowSummary["issue_logs"]>[number];

function isTrueContaminationHardBlocker(issue: QaIssueLogEntry): boolean {
  if (issue.code !== "cross_jd_contamination") return false;
  if (!isHighConfidence(issue.confidence)) return false;

  if (issue.rule_id === "contamination.known_signature") return true;
  if (issue.contamination_subtype === "known_signature") return true;

  if (issue.rule_id === "contamination.section_artifact" || issue.rule_id === "contamination.advisory_phrase") {
    return false;
  }

  if (issue.contamination_subtype && isArtifactContaminationSubtype(issue.contamination_subtype as Parameters<typeof isArtifactContaminationSubtype>[0])) {
    return false;
  }

  if (issue.matched_terms?.some((t) => matchedTermLooksLikeArtifact(t))) {
    return false;
  }

  return (
    issue.contamination_subtype === "true_contamination" ||
    issue.rule_id === "contamination.ungrounded_phrase"
  );
}

function isContaminationArtifactWarning(issue: QaIssueLogEntry): boolean {
  if (issue.code !== "cross_jd_contamination") return false;

  if (issue.rule_id === "contamination.section_artifact" || issue.rule_id === "contamination.advisory_phrase") {
    return true;
  }

  if (issue.contamination_subtype && isArtifactContaminationSubtype(issue.contamination_subtype as Parameters<typeof isArtifactContaminationSubtype>[0])) {
    return true;
  }

  return issue.matched_terms?.some((t) => matchedTermLooksLikeArtifact(t)) ?? false;
}

function isTrueUnsupportedClaimHardBlocker(issue: QaIssueLogEntry): boolean {
  if (issue.code !== "unsupported_claim") return false;
  return isUnsupportedClaimHardBlocker({
    subtype: issue.unsupported_claim_subtype,
    confidence: issue.confidence,
    ruleId: issue.rule_id,
  });
}

function isAdvisoryUnsupportedClaim(issue: QaIssueLogEntry): boolean {
  if (issue.code !== "unsupported_claim") return false;
  return !isTrueUnsupportedClaimHardBlocker(issue);
}

function isSevereBulletRegressionHardBlocker(
  issue: QaIssueLogEntry,
  bulletPreservation?: SignalyzedStandardInput["bullet"],
): boolean {
  if (issue.code !== "bullet_regression") return false;
  if (!isHighConfidence(issue.confidence)) return false;

  const severe =
    issue.rule_id.includes("structured_to_parse") ||
    issue.matched_terms?.some((t) => /parses resumes/i.test(t));
  if (!severe) return false;

  if (bulletPreservation?.preservation_ok && (bulletPreservation.restored_bullet_count ?? 0) > 0) {
    return false;
  }

  return true;
}

function isIdentityDriftAdvisory(issue: QaIssueLogEntry): boolean {
  return issue.code.startsWith("identity_drift");
}

function isHighConfidence(confidence?: string): boolean {
  return QA_HARD_CONFIDENCE.has((confidence ?? "").toLowerCase());
}

function collectFindings(input: SignalyzedStandardInput): DiagnosticFinding[] {
  const findings: DiagnosticFinding[] = [];
  const { ast, qa, link, bullet, export: exportReport, docxExport } = input;

  if (exportReport) {
    if (!exportReport.validation_passed) {
      findings.push({
        code: STANDARD_CODES.EXPORT_FAILED,
        severity: "hard_blocker",
        category: "export_integrity",
      });
    }

    for (const code of exportReport.diagnostic_codes ?? []) {
      const mapped = mapExportDiagnosticCode(code);
      if (!mapped) continue;
      const isHard =
        mapped === STANDARD_CODES.EXPORT_EMPTY_FILE ||
        mapped === STANDARD_CODES.EXPORT_BROKEN_PLACEHOLDER ||
        mapped === STANDARD_CODES.EXPORT_JSON_ARTIFACT ||
        mapped === STANDARD_CODES.EXPORT_SPACED_HEADING ||
        mapped === STANDARD_CODES.EXPORT_BLANK_PDF;
      findings.push({
        code: mapped,
        severity: isHard ? "hard_blocker" : "warning",
        category: mapped.startsWith("STANDARD.LINKS")
          ? "links"
          : mapped.startsWith("STANDARD.STRUCTURE")
            ? "ats_structure"
            : "export_integrity",
      });
    }

    if (
      exportReport.export_type === "pdf" &&
      docxExport &&
      docxExport.link_count > 0 &&
      exportReport.link_count < docxExport.link_count
    ) {
      findings.push({
        code: STANDARD_CODES.PDF_LINK_EXTRACTION_WEAK,
        severity: "warning",
        category: "links",
      });
    }
  }

  if (link) {
    if (!link.preservation_ok) {
      findings.push({
        code: STANDARD_CODES.LINKS_MISSING_EXPECTED,
        severity: "hard_blocker",
        category: "links",
      });
    }
    if (link.broken_link_count > 0) {
      findings.push({
        code: STANDARD_CODES.LINKS_BROKEN,
        severity: "hard_blocker",
        category: "links",
      });
    }
    if (link.duplicate_link_count > 0) {
      findings.push({
        code: STANDARD_CODES.LINKS_DUPLICATE,
        severity: "warning",
        category: "links",
      });
    }
  }

  if (qa?.issue_logs?.length) {
    for (const issue of qa.issue_logs) {
      const high = isHighConfidence(issue.confidence);
      if (isTrueContaminationHardBlocker(issue)) {
        findings.push({
          code: STANDARD_CODES.QA_CROSS_JOB_CONTAMINATION,
          severity: "hard_blocker",
          category: "grounding",
        });
      } else if (isContaminationArtifactWarning(issue)) {
        findings.push({
          code: STANDARD_CODES.QA_CONTAMINATION_ARTIFACT,
          severity: "warning",
          category: "grounding",
        });
      } else if (issue.code === "role_contamination" && high) {
        findings.push({
          code: STANDARD_CODES.QA_ROLE_CONTAMINATION,
          severity: "hard_blocker",
          category: "grounding",
        });
      } else if (isTrueUnsupportedClaimHardBlocker(issue)) {
        findings.push({
          code: STANDARD_CODES.QA_UNSUPPORTED_CLAIM,
          severity: "hard_blocker",
          category: "grounding",
        });
      } else if (isSevereBulletRegressionHardBlocker(issue, bullet)) {
        findings.push({
          code: STANDARD_CODES.QA_SEVERE_BULLET_REGRESSION,
          severity: "hard_blocker",
          category: "grounding",
        });
      } else if (
        isAdvisoryUnsupportedClaim(issue) ||
        isIdentityDriftAdvisory(issue) ||
        QA_ADVISORY_ONLY_CODES.has(issue.code) ||
        issue.severity !== "critical"
      ) {
        findings.push({
          code: STANDARD_CODES.QA_ADVISORY_WARNING,
          severity: "warning",
          category: issue.code.startsWith("identity_drift") ? "identity" : "grounding",
        });
      }
    }
  } else if (qa && qa.warning_count > 0 && qa.critical_issue_count === 0) {
    findings.push({
      code: STANDARD_CODES.QA_ADVISORY_WARNING,
      severity: "warning",
      category: "grounding",
    });
  }

  if (ast) {
    if (!ast.source_parse_ok && !ast.generated_parse_ok) {
      findings.push({
        code: STANDARD_CODES.AST_PARSE_FAILURE,
        severity: "hard_blocker",
        category: "ats_structure",
      });
    } else if (!ast.source_parse_ok && ast.validation_error_count > 0) {
      findings.push({
        code: STANDARD_CODES.AST_MALFORMED_SOURCE,
        severity: "warning",
        category: "ats_structure",
      });
    }

    if (
      ast.bullet_preservation_score > 0 &&
      ast.bullet_preservation_score < LOW_BULLET_PRESERVATION_THRESHOLD
    ) {
      findings.push({
        code: STANDARD_CODES.AST_LOW_BULLET_PRESERVATION,
        severity: "warning",
        category: "ats_structure",
      });
    }

    if (ast.missing_section_count > 0 || ast.added_section_count > 0) {
      findings.push({
        code: STANDARD_CODES.AST_SECTION_MISMATCH,
        severity: "warning",
        category: "ats_structure",
      });
    }
  }

  return dedupeFindings(findings);
}

function dedupeFindings(findings: DiagnosticFinding[]): DiagnosticFinding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.code}:${f.severity}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scoreCategories(findings: DiagnosticFinding[]): SignalyzedCategoryScores {
  const categories: SignalyzedCategoryScores = {
    grounding: 100,
    identity: 100,
    links: 100,
    export_integrity: 100,
    formatting: 100,
    ats_structure: 100,
    stability_placeholder: 100,
  };

  for (const finding of findings) {
    const penalty =
      finding.severity === "hard_blocker"
        ? HARD_BLOCKER_CATEGORY_PENALTY
        : WARNING_CATEGORY_PENALTY;
    categories[finding.category] = clampScore(categories[finding.category] - penalty);

    if (
      finding.code === STANDARD_CODES.EXPORT_SPACED_HEADING ||
      finding.code === STANDARD_CODES.EXPORT_JSON_ARTIFACT
    ) {
      categories.formatting = clampScore(categories.formatting - penalty);
    }
  }

  return categories;
}

function compositeScore(categories: SignalyzedCategoryScores): number {
  let total = 0;
  for (const [key, weight] of Object.entries(CATEGORY_WEIGHTS) as Array<
    [keyof SignalyzedCategoryScores, number]
  >) {
    total += categories[key] * weight;
  }
  return clampScore(total);
}

function resolveConfidence(input: SignalyzedStandardInput): SignalyzedConfidence {
  const present = [
    input.ast != null,
    input.qa != null,
    input.link != null,
    input.bullet != null,
    input.export != null,
  ].filter(Boolean).length;
  if (present >= 4) return "high";
  if (present >= 3) return "medium";
  return "low";
}

function resolveVerdict(
  score: number,
  hardBlockers: number,
  warnings: number,
): SignalyzedVerdict {
  if (hardBlockers > 0) return "unsafe";
  if (warnings > 0 || score < VERDICT_REVIEW_THRESHOLD) return "needs_review";
  return "ready";
}

function resolveRecommendedAction(
  verdict: SignalyzedVerdict,
  findings: DiagnosticFinding[],
): RecommendedAction {
  if (verdict === "unsafe") return "do_not_enforce";

  const repairCandidates = new Set<string>([
    STANDARD_CODES.EXPORT_BROKEN_PLACEHOLDER,
    STANDARD_CODES.LINKS_MISSING_EXPECTED,
    STANDARD_CODES.EXPORT_SPACED_HEADING,
    STANDARD_CODES.EXPORT_JSON_ARTIFACT,
  ]);

  if (findings.some((f) => repairCandidates.has(f.code))) {
    return "ready_for_auto_repair_candidate";
  }

  if (verdict === "needs_review") return "ready_for_internal_warning";
  if (verdict === "ready") return "ready_for_internal_warning";
  return "keep_shadow";
}

/** Evaluate Signalyzed Standard v0 from sanitized shadow summaries only. */
export function evaluateSignalyzedStandard(input: SignalyzedStandardInput): SignalyzedStandardResult {
  const findings = collectFindings(input);
  const hard_blocker_count = findings.filter((f) => f.severity === "hard_blocker").length;
  const warning_count = findings.filter((f) => f.severity === "warning").length;
  const categories = scoreCategories(findings);
  const signalyzed_score = compositeScore(categories);
  const verdict = resolveVerdict(signalyzed_score, hard_blocker_count, warning_count);
  const confidence = resolveConfidence(input);
  const diagnostic_codes = [...new Set(findings.map((f) => f.code))];

  return {
    standard_version: SIGNALYZED_STANDARD_VERSION,
    signalyzed_score,
    verdict,
    confidence,
    hard_blocker_count,
    warning_count,
    categories,
    diagnostic_codes,
    recommended_action: resolveRecommendedAction(verdict, findings),
  };
}
