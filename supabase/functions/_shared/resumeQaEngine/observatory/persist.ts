import type { ResumeQaResult } from "../types.ts";
import type { ResumeQaShadowLog } from "../shadowIntegration.ts";
import { assertObservatoryRowSafe, sanitizeId, sanitizeMatchedTerms, sanitizeTargetRole } from "./sanitize.ts";

export interface ResumeQaShadowEventRow {
  request_id: string | null;
  run_id: string | null;
  target_role: string;
  qa_score: number;
  verdict: string;
  critical_issue_count: number;
  warning_count: number;
  contamination_count: number;
  keyword_loss_count: number;
  unsupported_claim_count: number;
  role_contamination_count: number;
  bullet_regression_count: number;
  formatting_issue_count: number;
  identity_drift_count: number;
  average_confidence: number | null;
  highest_confidence: string | null;
  critical_rate: number;
  top_rules: Array<{
    rule_id: string;
    count: number;
    confidence?: string;
    matched_terms?: string[];
  }>;
  likely_false_positive_rules: Array<{ rule_id: string; clean_critical_hits: number }>;
  generation_time_ms: number | null;
}

const CONFIDENCE_RANK: Record<string, number> = {
  very_high: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export function buildResumeQaShadowEventRow(input: {
  log: ResumeQaShadowLog;
  result?: ResumeQaResult | null;
  generationTimeMs?: number | null;
}): ResumeQaShadowEventRow {
  const { log, result, generationTimeMs } = input;
  const issueLogs = log.issue_logs ?? result?.issueLogs ?? [];

  const topRules = aggregateTopRules(issueLogs);
  const { averageConfidence, highestConfidence } = summarizeConfidence(issueLogs);
  const issueTotal = issueLogs.length;
  const criticalRate =
    issueTotal === 0 ? 0 : Math.round((log.critical_issue_count / issueTotal) * 10000) / 10000;

  const row: ResumeQaShadowEventRow = {
    request_id: sanitizeId(log.request_id),
    run_id: sanitizeId(log.run_id),
    target_role: sanitizeTargetRole(log.target_role_label),
    qa_score: Math.round(log.qa_score),
    verdict: log.verdict,
    critical_issue_count: log.critical_issue_count,
    warning_count: log.warning_count,
    contamination_count: log.issue_categories?.contamination ?? 0,
    keyword_loss_count: log.keyword_loss_count,
    unsupported_claim_count: log.unsupported_claim_count,
    role_contamination_count: log.role_contamination_count,
    bullet_regression_count: log.bullet_regression_count,
    formatting_issue_count: log.formatting_issue_count,
    identity_drift_count: log.identity_drift_count,
    average_confidence: averageConfidence,
    highest_confidence: highestConfidence,
    critical_rate: criticalRate,
    top_rules: topRules,
    likely_false_positive_rules: (log.dashboard_summary?.likely_false_positives ?? []).slice(0, 10),
    generation_time_ms:
      generationTimeMs != null && Number.isFinite(generationTimeMs)
        ? Math.round(generationTimeMs)
        : null,
  };

  assertObservatoryRowSafe(row as unknown as Record<string, unknown>);
  return row;
}

function aggregateTopRules(
  issueLogs: Array<{
    rule_id: string;
    confidence: string;
    matched_terms: string[];
    code: string;
  }>,
): ResumeQaShadowEventRow["top_rules"] {
  const map = new Map<string, { count: number; confidence: string; matched_terms: Set<string> }>();

  for (const log of issueLogs) {
    const existing = map.get(log.rule_id) ?? {
      count: 0,
      confidence: log.confidence,
      matched_terms: new Set<string>(),
    };
    existing.count += 1;
    if ((CONFIDENCE_RANK[log.confidence] ?? 0) > (CONFIDENCE_RANK[existing.confidence] ?? 0)) {
      existing.confidence = log.confidence;
    }
    for (const term of log.matched_terms ?? []) {
      existing.matched_terms.add(term.slice(0, 60));
    }
    map.set(log.rule_id, existing);
  }

  return [...map.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20)
    .map(([rule_id, stats]) => ({
      rule_id,
      count: stats.count,
      confidence: stats.confidence,
      matched_terms: sanitizeMatchedTerms([...stats.matched_terms]).slice(0, 8),
    }));
}

function summarizeConfidence(
  issueLogs: Array<{ confidence: string }>,
): { averageConfidence: number | null; highestConfidence: string | null } {
  if (issueLogs.length === 0) {
    return { averageConfidence: null, highestConfidence: null };
  }

  const ranks = issueLogs.map((l) => CONFIDENCE_RANK[l.confidence] ?? 2);
  const averageConfidence = Math.round((ranks.reduce((a, b) => a + b, 0) / ranks.length) * 1000) / 1000;
  const maxRank = Math.max(...ranks);
  const highestConfidence =
    Object.entries(CONFIDENCE_RANK).find(([, rank]) => rank === maxRank)?.[0] ?? "medium";

  return { averageConfidence, highestConfidence };
}

export interface ObservatoryPersistClient {
  from(table: string): {
    upsert(
      row: Record<string, unknown>,
      options?: { onConflict?: string },
    ): PromiseLike<{ error: { message: string } | null }>;
  };
}

/** Fire-and-forget DB persistence — never throws to caller. */
export async function persistResumeQaShadowEvent(
  client: ObservatoryPersistClient,
  row: ResumeQaShadowEventRow,
): Promise<void> {
  if (!row.request_id) {
    console.warn(
      JSON.stringify({
        event: "resume_qa_observatory_persist_skipped",
        reason: "missing_request_id",
      }),
    );
    return;
  }

  const { error } = await client.from("resume_qa_shadow_events").upsert(row, {
    onConflict: "request_id",
  });

  if (error) {
    console.warn(
      JSON.stringify({
        event: "resume_qa_observatory_persist_failed",
        request_id: row.request_id,
        error: error.message,
      }),
    );
    return;
  }

  console.log(
    JSON.stringify({
      event: "resume_qa_observatory_persisted",
      request_id: row.request_id,
      verdict: row.verdict,
      qa_score: row.qa_score,
    }),
  );
}
