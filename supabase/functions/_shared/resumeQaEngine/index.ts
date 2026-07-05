export { runResumeQa } from "./resumeQaEngine.ts";
export {
  classifyContaminationPhrase,
  isLocationSummaryArtifactPhrase,
  matchedTermLooksLikeArtifact,
} from "./contaminationArtifactClassifier.ts";
export type { ContaminationSubtype } from "./contaminationArtifactClassifier.ts";
export { HIGH_VALUE_KEYWORDS } from "./keywordPreservation.ts";
export { buildConfusionLogs } from "./confusionLogging.ts";
export { buildRuleAnalytics } from "./ruleAnalytics.ts";
export { buildShadowDashboardSummary } from "./shadowDashboard.ts";
export {
  buildResumeQaShadowEventRow,
  persistResumeQaShadowEvent,
  buildResumeQaDashboardMetrics,
  detectResumeQaDrift,
  buildResumeQaWeeklyReport,
  formatResumeQaWeeklyMarkdown,
  inferResumeQaRoleFamily,
  assertObservatoryRowSafe,
} from "./observatory/index.ts";
export type {
  ResumeQaShadowEventRow,
  ResumeQaShadowEvent,
  ResumeQaDashboardMetrics,
  ResumeQaDriftReport,
  ResumeQaWeeklyReport,
} from "./observatory/index.ts";
export {
  isResumeQaShadowEnabled,
  runResumeQaShadow,
  buildSanitizedQaLog,
  calibratedResumeToPlainText,
  assertSanitizedShadowLog,
} from "./shadowIntegration.ts";
export type { ResumeQaShadowLog, RunResumeQaShadowInput, RunResumeQaShadowResult } from "./shadowIntegration.ts";
export type {
  QaIssue,
  QaIssueLog,
  QaConfidence,
  QaSeverity,
  QaVerdict,
  ResumeQaInput,
  ResumeQaResult,
  ResumeQaObservabilitySummary,
  RuleAnalyticsSummary,
  ShadowDashboardSummary,
} from "./types.ts";
