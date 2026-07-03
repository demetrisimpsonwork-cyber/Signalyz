import { describe, it, expect } from "vitest";
import {
  buildAnalysisRunFingerprint,
  fingerprintText,
  fingerprintsMatch,
} from "@/lib/analysisRunFingerprint";

describe("analysisRunFingerprint", () => {
  it("normalizes whitespace and case for stable fingerprints", () => {
    expect(fingerprintText("  CarMax   Customer\n  Specialist  ")).toBe(
      fingerprintText("carmax customer specialist"),
    );
  });

  it("matches when JD and resume fingerprints align", () => {
    const stored = buildAnalysisRunFingerprint({
      jdText: "Customer Specialist at CarMax",
      resumeText: "Demetri Simpson NJDOL support",
      runSessionKey: "1-2",
    });
    const current = buildAnalysisRunFingerprint({
      jdText: "Customer Specialist at CarMax",
      resumeText: "Demetri Simpson NJDOL support",
      runSessionKey: "1-2",
    });
    expect(fingerprintsMatch(stored, current)).toBe(true);
  });

  it("rejects when JD changes", () => {
    const stored = buildAnalysisRunFingerprint({
      jdText: "Justworks Customer Support Advocate",
      resumeText: "Same resume text",
      runSessionKey: "1-1",
    });
    const current = buildAnalysisRunFingerprint({
      jdText: "CarMax Customer Specialist",
      resumeText: "Same resume text",
      runSessionKey: "1-1",
    });
    expect(fingerprintsMatch(stored, current)).toBe(false);
  });

  it("rejects when resume changes", () => {
    const stored = buildAnalysisRunFingerprint({
      jdText: "CarMax JD",
      resumeText: "Resume version A with NJDOL",
      runSessionKey: "2-1",
    });
    const current = buildAnalysisRunFingerprint({
      jdText: "CarMax JD",
      resumeText: "Resume version B with Signalyz project",
      runSessionKey: "2-1",
    });
    expect(fingerprintsMatch(stored, current)).toBe(false);
  });

  it("rejects when run session key changes", () => {
    const stored = buildAnalysisRunFingerprint({
      jdText: "Staff AI Engineer",
      resumeText: "Technical resume",
      runSessionKey: "3-1",
    });
    const current = buildAnalysisRunFingerprint({
      jdText: "Staff AI Engineer",
      resumeText: "Technical resume",
      runSessionKey: "4-2",
    });
    expect(fingerprintsMatch(stored, current)).toBe(false);
  });
});
