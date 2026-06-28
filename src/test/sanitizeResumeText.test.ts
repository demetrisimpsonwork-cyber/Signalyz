import { describe, it, expect } from "vitest";
import { sanitizeResumeText } from "@/lib/sanitize";

describe("sanitizeResumeText", () => {
  it("strips HTML tags and decodes entities without corrupting '&'", () => {
    const out = sanitizeResumeText("<p>Sales &amp; Marketing</p> lead");
    expect(out).not.toMatch(/<p>/);
    expect(out).toContain("Sales & Marketing");
  });

  it("normalizes smart quotes and ellipsis", () => {
    const out = sanitizeResumeText("\u201COwned\u201D the \u2018process\u2019\u2026");
    expect(out).toContain('"Owned"');
    expect(out).toContain("'process'");
    expect(out).toContain("...");
  });

  it("removes zero-width and non-breaking-space artifacts", () => {
    const out = sanitizeResumeText("Man\u200Bager\u00A0role\uFEFF");
    expect(out).toBe("Manager role");
  });

  it("preserves '<5%' style content (no false tag match)", () => {
    const out = sanitizeResumeText("Maintained <5% error rate");
    expect(out).toContain("<5% error rate");
  });

  it("collapses runaway blank lines but preserves paragraph breaks", () => {
    const out = sanitizeResumeText("Line one\n\n\n\nLine two");
    expect(out).toBe("Line one\n\nLine two");
  });
});
