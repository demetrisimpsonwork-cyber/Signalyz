import { LOW_BULLET_PRESERVATION_THRESHOLD } from "../scoreWeights.ts";
import { STANDARD_CODES } from "../diagnosticCodes.ts";
import type { SignalyzedStandardInput } from "../types.ts";
import type { SandboxRepairType } from "./types.ts";

const FORMATTING_RULE_PREFIX = "formatting.";
const FORMATTING_ARTIFACT_CODES = new Set([
  STANDARD_CODES.EXPORT_SPACED_HEADING,
  STANDARD_CODES.EXPORT_JSON_ARTIFACT,
]);

function simulatePreserveHighValueBullet(input: SignalyzedStandardInput): SignalyzedStandardInput {
  const bullet = input.bullet;
  if (!bullet) return input;

  const restored = bullet.weakened_bullet_count + bullet.restored_bullet_count;
  const ast = input.ast
    ? {
        ...input.ast,
        bullet_preservation_score: Math.max(
          input.ast.bullet_preservation_score,
          LOW_BULLET_PRESERVATION_THRESHOLD,
        ),
      }
    : input.ast;

  return {
    ...input,
    ast,
    bullet: {
      ...bullet,
      weakened_bullet_count: 0,
      restored_bullet_count: restored,
      preservation_ok: true,
    },
  };
}

function simulateRestoreSourceLink(input: SignalyzedStandardInput): SignalyzedStandardInput {
  const link = input.link;
  if (!link) return input;

  const restoredCount = Math.max(
    link.restored_link_count,
    Math.max(0, link.source_link_count - link.generated_link_count_before),
  );

  const exportSummary = input.export
    ? {
        ...input.export,
        link_count: Math.max(input.export.link_count, link.source_link_count),
        missing_expected_link_count: 0,
        diagnostic_codes: (input.export.diagnostic_codes ?? []).filter(
          (c) => c !== STANDARD_CODES.LINKS_MISSING_EXPECTED,
        ),
      }
    : input.export;

  return {
    ...input,
    link: {
      ...link,
      generated_link_count_after: link.source_link_count,
      restored_link_count: restoredCount,
      preservation_ok: true,
    },
    export: exportSummary,
  };
}

function simulateDedupeBullets(input: SignalyzedStandardInput): SignalyzedStandardInput {
  const qa = input.qa;
  if (!qa) return input;

  const issue_logs = (qa.issue_logs ?? []).filter(
    (i) => i.code !== "formatting_duplicate_bullets" && i.rule_id !== "formatting.duplicate_bullets",
  );
  const issue_categories = { ...qa.issue_categories };
  if (issue_categories.formatting) {
    issue_categories.formatting = Math.max(0, issue_categories.formatting - 1);
  }

  const bullet = input.bullet
    ? { ...input.bullet, duplicate_bullet_count: 0 }
    : input.bullet;

  return {
    ...input,
    qa: {
      ...qa,
      issue_logs,
      issue_categories,
      warning_count: Math.max(0, qa.warning_count - 1),
    },
    bullet,
  };
}

function simulateFormattingCleanup(input: SignalyzedStandardInput): SignalyzedStandardInput {
  const qa = input.qa;
  const cleanedQa = qa
    ? {
        ...qa,
        issue_logs: (qa.issue_logs ?? []).filter(
          (i) =>
            !i.rule_id.startsWith(FORMATTING_RULE_PREFIX) ||
            i.code === "formatting_duplicate_bullets",
        ),
        issue_categories: Object.fromEntries(
          Object.entries(qa.issue_categories ?? {}).filter(([k]) => k !== "formatting"),
        ),
        warning_count: Math.max(
          0,
          qa.warning_count -
            (qa.issue_logs ?? []).filter((i) => i.rule_id.startsWith(FORMATTING_RULE_PREFIX)).length,
        ),
      }
    : qa;

  const exportSummary = input.export
    ? {
        ...input.export,
        diagnostic_codes: (input.export.diagnostic_codes ?? []).filter(
          (c) => !FORMATTING_ARTIFACT_CODES.has(c),
        ),
      }
    : input.export;

  return {
    ...input,
    qa: cleanedQa,
    export: exportSummary,
  };
}

/** Apply an in-memory sandbox repair proposal to sanitized summaries only — never raw resume text. */
export function simulateRepair(
  input: SignalyzedStandardInput,
  sandboxRepairType: SandboxRepairType,
): SignalyzedStandardInput {
  switch (sandboxRepairType) {
    case "preserve_high_value_bullet":
      return simulatePreserveHighValueBullet(input);
    case "restore_source_link":
      return simulateRestoreSourceLink(input);
    case "dedupe_bullets":
      return simulateDedupeBullets(input);
    case "formatting_cleanup":
      return simulateFormattingCleanup(input);
    default:
      return input;
  }
}
