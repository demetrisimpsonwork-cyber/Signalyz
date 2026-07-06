import type { SignalyzedStandardEventRow } from "./types.ts";
import { SIGNALYZED_STANDARD_VERSION } from "./types.ts";

export type StandardPhaseMilestone = "phase3c" | "phase3d" | "phase3e";

export interface StandardEventRowWithMeta extends SignalyzedStandardEventRow {
  id?: string;
  created_at?: string;
}

export interface DashboardFilterOptions {
  days?: number;
  last?: number;
  sinceVersion?: StandardPhaseMilestone | string;
  excludeLegacy?: boolean;
  onlyNewStandardVersion?: string;
  source?: "auto" | "repair-events" | "standard-inferred";
  repairType?: string;
}

/** Pre-3E production smoke export ids (Phase 3C/3D). */
export const LEGACY_EXPORT_ID_PREFIXES = ["prod-3c-", "prod-3d-"] as const;

/** Phase 3E+ production smoke export ids. */
export const PHASE3E_EXPORT_ID_PREFIXES = ["prod-3e-", "prod-3g-"] as const;

export function isLegacyStandardRow(row: { export_id?: string | null }): boolean {
  const id = row.export_id ?? "";
  return LEGACY_EXPORT_ID_PREFIXES.some((p) => id.startsWith(p));
}

export function isPhase3eOrLaterRow(
  row: Pick<SignalyzedStandardEventRow, "export_id" | "source_reports_present" | "standard_version">,
): boolean {
  if (isLegacyStandardRow(row)) return false;
  const id = row.export_id ?? "";
  if (PHASE3E_EXPORT_ID_PREFIXES.some((p) => id.startsWith(p))) return true;
  if (row.source_reports_present?.bullet === true) return true;
  return false;
}

export function matchesSinceVersion(
  row: Pick<SignalyzedStandardEventRow, "export_id" | "source_reports_present" | "standard_version">,
  sinceVersion: string,
): boolean {
  switch (sinceVersion) {
    case "phase3e":
      return isPhase3eOrLaterRow(row);
    case "phase3d":
      return !row.export_id?.startsWith("prod-3c-");
    case "phase3c":
      return true;
    default:
      return row.standard_version === sinceVersion;
  }
}

export function parseDashboardCliArgs(argv: string[] = process.argv): DashboardFilterOptions {
  const options: DashboardFilterOptions = {};

  const daysArg = argv.find((a) => a.startsWith("--days="));
  if (daysArg) options.days = Number(daysArg.split("=")[1]);

  const lastArg = argv.find((a) => a.startsWith("--last="));
  if (lastArg) options.last = Number(lastArg.split("=")[1]);

  const sinceArg = argv.find((a) => a.startsWith("--since-version="));
  if (sinceArg) options.sinceVersion = sinceArg.split("=")[1];

  if (argv.includes("--exclude-legacy")) options.excludeLegacy = true;

  const versionArg = argv.find((a) => a.startsWith("--only-new-standard-version="));
  if (versionArg) options.onlyNewStandardVersion = versionArg.split("=")[1];

  const sourceArg = argv.find((a) => a.startsWith("--source="));
  if (sourceArg) {
    const value = sourceArg.split("=")[1];
    if (value === "auto" || value === "repair-events" || value === "standard-inferred") {
      options.source = value;
    }
  }

  const repairTypeArg = argv.find((a) => a.startsWith("--repair-type="));
  if (repairTypeArg) options.repairType = repairTypeArg.split("=")[1];

  return options;
}

export function filterStandardEventRows<T extends StandardEventRowWithMeta>(
  rows: T[],
  options: DashboardFilterOptions,
): T[] {
  let filtered = [...rows];

  if (options.onlyNewStandardVersion) {
    filtered = filtered.filter((r) => r.standard_version === options.onlyNewStandardVersion);
  }

  if (options.sinceVersion) {
    filtered = filtered.filter((r) => matchesSinceVersion(r, options.sinceVersion!));
  }

  if (options.excludeLegacy) {
    filtered = filtered.filter((r) => !isLegacyStandardRow(r));
  }

  if (options.last != null && options.last > 0) {
    filtered = filtered.slice(0, options.last);
  }

  return filtered;
}

export interface RepairEventRowFilterable {
  export_id?: string | null;
  created_at?: string;
}

export function filterRepairEventRows<T extends RepairEventRowFilterable>(
  rows: T[],
  options: DashboardFilterOptions,
): T[] {
  let filtered = [...rows];

  if (options.sinceVersion) {
    filtered = filtered.filter((r) =>
      matchesSinceVersion(
        {
          export_id: r.export_id,
          source_reports_present: {},
          standard_version: SIGNALYZED_STANDARD_VERSION,
        },
        options.sinceVersion!,
      ),
    );
  }

  if (options.excludeLegacy) {
    filtered = filtered.filter((r) => !isLegacyStandardRow(r));
  }

  if (options.last != null && options.last > 0) {
    filtered = filtered.slice(0, options.last);
  }

  return filtered;
}

export function splitLegacyAndNewRows<T extends StandardEventRowWithMeta>(rows: T[]): {
  legacy: T[];
  newOnly: T[];
  legacyAdjusted: T[];
} {
  const legacy = rows.filter(isLegacyStandardRow);
  const newOnly = rows.filter(isPhase3eOrLaterRow);
  const legacyAdjusted = rows.filter((r) => !isLegacyStandardRow(r));
  return { legacy, newOnly, legacyAdjusted };
}

export { SIGNALYZED_STANDARD_VERSION };
