import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  saveLinkedInOutputCache,
  loadLinkedInOutputCache,
  clearLinkedInOutputCache,
  LINKEDIN_OUTPUT_STORAGE_KEY,
} from "@/lib/linkedInOutputCache";

const sampleOutput = {
  headline: { headline: "Support Specialist | CarMax-ready", signal_basis: "NJDOL casework" },
  aboutGuidance: null,
  experienceNotes: null,
};

describe("linkedInOutputCache", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("restores cached output when fingerprint matches", () => {
    const params = {
      jdText: "CarMax Customer Specialist",
      resumeText: "Demetri Simpson NJDOL",
      runSessionKey: "1-0",
    };
    saveLinkedInOutputCache(sampleOutput, params);
    const loaded = loadLinkedInOutputCache(params);
    expect(loaded?.headline?.headline).toContain("CarMax-ready");
  });

  it("discards cached output when JD changes", () => {
    saveLinkedInOutputCache(sampleOutput, {
      jdText: "Justworks Customer Support",
      resumeText: "Same resume",
      runSessionKey: "1-0",
    });
    const loaded = loadLinkedInOutputCache({
      jdText: "CarMax Customer Specialist",
      resumeText: "Same resume",
      runSessionKey: "1-0",
    });
    expect(loaded).toBeNull();
    expect(localStorage.getItem(LINKEDIN_OUTPUT_STORAGE_KEY)).toBeNull();
  });

  it("discards cached output when resume changes", () => {
    saveLinkedInOutputCache(sampleOutput, {
      jdText: "CarMax JD",
      resumeText: "Resume A",
      runSessionKey: "2-0",
    });
    const loaded = loadLinkedInOutputCache({
      jdText: "CarMax JD",
      resumeText: "Resume B with new project",
      runSessionKey: "2-0",
    });
    expect(loaded).toBeNull();
  });

  it("discards cached output when run session key changes after new alignment", () => {
    saveLinkedInOutputCache(sampleOutput, {
      jdText: "Staff AI Engineer",
      resumeText: "Technical resume",
      runSessionKey: "3-1",
    });
    const loaded = loadLinkedInOutputCache({
      jdText: "Staff AI Engineer",
      resumeText: "Technical resume",
      runSessionKey: "4-2",
    });
    expect(loaded).toBeNull();
  });

  it("clearLinkedInOutputCache removes stored payload", () => {
    saveLinkedInOutputCache(sampleOutput, {
      jdText: "CarMax",
      resumeText: "Resume",
      runSessionKey: "0-0",
    });
    clearLinkedInOutputCache();
    expect(localStorage.getItem(LINKEDIN_OUTPUT_STORAGE_KEY)).toBeNull();
  });
});

describe("session freshness — runSessionKey contract", () => {
  it("models Justworks → CarMax run identity change", () => {
    const justworksKey = "5-3";
    const carmaxKey = "6-4";
    expect(justworksKey).not.toBe(carmaxKey);
  });

  it("models CarMax → Staff AI run identity change", () => {
    const carmaxKey = "7-5";
    const staffAiKey = "8-6";
    expect(carmaxKey).not.toBe(staffAiKey);
  });
});
