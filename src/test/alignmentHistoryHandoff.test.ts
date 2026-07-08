import { describe, expect, it, beforeEach } from "vitest";
import {
  consumeHistoryAnalyzeHandoff,
  setHistoryAnalyzeHandoff,
} from "@/lib/alignmentHistoryHandoff";

describe("alignmentHistoryHandoff", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("round-trips resume and jd through sessionStorage", () => {
    setHistoryAnalyzeHandoff({
      resume_text: "Alex Rivera\nEngineer",
      jd_text: "Applied AI Engineer role",
    });
    expect(consumeHistoryAnalyzeHandoff()).toEqual({
      resume_text: "Alex Rivera\nEngineer",
      jd_text: "Applied AI Engineer role",
    });
    expect(consumeHistoryAnalyzeHandoff()).toBeNull();
  });

  it("rejects empty payloads", () => {
    setHistoryAnalyzeHandoff({ resume_text: "   ", jd_text: "JD" });
    expect(consumeHistoryAnalyzeHandoff()).toBeNull();
  });
});
