/**
 * High-Value Bullet Preservation Guard — Phase 3E.
 *
 * Root cause: assemble-calibrated-resume Phase 2 rewrite collapses rich Signalyz bullets
 * (e.g. "converts resumes and JDs into structured outputs") into JD-echo phrases like
 * "parses resumes". Restores verbatim source-supported bullets only — never invents.
 */
import {
  BULLET_REGRESSION_PATTERNS,
  countProtectedConcepts,
} from "../resumeQaEngine/bulletRegressionPatterns.ts";
import { extractBulletsFromLines, tokenizeMeaningful } from "../resumeQaEngine/types.ts";
import type { ResumeBulletPreservationReport } from "./types.ts";

export interface CalibratedResumeBulletShape {
  summary?: string;
  experience?: Array<{
    title?: string;
    company?: string;
    dates?: string;
    bullets?: string[];
  }>;
  independent_projects?: Array<{
    name?: string;
    description?: string;
    bullets?: string[];
  }>;
}

const BLOCKED_LOG =
  /resume_text|jd_text|original_resume|generated_resume|bullet_text|@|\.com|phone:|mailto:|https?:\/\//i;

function normalizeBullet(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function bulletAlreadyPresent(candidate: string, peerBullets: string[]): boolean {
  const norm = normalizeBullet(candidate);
  const candidateTokens = tokenizeMeaningful(candidate);
  for (const b of peerBullets) {
    const other = normalizeBullet(b);
    if (other === norm) return true;
    const peerTokens = tokenizeMeaningful(b);
    const overlap = tokenOverlap(candidate, b);
    const minTokens = Math.min(candidateTokens.length, peerTokens.length);
    if (minTokens >= 4 && overlap / minTokens >= 0.65) return true;
    const shorter = norm.length < other.length ? norm : other;
    const longer = norm.length >= other.length ? norm : other;
    if (shorter.length >= 24 && longer.includes(shorter)) return true;
  }
  return false;
}

function tokenOverlap(a: string, b: string): number {
  const aTokens = new Set(tokenizeMeaningful(a));
  return tokenizeMeaningful(b).filter((t) => aTokens.has(t)).length;
}

function findSourceMatch(
  generatedBullet: string,
  sourceBullets: string[],
): { sourceBullet: string; patternLabel: string } | null {
  for (const pattern of BULLET_REGRESSION_PATTERNS) {
    if (!pattern.weakenedRx.test(generatedBullet)) continue;
    const sourceHit = sourceBullets.find((b) => pattern.sourceRx.test(b));
    if (sourceHit && !pattern.sourceRx.test(generatedBullet)) {
      return { sourceBullet: sourceHit, patternLabel: pattern.label };
    }
  }

  for (const sourceBullet of sourceBullets) {
    const sourceConcepts = countProtectedConcepts(sourceBullet);
    if (sourceConcepts === 0) continue;
    const genConcepts = countProtectedConcepts(generatedBullet);
    if (genConcepts >= sourceConcepts) continue;
    if (tokenOverlap(sourceBullet, generatedBullet) >= 2) {
      return { sourceBullet, patternLabel: "protected concept scope weakened" };
    }
  }

  return null;
}

function collectAllBullets(resume: CalibratedResumeBulletShape): string[] {
  const bullets: string[] = [];
  for (const exp of resume.experience ?? []) {
    bullets.push(...(exp.bullets ?? []).filter(Boolean));
  }
  for (const proj of resume.independent_projects ?? []) {
    bullets.push(...(proj.bullets ?? []).filter(Boolean));
  }
  return bullets;
}

export interface BulletPreservationResult<T extends CalibratedResumeBulletShape> {
  resume: T;
  report: ResumeBulletPreservationReport;
  restored: boolean;
}

/** Restore source-supported bullets weakened by assembly rewrite. Never invents content. */
export function applyBulletPreservationGuard<T extends CalibratedResumeBulletShape>(input: {
  sourceResumeText: string;
  resume: T;
  requestId?: string;
}): BulletPreservationResult<T> {
  const started = performance.now();
  const sourceBullets = extractBulletsFromLines(input.sourceResumeText);
  const resume = structuredClone(input.resume);

  let protectedCount = 0;
  let weakenedCount = 0;
  let restoredCount = 0;
  let duplicateCount = 0;
  const affectedSections = new Set<string>();
  let hallucinationGuardPassed = true;

  for (const sourceBullet of sourceBullets) {
    if (countProtectedConcepts(sourceBullet) > 0) protectedCount += 1;
  }

  const allBulletsBefore = collectAllBullets(resume);

  for (const exp of resume.experience ?? []) {
    if (!exp.bullets?.length) continue;
    for (let i = 0; i < exp.bullets.length; i++) {
      const generated = exp.bullets[i]!;
      const match = findSourceMatch(generated, sourceBullets);
      if (!match) continue;

      weakenedCount += 1;
      affectedSections.add("experience");

      if (!sourceBullets.includes(match.sourceBullet)) {
        hallucinationGuardPassed = false;
        continue;
      }

      const peerBullets = (exp.bullets ?? []).filter(
        (b, idx) => idx !== i && Boolean(b?.trim()),
      );
      if (bulletAlreadyPresent(match.sourceBullet, peerBullets)) {
        duplicateCount += 1;
        continue;
      }

      exp.bullets[i] = match.sourceBullet;
      restoredCount += 1;
    }
  }

  const preservationOk = weakenedCount === 0 || restoredCount >= weakenedCount;

  const report: ResumeBulletPreservationReport = {
    event: "resume_bullet_preservation_report",
    request_id: input.requestId,
    protected_bullet_count: protectedCount,
    weakened_bullet_count: weakenedCount,
    restored_bullet_count: restoredCount,
    duplicate_bullet_count: duplicateCount,
    hallucination_guard_passed: hallucinationGuardPassed,
    preservation_ok: preservationOk,
    affected_sections: [...affectedSections],
    run_time_ms: Math.round(performance.now() - started),
  };

  assertBulletPreservationReportSafe(report);
  return { resume, report, restored: restoredCount > 0 };
}

export function assertBulletPreservationReportSafe(report: ResumeBulletPreservationReport): void {
  const serialized = JSON.stringify(report);
  if (serialized.length > 1200) {
    throw new Error("resume_bullet_preservation_report: payload too large");
  }
  if (BLOCKED_LOG.test(serialized)) {
    throw new Error("resume_bullet_preservation_report: blocked content");
  }
}

export function logBulletPreservationReport(report: ResumeBulletPreservationReport): void {
  assertBulletPreservationReportSafe(report);
  console.log(JSON.stringify(report));
}
