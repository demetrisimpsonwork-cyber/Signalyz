import { describe, it, expect } from "vitest";
import {
  extractJsonFromModelResponse,
  stripModelJsonFences,
} from "../../supabase/functions/_shared/extractJson";

describe("stripModelJsonFences", () => {
  it("removes markdown json fences", () => {
    expect(stripModelJsonFences("```json\n{\"a\":1}\n```")).toBe('{"a":1}');
  });
});

describe("extractJsonFromModelResponse", () => {
  it("parses clean JSON directly", () => {
    const result = extractJsonFromModelResponse('{"role_dna":[],"optimized_summary":"test"}');
    expect(result.usedBraceFallback).toBe(false);
    expect(result.data.optimized_summary).toBe("test");
  });

  it("parses JSON wrapped in markdown fences", () => {
    const result = extractJsonFromModelResponse("```json\n{\"role_dna\":[]}\n```");
    expect(result.usedBraceFallback).toBe(false);
    expect(result.data.role_dna).toEqual([]);
  });

  it("uses brace fallback when prose precedes JSON", () => {
    const result = extractJsonFromModelResponse(
      'Here is the analysis:\n{"role_dna":[{"pillar":"inventory"}]}',
    );
    expect(result.usedBraceFallback).toBe(true);
    expect((result.data.role_dna as Array<{ pillar: string }>)[0].pillar).toBe("inventory");
  });

  it("uses brace fallback when prose follows JSON", () => {
    const result = extractJsonFromModelResponse('{"role_dna":[]}\nHope this helps.');
    expect(result.usedBraceFallback).toBe(true);
    expect(result.data.role_dna).toEqual([]);
  });

  it("throws JSON_EXTRACT_FAIL on truncated JSON", () => {
    expect(() => extractJsonFromModelResponse('{"role_dna":[')).toThrow("JSON_EXTRACT_FAIL");
  });

  it("throws JSON_EXTRACT_FAIL when no JSON object is present", () => {
    expect(() => extractJsonFromModelResponse("No JSON here.")).toThrow("JSON_EXTRACT_FAIL");
  });
});
