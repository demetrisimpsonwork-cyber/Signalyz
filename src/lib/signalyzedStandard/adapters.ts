import type { ResumeAstShadowLog } from "@signalyz/resumeAst/shadowIntegration";
import type { ResumeBulletPreservationReport, ResumeLinkPreservationReport } from "@signalyz/resumeAst/types";
import type { ResumeQaShadowLog } from "@signalyz/resumeQaEngine/shadowIntegration";
import type { AstShadowSummary, BulletPreservationSummary, LinkPreservationSummary, QaShadowSummary } from "./types";

export function toAstShadowSummary(log: ResumeAstShadowLog): AstShadowSummary {
  return {
    event: "resume_ast_shadow_report",
    request_id: log.request_id,
    source_parse_ok: log.source_parse_ok,
    generated_parse_ok: log.generated_parse_ok,
    validation_error_count: log.validation_error_count,
    warning_count: log.warning_count,
    round_trip_fidelity: log.round_trip_fidelity,
    bullet_preservation_score: log.bullet_preservation_score,
    keyword_preservation_score: log.keyword_preservation_score,
    missing_section_count: log.missing_section_count,
    added_section_count: log.added_section_count,
    source_sections: log.source_sections,
    generated_sections: log.generated_sections,
    source_bullets: log.source_bullets,
    generated_bullets: log.generated_bullets,
  };
}

export function toQaShadowSummary(log: ResumeQaShadowLog): QaShadowSummary {
  return {
    event: "resume_qa_shadow_report",
    request_id: log.request_id,
    qa_score: log.qa_score,
    verdict: log.verdict,
    critical_issue_count: log.critical_issue_count,
    warning_count: log.warning_count,
    issue_categories: log.issue_categories,
    issue_logs: log.issue_logs?.map((issue) => ({
      rule_id: issue.rule_id,
      code: issue.code,
      confidence: issue.confidence,
      severity: issue.severity,
      matched_terms: issue.matched_terms,
      contamination_subtype: issue.contamination_subtype,
      unsupported_claim_subtype: issue.unsupported_claim_subtype,
      identity_drift_subtype: issue.identity_drift_subtype,
    })),
  };
}

export function toBulletPreservationSummary(report: ResumeBulletPreservationReport): BulletPreservationSummary {
  return {
    event: "resume_bullet_preservation_report",
    request_id: report.request_id,
    protected_bullet_count: report.protected_bullet_count,
    weakened_bullet_count: report.weakened_bullet_count,
    restored_bullet_count: report.restored_bullet_count,
    duplicate_bullet_count: report.duplicate_bullet_count,
    hallucination_guard_passed: report.hallucination_guard_passed,
    preservation_ok: report.preservation_ok,
    affected_sections: report.affected_sections,
  };
}

export function toLinkPreservationSummary(report: ResumeLinkPreservationReport): LinkPreservationSummary {
  return {
    event: "resume_link_preservation_report",
    request_id: report.request_id,
    source_link_count: report.source_link_count,
    generated_link_count_before: report.generated_link_count_before,
    generated_link_count_after: report.generated_link_count_after,
    restored_link_count: report.restored_link_count,
    link_types_restored: report.link_types_restored,
    duplicate_link_count: report.duplicate_link_count,
    broken_link_count: report.broken_link_count,
    preservation_ok: report.preservation_ok,
  };
}
