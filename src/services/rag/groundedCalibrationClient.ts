import { parseResumeIntake } from "@/lib/resumeIntake";
import {
  mapClientEvidenceToPackage,
  normalizeEvidencePackage,
  type EvidencePackageItem,
} from "@signalyz/groundedCalibration";
import { getResumeSessionId, retrieveResumeEvidence } from "./resumeIngestion";

export { getResumeSessionId } from "./resumeIngestion";
export type { EvidencePackageItem, CalibratedBulletRecord, GroundingStatus } from "@signalyz/groundedCalibration";
export {
  buildEvidencePromptBlock,
  buildCalibratedBulletRecords,
  computeGroundingStatus,
  applyConservativeRewrite,
  findUnsupportedMetrics,
  findUnsupportedTools,
} from "@signalyz/groundedCalibration";

const DEFAULT_TOP_K = 5;

export function extractPrimaryResumeBullet(resumeText: string): string {
  const intake = parseResumeIntake(resumeText);
  for (const role of intake.sections.experience) {
    for (const responsibility of role.responsibilities) {
      const trimmed = responsibility.trim();
      if (trimmed.length >= 30) {
        return trimmed.replace(/^-\s*/, "");
      }
    }
  }

  const fallback = resumeText
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length >= 30);

  return fallback?.replace(/^-\s*/, "") || "";
}

export function buildCalibrationEvidenceQueries(params: {
  originalBullet: string;
  jd: string;
  missingSignal?: string | null;
}): string[] {
  const queries = [
    params.originalBullet.trim(),
    params.missingSignal?.trim() || "",
    params.jd.trim().slice(0, 500),
  ].filter((query) => query.length >= 8);

  return [...new Set(queries)];
}

export async function retrieveCalibrationEvidencePackage(params: {
  originalBullet: string;
  jd: string;
  missingSignal?: string | null;
  sessionId?: string;
  topK?: number;
}): Promise<EvidencePackageItem[]> {
  const sessionId = params.sessionId ?? getResumeSessionId();
  const topK = params.topK ?? DEFAULT_TOP_K;
  const queries = buildCalibrationEvidenceQueries(params);

  if (queries.length === 0) {
    return [];
  }

  const perQueryMatches = await Promise.all(
    queries.map((query) =>
      retrieveResumeEvidence(query, {
        topK,
        sessionId,
        matchThreshold: 0.45,
      }),
    ),
  );

  return normalizeEvidencePackage(
    mapClientEvidenceToPackage(
      perQueryMatches.flat().map((match) => ({
        id: match.id,
        content: match.content,
        similarity: match.similarity,
        metadata: match.metadata,
      })),
    ),
  ).slice(0, topK * 2);
}
