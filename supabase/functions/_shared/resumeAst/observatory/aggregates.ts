import type { ResumeAstShadowEventRow } from "./persist.ts";

export interface ResumeAstDashboardMetrics {
  parse_success_rate: number | null;
  average_section_count: number | null;
  average_bullet_count: number | null;
  average_round_trip_fidelity: number | null;
  average_bullet_preservation_score: number | null;
  average_keyword_preservation_score: number | null;
  average_parse_time_ms: number | null;
  malformed_resume_rate: number | null;
  top_validation_errors: Array<{ code: string; count: number }>;
  missing_section_frequency: Array<{ section_kind: string; count: number }>;
  worst_fidelity_cases: Array<{
    request_id: string | null;
    round_trip_fidelity: number;
    bullet_preservation_score: number;
    keyword_preservation_score: number;
  }>;
}

export function buildResumeAstDashboardMetrics(rows: ResumeAstShadowEventRow[]): ResumeAstDashboardMetrics {
  if (rows.length === 0) {
    return {
      parse_success_rate: null,
      average_section_count: null,
      average_bullet_count: null,
      average_round_trip_fidelity: null,
      average_bullet_preservation_score: null,
      average_keyword_preservation_score: null,
      average_parse_time_ms: null,
      malformed_resume_rate: null,
      top_validation_errors: [],
      missing_section_frequency: [],
      worst_fidelity_cases: [],
    };
  }

  const successful = rows.filter((row) => row.source_parse_ok && row.generated_parse_ok);
  const parseSuccessRate = successful.length / rows.length;

  const avg = (values: number[]) =>
    values.length === 0 ? null : Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10000) / 10000;

  const malformedRate =
    rows.filter((row) => row.validation_error_count > 0).length / rows.length;

  const validationErrorCounts = new Map<string, number>();
  for (const row of rows) {
    if (row.validation_error_count > 0) {
      const bucket = row.validation_error_count >= 3 ? "validation_error.high" : "validation_error.low";
      validationErrorCounts.set(bucket, (validationErrorCounts.get(bucket) ?? 0) + 1);
    }
    if (row.warning_count > 0) {
      validationErrorCounts.set("validation_warning", (validationErrorCounts.get("validation_warning") ?? 0) + 1);
    }
    if (row.round_trip_fidelity < 0.9) {
      validationErrorCounts.set("round_trip.low", (validationErrorCounts.get("round_trip.low") ?? 0) + 1);
    }
    if (row.bullet_preservation_score < 0.7) {
      validationErrorCounts.set("bullet_preservation.low", (validationErrorCounts.get("bullet_preservation.low") ?? 0) + 1);
    }
  }

  const missingSectionFrequency = new Map<string, number>();
  for (const row of rows) {
    if (row.missing_section_count > 0) {
      const key = `missing_${row.missing_section_count}`;
      missingSectionFrequency.set(key, (missingSectionFrequency.get(key) ?? 0) + 1);
    }
  }

  const worst = [...rows]
    .sort((a, b) => a.round_trip_fidelity - b.round_trip_fidelity)
    .slice(0, 10)
    .map((row) => ({
      request_id: row.request_id,
      round_trip_fidelity: row.round_trip_fidelity,
      bullet_preservation_score: row.bullet_preservation_score,
      keyword_preservation_score: row.keyword_preservation_score,
    }));

  return {
    parse_success_rate: Math.round(parseSuccessRate * 10000) / 10000,
    average_section_count: avg(successful.map((row) => row.generated_sections)),
    average_bullet_count: avg(successful.map((row) => row.generated_bullets)),
    average_round_trip_fidelity: avg(successful.map((row) => row.round_trip_fidelity)),
    average_bullet_preservation_score: avg(successful.map((row) => row.bullet_preservation_score)),
    average_keyword_preservation_score: avg(successful.map((row) => row.keyword_preservation_score)),
    average_parse_time_ms: avg(successful.map((row) => row.parse_time_ms)),
    malformed_resume_rate: Math.round(malformedRate * 10000) / 10000,
    top_validation_errors: [...validationErrorCounts.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    missing_section_frequency: [...missingSectionFrequency.entries()]
      .map(([section_kind, count]) => ({ section_kind, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    worst_fidelity_cases: worst,
  };
}
