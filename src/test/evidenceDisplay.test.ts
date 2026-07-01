import { describe, it, expect } from "vitest";
import {
  capEvidenceExcerpt,
  formatDuplicateEvidenceNote,
  shortenSignalLabel,
} from "@/lib/evidenceDisplay";

describe("evidenceDisplay", () => {
  it("caps long resume evidence excerpts", () => {
    const long =
      "Customer support professional with 7+ years delivering high-quality, empathy-driven support in fast-paced, regulated environments. Experienced handling high-volume inbound inquiries across email and phone — consistently prioritizing accuracy, clarity, and user trust at scale.";
    const capped = capEvidenceExcerpt(long, 120);
    expect(capped.length).toBeLessThanOrEqual(121);
    expect(capped.endsWith("…") || capped.endsWith(".")).toBe(true);
  });

  it("formats duplicate evidence notes without internal debug tone", () => {
    const note = formatDuplicateEvidenceNote("credit and claims");
    expect(note).toContain("shown above");
    expect(note).not.toContain("not repeated here");
  });

  it("shortens very long signal labels used as registry keys", () => {
    const long =
      "No evidence of retail, counter sales, or inbound product sales experience — Graybar explicitly prefers retail";
    expect(shortenSignalLabel(long, 40).length).toBeLessThanOrEqual(41);
  });
});
