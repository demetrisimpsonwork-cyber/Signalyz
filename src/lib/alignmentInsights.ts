export interface AlignmentInsightEntry {
  id: string;
  created_at: string;
  inferred_role: string;
  score: number;
  strength_label: string;
  top_gap: string | null;
}

export interface ReadyVsRework {
  ready: number;
  needsRework: number;
}

export interface StrongestRoleInsight {
  role: string;
  avgScore: number;
  runCount: number;
}

export interface RepeatedBlockerInsight {
  blocker: string;
  count: number;
}

export interface RecommendedAction {
  message: string;
  ctaLabel?: string;
  ctaHref?: string;
}

export function getStrengthLabel(score: number): string {
  if (score >= 70) return "Interview Range";
  if (score >= 60) return "Strong";
  if (score >= 40) return "Moderate";
  return "Low Signal";
}

export function computeAverageScore(entries: AlignmentInsightEntry[]): number {
  if (entries.length === 0) return 0;
  return Math.round(entries.reduce((sum, entry) => sum + entry.score, 0) / entries.length);
}

export function computeReadyVsRework(entries: AlignmentInsightEntry[]): ReadyVsRework {
  const ready = entries.filter((entry) => entry.score >= 70).length;
  return { ready, needsRework: entries.length - ready };
}

export function getStrongestRole(entries: AlignmentInsightEntry[]): StrongestRoleInsight | null {
  if (entries.length === 0) return null;

  const byRole = new Map<string, { scores: number[]; latest: string }>();
  for (const entry of entries) {
    const role = entry.inferred_role || "Alignment Run";
    const existing = byRole.get(role) ?? { scores: [], latest: entry.created_at };
    existing.scores.push(entry.score);
    if (entry.created_at > existing.latest) existing.latest = entry.created_at;
    byRole.set(role, existing);
  }

  let best: (StrongestRoleInsight & { latest: string }) | null = null;
  for (const [role, data] of byRole) {
    const avgScore = Math.round(data.scores.reduce((sum, score) => sum + score, 0) / data.scores.length);
    const candidate = { role, avgScore, runCount: data.scores.length, latest: data.latest };
    if (
      !best ||
      avgScore > best.avgScore ||
      (avgScore === best.avgScore && data.latest > best.latest)
    ) {
      best = candidate;
    }
  }

  return best ? { role: best.role, avgScore: best.avgScore, runCount: best.runCount } : null;
}

export function getMostRepeatedBlocker(entries: AlignmentInsightEntry[]): RepeatedBlockerInsight | null {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const gap = entry.top_gap?.trim();
    if (!gap) continue;
    counts.set(gap, (counts.get(gap) ?? 0) + 1);
  }

  let best: RepeatedBlockerInsight | null = null;
  for (const [blocker, count] of counts) {
    if (!best || count > best.count) best = { blocker, count };
  }
  return best;
}

export function getRecentHighPotentialRuns(
  entries: AlignmentInsightEntry[],
  limit = 3,
): AlignmentInsightEntry[] {
  return entries.filter((entry) => entry.score >= 70).slice(0, limit);
}

function isImproving(entries: AlignmentInsightEntry[]): boolean {
  if (entries.length < 2) return false;
  return entries[0].score > entries[1].score;
}

export function getRecommendedNextAction(
  entries: AlignmentInsightEntry[],
  strongest: StrongestRoleInsight | null,
  repeatedBlocker: RepeatedBlockerInsight | null,
): RecommendedAction {
  if (entries.length === 0) {
    return {
      message: "Run your first Free Signal Preview.",
      ctaLabel: "New Analysis",
      ctaHref: "/?tab=alignment",
    };
  }

  const { ready } = computeReadyVsRework(entries);
  if (ready > 0) {
    return {
      message: "Review your ready-to-apply roles in History.",
      ctaLabel: "View Full History",
      ctaHref: "/history",
    };
  }

  const avg = computeAverageScore(entries);
  if (avg < 60 && repeatedBlocker) {
    return {
      message: "Strengthen the repeated blocker before applying.",
      ctaLabel: "New Analysis",
      ctaHref: "/?tab=alignment",
    };
  }

  if (isImproving(entries) && strongest) {
    return {
      message: `Keep testing roles that fit your strongest signal — ${strongest.role}.`,
      ctaLabel: "New Analysis",
      ctaHref: "/?tab=alignment",
    };
  }

  if (strongest) {
    return {
      message: `Keep testing roles that fit your strongest signal — ${strongest.role}.`,
      ctaLabel: "New Analysis",
      ctaHref: "/?tab=alignment",
    };
  }

  return {
    message: "Run another alignment to build your signal baseline.",
    ctaLabel: "New Analysis",
    ctaHref: "/?tab=alignment",
  };
}

export function parseAlignmentHistoryEntry(raw: unknown): AlignmentInsightEntry | null {
  try {
    if (!raw || typeof raw !== "object") return null;
    const row = raw as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : String(row.id ?? "");
    const created_at = typeof row.created_at === "string" ? row.created_at : "";
    const score = typeof row.score === "number" ? row.score : Number(row.score ?? NaN);
    if (!id || !created_at || Number.isNaN(score)) return null;

    const strength_label =
      typeof row.strength_label === "string" ? row.strength_label : getStrengthLabel(score);
    let inferred_role = typeof row.inferred_role === "string" ? row.inferred_role : "";
    const top_gap = typeof row.top_gap === "string" ? row.top_gap : null;

    if (inferred_role.length > 80 || inferred_role.includes("\n")) inferred_role = "";
    if (
      /^[A-Z][a-z]+\s+[A-Z][a-z]+\s/.test(inferred_role) &&
      !/(manager|lead|director|coordinator|supervisor|analyst|engineer|specialist|associate|officer)/i.test(
        inferred_role,
      )
    ) {
      inferred_role = "";
    }
    if (/^(managed|led|oversaw|coordinated|responsible|worked|developed|created|built)/i.test(inferred_role)) {
      inferred_role = "";
    }

    return {
      id,
      created_at,
      inferred_role: inferred_role || "Alignment Run",
      score,
      strength_label,
      top_gap,
    };
  } catch {
    return null;
  }
}
