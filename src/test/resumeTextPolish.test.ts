import { describe, it, expect } from "vitest";
import { polishResumeText } from "@/lib/resumeTextPolish";

describe("resumeTextPolish — missing articles (Phase 9.8)", () => {
  it("adds 'a' to 'across decentralized support environment'", () => {
    expect(polishResumeText("Executed accurately across decentralized support environment.")).toBe(
      "Executed accurately across a decentralized support environment.",
    );
  });

  it("adds 'a' to 'across property management portfolio'", () => {
    expect(polishResumeText("Managed workflows across property management portfolio.")).toBe(
      "Managed workflows across a property management portfolio.",
    );
  });

  it("adds 'a' to 'in regulated environment'", () => {
    expect(polishResumeText("Delivered support for shareholders in regulated environment.")).toBe(
      "Delivered support for shareholders in a regulated environment.",
    );
  });

  it("does not double an existing article", () => {
    const input = "Executed accurately across a decentralized support environment.";
    expect(polishResumeText(input)).toBe(input);
  });

  it("does not insert an article before a plural noun", () => {
    const input = "Administered workflows across multiple simultaneous support streams.";
    expect(polishResumeText(input)).toBe(input);
  });

  it("does not insert an article before a determiner", () => {
    const input = "Worked in the regulated environment daily.";
    expect(polishResumeText(input)).toBe(input);
  });
});

describe("resumeTextPolish — phrasing normalization (Phase 9.8)", () => {
  it("converts 'running at same time' to 'running simultaneously'", () => {
    expect(
      polishResumeText("Handled multiple concurrent workstreams running at same time."),
    ).toBe("Handled multiple concurrent workstreams running simultaneously.");
  });

  it("does not touch the correct 'at the same time'", () => {
    const input = "Managed several cases at the same time without errors.";
    expect(polishResumeText(input)).toBe(input);
  });
});

describe("resumeTextPolish — existing protections still hold (Phase 9.8)", () => {
  it("keeps SAP uppercase", () => {
    const input = "Administered workflows across Salesforce, SAP, and Adobe.";
    expect(polishResumeText(input)).toBe(input);
    expect(polishResumeText(input)).toContain("SAP");
  });

  it("keeps hyphenated 'follow-through' intact", () => {
    const input = "Handled financial disputes with consistent follow-through and sound judgment.";
    expect(polishResumeText(input)).toBe(input);
    expect(polishResumeText(input)).toContain("follow-through");
  });

  it("does not alter a leading 'Independently' verb", () => {
    const input = "Independently built a full AI-powered platform.";
    expect(polishResumeText(input)).toBe(input);
  });

  it("does not alter a leading 'Demonstrated' verb", () => {
    const input = "Demonstrated accuracy across all client correspondence.";
    expect(polishResumeText(input)).toBe(input);
  });

  it("does not introduce a 'Skills:' bullet", () => {
    const input = "Built internal knowledge base documentation and support protocols.";
    expect(polishResumeText(input)).not.toMatch(/skills\s*:/i);
  });
});
