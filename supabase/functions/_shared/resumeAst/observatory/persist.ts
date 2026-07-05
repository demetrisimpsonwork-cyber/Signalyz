import type { ResumeAstShadowLog } from "../shadowIntegration.ts";
import { assertAstObservatoryRowSafe, sanitizeErrorClass, sanitizeId } from "./sanitize.ts";

export interface ResumeAstShadowEventRow {
  request_id: string | null;
  run_id: string | null;
  ast_version: string;
  source_parse_ok: boolean;
  generated_parse_ok: boolean;
  source_sections: number;
  generated_sections: number;
  source_bullets: number;
  generated_bullets: number;
  source_skills: number;
  generated_skills: number;
  validation_error_count: number;
  warning_count: number;
  round_trip_fidelity: number;
  bullet_preservation_score: number;
  keyword_preservation_score: number;
  missing_section_count: number;
  added_section_count: number;
  parse_time_ms: number;
  fingerprint_changed: boolean;
  error_class: string | null;
}

export function buildResumeAstShadowEventRow(log: ResumeAstShadowLog): ResumeAstShadowEventRow {
  const row: ResumeAstShadowEventRow = {
    request_id: sanitizeId(log.request_id),
    run_id: sanitizeId(log.run_id),
    ast_version: log.ast_version,
    source_parse_ok: log.source_parse_ok,
    generated_parse_ok: log.generated_parse_ok,
    source_sections: log.source_sections,
    generated_sections: log.generated_sections,
    source_bullets: log.source_bullets,
    generated_bullets: log.generated_bullets,
    source_skills: log.source_skills,
    generated_skills: log.generated_skills,
    validation_error_count: log.validation_error_count,
    warning_count: log.warning_count,
    round_trip_fidelity: log.round_trip_fidelity,
    bullet_preservation_score: log.bullet_preservation_score,
    keyword_preservation_score: log.keyword_preservation_score,
    missing_section_count: log.missing_section_count,
    added_section_count: log.added_section_count,
    parse_time_ms: log.parse_time_ms,
    fingerprint_changed: log.fingerprint_changed,
    error_class: sanitizeErrorClass(log.error?.name),
  };

  assertAstObservatoryRowSafe(row as unknown as Record<string, unknown>);
  return row;
}

export interface AstObservatoryPersistClient {
  from(table: string): {
    upsert(
      row: Record<string, unknown>,
      options?: { onConflict?: string },
    ): PromiseLike<{ error: { message: string } | null }>;
  };
}

export async function persistResumeAstShadowEvent(
  client: AstObservatoryPersistClient,
  row: ResumeAstShadowEventRow,
): Promise<void> {
  if (!row.request_id) {
    console.warn(
      JSON.stringify({
        event: "resume_ast_observatory_persist_skipped",
        reason: "missing_request_id",
      }),
    );
    return;
  }

  const { error } = await client.from("resume_ast_shadow_events").upsert(row, {
    onConflict: "request_id",
  });

  if (error) {
    console.warn(
      JSON.stringify({
        event: "resume_ast_observatory_persist_failed",
        request_id: row.request_id,
        error: error.message,
      }),
    );
    return;
  }

  console.log(
    JSON.stringify({
      event: "resume_ast_observatory_persisted",
      request_id: row.request_id,
      round_trip_fidelity: row.round_trip_fidelity,
    }),
  );
}
