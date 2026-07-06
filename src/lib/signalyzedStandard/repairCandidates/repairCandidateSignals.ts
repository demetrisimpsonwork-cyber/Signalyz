import type {
  AstShadowSummary,
  BulletPreservationSummary,
  ExportValidationSummary,
  LinkPreservationSummary,
  QaShadowSummary,
  SignalyzedStandardResult,
} from "../types.ts";
import {
  buildQaAdvisorySummary,
  type QaAdvisorySummary,
} from "./qaAdvisorySummary.ts";
import type { RepairCandidateObservabilityContext } from "./types.ts";

export interface RepairCandidateSignalInput {
  result?: SignalyzedStandardResult | null;
  ast?: AstShadowSummary | null;
  qa?: QaShadowSummary | null;
  link?: LinkPreservationSummary | null;
  bullet?: BulletPreservationSummary | null;
  export?: ExportValidationSummary | null;
}

export interface RepairCandidateSignals {
  qa_advisory: QaAdvisorySummary | null;
  ast_present: boolean;
  qa_present: boolean;
  link_present: boolean;
  bullet_present: boolean;
  export_present: boolean;
  bullet_preservation_restored_count: number;
  observability: RepairCandidateObservabilityContext;
}

export function buildRepairCandidateSignals(
  input: RepairCandidateSignalInput,
): RepairCandidateSignals {
  const qa_advisory = buildQaAdvisorySummary(input.qa);
  const bullet_preservation_restored_count = input.bullet?.restored_bullet_count ?? 0;

  const observability: RepairCandidateObservabilityContext = {
    qa_signal_present: qa_advisory != null,
    keyword_loss_count: qa_advisory?.keyword_loss_count ?? 0,
    unsupported_claim_subtype_count: qa_advisory?.unsupported_claim_subtypes.length ?? 0,
    bullet_preservation_restored_count,
    identity_drift_subtype_count: qa_advisory?.identity_drift_subtypes.length ?? 0,
  };

  return {
    qa_advisory,
    ast_present: input.ast != null,
    qa_present: input.qa != null,
    link_present: input.link != null,
    bullet_present: input.bullet != null,
    export_present: input.export != null,
    bullet_preservation_restored_count,
    observability,
  };
}
