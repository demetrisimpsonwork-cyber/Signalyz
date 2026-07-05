import {
  calibratedResumeToPlainText,
  type CalibratedResumePlainShape,
} from "@signalyz/resumeQaEngine/shadowIntegration";
import {
  isResumeAstShadowEnabled,
  runResumeAstShadow,
  runSourceResumeAstShadow,
  type ResumeAstShadowLog,
} from "@signalyz/resumeAst/shadowIntegration";
import { persistResumeAstObservatory } from "@/lib/resumeAstObservatory";

export type { ResumeAstShadowLog };

export function isClientResumeAstShadowEnabled(): boolean {
  return isResumeAstShadowEnabled(import.meta.env.VITE_ENABLE_RESUME_AST_SHADOW);
}

export interface RunClientSourceResumeAstShadowInput {
  sourceResumeText: string;
  requestId?: string;
  runId?: string;
}

/** Shadow-parse source resume after extraction/cleaning. Never throws. */
export function runClientSourceResumeAstShadow(input: RunClientSourceResumeAstShadowInput): void {
  runSourceResumeAstShadow({
    enabled: isClientResumeAstShadowEnabled(),
    sourceResumeText: input.sourceResumeText,
    requestId: input.requestId,
    runId: input.runId,
  });
}

export interface RunClientResumeAstShadowInput {
  sourceResumeText: string;
  generatedResume: CalibratedResumePlainShape;
  runId?: string;
  requestId?: string;
}

/**
 * Shadow AST comparison after calibrated resume assembly. Never throws; no user-visible changes.
 */
export function runClientResumeAstShadow(input: RunClientResumeAstShadowInput): ResumeAstShadowLog | null {
  const generatedResumeText = calibratedResumeToPlainText(input.generatedResume);
  const shadow = runResumeAstShadow({
    enabled: isClientResumeAstShadowEnabled(),
    sourceResumeText: input.sourceResumeText,
    generatedResumeText,
    runId: input.runId,
    requestId: input.requestId,
  });

  if (shadow.log) {
    persistResumeAstObservatory({ log: shadow.log });
  }

  return shadow.log;
}
