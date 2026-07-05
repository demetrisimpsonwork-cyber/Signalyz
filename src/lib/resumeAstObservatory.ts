import { supabase } from "@/integrations/supabase/client";
import {
  buildResumeAstShadowEventRow,
  persistResumeAstShadowEvent,
} from "@signalyz/resumeAst/observatory/persist";
import type { ResumeAstShadowLog } from "@signalyz/resumeAst/shadowIntegration";
import { isClientResumeAstShadowEnabled } from "@/lib/resumeAstShadow";

export interface PersistResumeAstObservatoryInput {
  log: ResumeAstShadowLog;
}

/** Fire-and-forget AST observatory persistence. Never throws; never blocks assembly. */
export function persistResumeAstObservatory(input: PersistResumeAstObservatoryInput): void {
  if (!isClientResumeAstShadowEnabled()) return;
  if (input.log.error) return;

  try {
    const row = buildResumeAstShadowEventRow(input.log);
    void persistResumeAstShadowEvent(supabase, row).catch(() => {
      /* swallow — observatory must never surface errors */
    });
  } catch {
    /* invalid row — skip silently */
  }
}
