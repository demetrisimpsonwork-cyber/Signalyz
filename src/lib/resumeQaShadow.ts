import {
  calibratedResumeToPlainText,
  isResumeQaShadowEnabled,
  runResumeQaShadow,
  type CalibratedResumePlainShape,
  type ResumeQaShadowLog,
} from "@signalyz/resumeQaEngine/shadowIntegration";

export type { ResumeQaShadowLog };

export function isClientResumeQaShadowEnabled(): boolean {
  return isResumeQaShadowEnabled(import.meta.env.VITE_ENABLE_RESUME_QA_SHADOW);
}

export interface RunClientResumeQaShadowInput {
  sourceResumeText: string;
  jobDescriptionText: string;
  generatedResume: CalibratedResumePlainShape;
  targetRoleLabel: string;
  runId?: string;
  requestId?: string;
}

/**
 * Shadow QA after calibrated resume assembly. Never throws; no user-visible changes.
 */
export function runClientResumeQaShadow(input: RunClientResumeQaShadowInput): ResumeQaShadowLog | null {
  const generatedResumeText = calibratedResumeToPlainText(input.generatedResume);
  const shadow = runResumeQaShadow({
    enabled: isClientResumeQaShadowEnabled(),
    sourceResumeText: input.sourceResumeText,
    jobDescriptionText: input.jobDescriptionText,
    generatedResumeText,
    targetRoleLabel: input.targetRoleLabel,
    runId: input.runId,
    requestId: input.requestId,
  });
  return shadow.log;
}
