import { describe, expect, it } from "vitest";
import {
  classifyContaminationPhrase,
  isLocationSummaryArtifactPhrase,
  isSectionHeaderArtifactPhrase,
  matchedTermLooksLikeArtifact,
} from "@signalyz/resumeQaEngine/contaminationArtifactClassifier";

describe("contaminationArtifactClassifier", () => {
  it("classifies NJ summary founding as summary_artifact (parser phantom)", () => {
    expect(classifyContaminationPhrase("NJ Summary Founding")).toBe("summary_artifact");
    expect(isLocationSummaryArtifactPhrase("nj summary founding")).toBe(true);
    expect(matchedTermLooksLikeArtifact("nj summary founding")).toBe(true);
  });

  it("classifies IL summary customer as summary_artifact", () => {
    expect(classifyContaminationPhrase("IL Summary Customer")).toBe("summary_artifact");
    expect(isLocationSummaryArtifactPhrase("il summary customer")).toBe(true);
  });

  it("classifies two-word state + summary as location_artifact", () => {
    expect(classifyContaminationPhrase("NJ Summary")).toBe("location_artifact");
  });

  it("classifies section header fragments as section_artifact", () => {
    expect(classifyContaminationPhrase("Summary Founding")).toBe("section_artifact");
    expect(isSectionHeaderArtifactPhrase("experience senior")).toBe(true);
  });

  it("classifies AI Sandbox as known_signature when flagged", () => {
    expect(classifyContaminationPhrase("AI Sandbox", { knownSignature: true })).toBe("known_signature");
  });

  it("classifies true cross-JD phrases as true_contamination", () => {
    expect(classifyContaminationPhrase("rapid prompt iteration")).toBe("true_contamination");
  });
});
