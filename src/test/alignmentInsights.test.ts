import { describe, expect, it } from "vitest";
import {
  computeAverageScore,
  computeReadyVsRework,
  getMostRepeatedBlocker,
  getRecentHighPotentialRuns,
  getRecommendedNextAction,
  getStrongestRole,
  type AlignmentInsightEntry,
} from "@/lib/alignmentInsights";

const entries: AlignmentInsightEntry[] = [
  {
    id: "1",
    created_at: "2026-07-06T12:00:00.000Z",
    inferred_role: "AI Engineer",
    score: 72,
    strength_label: "Interview Range",
    top_gap: "Evaluation depth",
  },
  {
    id: "2",
    created_at: "2026-07-05T12:00:00.000Z",
    inferred_role: "Customer Success Manager",
    score: 58,
    strength_label: "Moderate",
    top_gap: "Renewal outcomes",
  },
  {
    id: "3",
    created_at: "2026-07-04T12:00:00.000Z",
    inferred_role: "AI Engineer",
    score: 65,
    strength_label: "Strong",
    top_gap: "Evaluation depth",
  },
];

describe("alignmentInsights", () => {
  it("computes average and buckets", () => {
    expect(computeAverageScore(entries)).toBe(65);
    expect(computeReadyVsRework(entries)).toEqual({ ready: 1, needsRework: 2 });
  });

  it("finds strongest role and repeated blocker", () => {
    expect(getStrongestRole(entries)).toEqual({
      role: "AI Engineer",
      avgScore: 69,
      runCount: 2,
    });
    expect(getMostRepeatedBlocker(entries)).toEqual({
      blocker: "Evaluation depth",
      count: 2,
    });
  });

  it("returns recent high-potential runs", () => {
    expect(getRecentHighPotentialRuns(entries).map((e) => e.id)).toEqual(["1"]);
  });

  it("recommends history when ready runs exist", () => {
    const action = getRecommendedNextAction(
      entries,
      getStrongestRole(entries),
      getMostRepeatedBlocker(entries),
    );
    expect(action.message).toContain("ready-to-apply");
    expect(action.ctaHref).toBe("/history");
  });

  it("recommends first run when empty", () => {
    const action = getRecommendedNextAction([], null, null);
    expect(action.message).toContain("Free Signal Preview");
  });
});
