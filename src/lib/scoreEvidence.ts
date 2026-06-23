/**
 * Shared scoring evidence helpers — used across alignment, history, and diagnostics.
 *
 * R3A grounded scoring metadata: see scoringEvidenceTypes.ts.
 * scoring_evidence must never create evidence — only reference evidencePackage
 * or calibrated_bullets.used_evidence; otherwise linkage = "absent".
 */

export interface ScoringBreakdown {
  role_outcomes_alignment: number;
  tools_and_workflow_alignment: number;
  domain_and_context_alignment: number;
  context_and_scale_alignment: number;
  communication_and_leadership_alignment: number;
}

export interface BreakdownRow {
  label: string;
  weight: string;
  value: number;
}

export const SCORE_BREAKDOWN_DIMENSIONS: Array<{ key: keyof ScoringBreakdown; label: string; weight: string }> = [
  { key: "role_outcomes_alignment", label: "Role Outcomes Alignment", weight: "30%" },
  { key: "tools_and_workflow_alignment", label: "Tools & Workflow Alignment", weight: "20%" },
  { key: "domain_and_context_alignment", label: "Domain & Context Alignment", weight: "20%" },
  { key: "context_and_scale_alignment", label: "Context & Scale Alignment", weight: "15%" },
  { key: "communication_and_leadership_alignment", label: "Communication & Leadership", weight: "15%" },
];

const GAP_HEURISTIC =
  /missing|lacks?|absent|no evidence|weak|gap|not\s|without|insufficient|unclear|not\s+demonstrated|under-?signal/i;
const STRENGTH_HEURISTIC = /aligns?\s+with|translates?\s+to|demonstrates?|shows?|detected|evidenced/i;

export function parseScoreRationale(scoreRationale?: string[]): { strengths: string[]; gaps: string[] } {
  const strengths: string[] = [];
  const gaps: string[] = [];
  if (!Array.isArray(scoreRationale)) return { strengths, gaps };

  for (const raw of scoreRationale) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const cleaned = raw.replace(/^\[(STRENGTH|GAP)\]\s*/i, "").trim();
    if (!cleaned) continue;
    if (/^\[STRENGTH\]/i.test(raw)) strengths.push(cleaned);
    else if (/^\[GAP\]/i.test(raw)) gaps.push(cleaned);
    else if (GAP_HEURISTIC.test(raw) && !STRENGTH_HEURISTIC.test(raw)) gaps.push(cleaned);
    else strengths.push(cleaned);
  }

  return { strengths, gaps };
}

export function extractScoringBreakdown(raw: unknown): ScoringBreakdown | null {
  if (!raw || typeof raw !== "object") return null;
  const sb = raw as Record<string, unknown>;
  const result = {} as ScoringBreakdown;
  let found = 0;

  for (const dim of SCORE_BREAKDOWN_DIMENSIONS) {
    const v = sb[dim.key];
    if (typeof v === "number" && isFinite(v)) {
      result[dim.key] = Math.max(0, Math.min(100, v));
      found++;
    }
  }

  return found > 0 ? result : null;
}

export function breakdownToRows(breakdown: ScoringBreakdown | null | undefined): BreakdownRow[] {
  if (!breakdown) return [];
  return SCORE_BREAKDOWN_DIMENSIONS.map((d) => ({
    label: d.label,
    weight: d.weight,
    value: breakdown[d.key] ?? 0,
  }));
}

export function extractPrimaryBlocker(raw: Record<string, unknown>): string | null {
  try {
    const igd = (raw.signal_model as Record<string, unknown> | undefined)?.interview_gap_diagnosis
      ?? raw.interview_gap_diagnosis;
    if (!igd || typeof igd !== "object") return null;
    const pb = (igd as Record<string, unknown>).primary_blocker ?? (igd as Record<string, unknown>).primary_issue;
    return typeof pb === "string" && pb.trim() ? pb : null;
  } catch {
    return null;
  }
}
